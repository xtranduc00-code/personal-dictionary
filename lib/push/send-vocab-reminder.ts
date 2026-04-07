import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/push/web-push-config";
import { shouldDropPushSubscription } from "@/lib/push/should-drop-push-subscription";
import { getCalendarEventStorageTimeZone } from "@/lib/calendar/event-start-utc";

export type VocabItem = {
  word: string;
  explanation?: string;
  /** Brief 3-5 word definition for push notification title (e.g. "personal free time"). */
  shortDefinition?: string;
  example?: string;
  /**
   * Optional list of extra example sentences (same word, different usage).
   * Push picks one per 10-min bucket so the line changes over time without any API call.
   */
  examples?: string[];
  /** Preferred: fully-formed sentences generated and stored ahead of time. */
  sentences?: string[];
  /** Part of speech abbreviation (N, V, Adj, Adv, etc.) */
  partOfSpeech?: string;
  /** From vocabulary notes (`flashcard_cards`); notification opens `/flashcards`. */
  pushOpenFlashcards?: boolean;
};

/** Abbreviate part-of-speech for notification title. */
function posAbbrev(pos: string): string {
  const p = pos.trim().toLowerCase();
  if (p === "noun" || p === "n") return "N";
  if (p === "verb" || p === "v") return "V";
  if (p === "adjective" || p === "adj") return "Adj";
  if (p === "adverb" || p === "adv") return "Adv";
  if (p === "preposition" || p === "prep") return "Prep";
  if (p === "conjunction" || p === "conj") return "Conj";
  if (p === "pronoun" || p === "pron") return "Pron";
  if (p === "interjection" || p === "interj") return "Interj";
  if (p === "determiner" || p === "det") return "Det";
  if (p === "phrase") return "Phrase";
  if (p === "idiom") return "Idiom";
  // Already abbreviated or unknown — capitalize first letter
  return pos.charAt(0).toUpperCase() + pos.slice(1).toLowerCase();
}

function normalizeWordKey(word: string): string {
  return word.trim().replace(/\s+/g, " ").toLowerCase();
}

const TRIVIAL_PUSH_WORDS = new Set(
  [
    // common fillers / glue words that tend to produce low-signal pushes
    "and",
    "also",
    "can",
    "like",
    "see",
    "bet",
    "quit",
    "numbers",
    "generally",
    "improve",
    "important",
    "easy",
    "tired",
    "hungry",
    "wrong",
    "scared",
    "lazy",
    // keep list small; heuristics below catch most remaining basics
  ].map((w) => w.toLowerCase()),
);

function examplePoolForItem(item: VocabItem): string[] {
  const pool: string[] = [];
  const add = (s: unknown) => {
    if (typeof s !== "string") return;
    const t = s.trim();
    if (!t) return;
    if (!pool.some((x) => x.toLowerCase() === t.toLowerCase())) pool.push(t);
  };
  if (Array.isArray(item.sentences)) {
    for (const s of item.sentences) add(s);
  }
  add(item.example);
  if (Array.isArray(item.examples)) {
    for (const ex of item.examples) add(ex);
  }
  if (typeof item.explanation === "string") {
    const plain = htmlToPlainPushText(item.explanation);
    if (plain) add(plain);
  }
  return pool;
}

/** Deterministic “random” line for this word in this time bucket (cycles if pool has many). */
function pickExampleForPushBody(item: VocabItem, bucket: string): string {
  const pool = examplePoolForItem(item);
  if (pool.length === 0) return "";
  if (pool.length === 1) return pool[0]!;
  const seed = hashBucketToSeed(`${bucket}:${normalizeWordKey(item.word)}`);
  return pool[seed % pool.length]!;
}

const PUSH_BODY_MAX = 240;

function clampPushBody(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= PUSH_BODY_MAX) return t;
  return `${t.slice(0, Math.max(0, PUSH_BODY_MAX - 1))}…`;
}

/**
 * Visible notification body — many clients hide or collapse empty/whitespace-only bodies.
 * Prefer example/sentences, then explanation, then a short default.
 */
function pickBodyForPush(item: VocabItem, bucket: string): string {
  const fromPool = pickExampleForPushBody(item, bucket).trim();
  if (fromPool) return clampPushBody(fromPool);
  const expl =
    typeof item.explanation === "string"
      ? htmlToPlainPushText(item.explanation)
      : "";
  if (expl.length > 0) return clampPushBody(expl);
  return item.pushOpenFlashcards
    ? "Open your vocabulary notes to review this card."
    : "IELTS vocabulary — open the app to review.";
}

/**
 * Dedup bucket: floor current time to the nearest 10-minute mark (:00, :10, … :50).
 * Prevents duplicate sends if the cron is called multiple times within the same window.
 */
function tenMinuteBucket(): string {
  const tz = getCalendarEventStorageTimeZone();
  const now = new Date();
  const dateKey = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const hh = formatInTimeZone(now, tz, "HH");
  const mm = Number(formatInTimeZone(now, tz, "mm"));
  const bucketMm = Math.floor(mm / 10) * 10;
  const mmStr = String(bucketMm).padStart(2, "0");
  return `${dateKey}_${hh}:${mmStr}`;
}

function bucketSlotIndex(bucket: string): number {
  // bucket shape: yyyy-MM-dd_HH:mm where mm ∈ {00,10,20,30,40,50}
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{2}):(\d{2})$/.exec(bucket);
  if (!m) return 0;
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm % 10 !== 0 || mm > 50) {
    return 0;
  }
  const dec = mm / 10;
  return Math.max(0, Math.min(24 * 6 - 1, hh * 6 + dec));
}

function bucketDayKey(bucket: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})_/.exec(bucket);
  return m?.[1] ?? bucket.slice(0, 10);
}

async function tryLogVocabSent(
  db: SupabaseClient,
  userId: string,
  bucket: string,
): Promise<boolean> {
  const { error } = await db.from("calendar_reminder_sent").insert({
    user_id: userId,
    event_id: userId,
    kind: `vocab_${bucket}`,
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function removeDeadSubscription(db: SupabaseClient, endpoint: string) {
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

const VOCAB_PAGE = 1000;

async function loadAllIeltsTopicVocab(
  db: SupabaseClient,
): Promise<VocabItem[]> {
  const allWordsRaw: VocabItem[] = [];
  for (let offset = 0; ; offset += VOCAB_PAGE) {
    const { data: vocabRows, error: vocabErr } = await db
      .from("ielts_topic_vocab")
      .select("items")
      .range(offset, offset + VOCAB_PAGE - 1);
    if (vocabErr) throw vocabErr;
    const batch = vocabRows ?? [];
    for (const row of batch) {
      if (Array.isArray(row.items)) {
        for (const item of row.items as VocabItem[]) {
          if (typeof item?.word === "string" && item.word.trim()) {
            allWordsRaw.push(item);
          }
        }
      }
    }
    if (batch.length < VOCAB_PAGE) break;
  }
  return dedupeVocabItems(allWordsRaw);
}

/** 32-bit FNV-1a — spreads bucket strings better than summing char codes. */
function hashBucketToSeed(bucket: string): number {
  let h = 2166136261;
  for (let i = 0; i < bucket.length; i++) {
    h ^= bucket.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// (intentionally unused now) kept in history for earlier random-pick approach

function dedupeVocabItems(items: VocabItem[]): VocabItem[] {
  const seen = new Set<string>();
  const out: VocabItem[] = [];
  for (const item of items) {
    const key = normalizeWordKey(item.word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function stableDailyWordOrder(words: VocabItem[], dayKey: string): VocabItem[] {
  const daySeed = hashBucketToSeed(dayKey);
  return [...words].sort((a, b) => {
    const ha = hashBucketToSeed(`${daySeed}:${normalizeWordKey(a.word)}`);
    const hb = hashBucketToSeed(`${daySeed}:${normalizeWordKey(b.word)}`);
    return ha - hb;
  });
}

function isTrivialForPush(item: VocabItem): boolean {
  /** User-saved vocabulary notes should always be eligible for push. */
  if (item.pushOpenFlashcards) return false;
  const raw = normalizeWordKey(item.word);
  if (!raw) return true;
  // If the "word" is a phrase, keep it (phrases are higher signal).
  if (raw.includes(" ")) return false;
  // If it contains punctuation/IPA/extra markers, it's usually not trivial.
  if (/[^a-z-]/i.test(raw)) return false;
  if (TRIVIAL_PUSH_WORDS.has(raw)) return true;
  // Very short single words are usually low-signal for pushes.
  if (raw.length <= 3) return true;
  return false;
}

function hasSentenceForPush(item: VocabItem): boolean {
  const arr = Array.isArray(item.sentences) ? item.sentences : [];
  return arr.some((s) => {
    const t = typeof s === "string" ? s.trim() : "";
    return t.length >= 12 && /\s/.test(t) && /[.?!]/.test(t);
  });
}

/** Strip HTML from flashcard definitions for push body (server-safe, no DOM). */
function htmlToPlainPushText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flashcardRowToVocabItem(word: string, definition: string, partOfSpeech?: string, shortDefinition?: string): VocabItem | null {
  const w = typeof word === "string" ? word.trim() : "";
  if (!w) return null;
  const plain = htmlToPlainPushText(typeof definition === "string" ? definition : "");
  const item: VocabItem = {
    word: w,
    pushOpenFlashcards: true,
    partOfSpeech: partOfSpeech || undefined,
    shortDefinition: shortDefinition || undefined,
  };
  if (plain.length >= 12 && /\s/.test(plain) && /[.?!]/.test(plain)) {
    item.sentences = [plain.length > 800 ? `${plain.slice(0, 797)}…` : plain];
  } else if (plain.length > 0) {
    item.example = plain.length > 500 ? `${plain.slice(0, 497)}…` : plain;
  }
  return item;
}

const FLASHCARD_USER_CHUNK = 120;

async function loadUserFlashcardVocabByUserId(
  db: SupabaseClient,
  userIds: string[],
): Promise<Map<string, VocabItem[]>> {
  const byUser = new Map<string, VocabItem[]>();
  for (const id of userIds) byUser.set(id, []);

  if (userIds.length === 0) return byUser;

  for (let i = 0; i < userIds.length; i += FLASHCARD_USER_CHUNK) {
    const chunk = userIds.slice(i, i + FLASHCARD_USER_CHUNK);
    const { data, error } = await db
      .from("flashcard_cards")
      .select("user_id,word,definition,part_of_speech,short_definition")
      .in("user_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const uid = row.user_id as string;
      const item = flashcardRowToVocabItem(
        row.word as string,
        (row.definition as string) ?? "",
        (row.part_of_speech as string) ?? undefined,
        (row.short_definition as string) ?? undefined,
      );
      if (!item) continue;
      const list = byUser.get(uid);
      if (list) list.push(item);
    }
  }

  for (const [uid, raw] of byUser) {
    byUser.set(uid, dedupeVocabItems(raw));
  }
  return byUser;
}

function pickVocabPayloadsForUser(
  ieltsWords: VocabItem[],
  userWords: VocabItem[],
  bucket: string,
  siteUrl: string,
): string[] {
  // User cards first so dedupe keeps personal copy (and `/flashcards` link) when word matches IELTS.
  const combined = dedupeVocabItems([...userWords, ...ieltsWords]);
  if (combined.length === 0) return [];

  const sentencePool = combined.filter((w) => hasSentenceForPush(w));
  const nonTrivial = combined.filter((w) => !isTrivialForPush(w));
  const pool =
    sentencePool.length >= 8
      ? sentencePool
      : nonTrivial.length >= 8
        ? nonTrivial
        : combined;
  // Shuffle using the full bucket (day+time) as seed — ensures different words each slot
  const ordered = stableDailyWordOrder(pool, bucket);
  const slotIdx = bucketSlotIndex(bucket);
  // Use a prime stride to avoid short cycles when pool is small
  const stride = pool.length <= 3 ? 1 : 7;
  const start = (slotIdx * stride) % ordered.length;
  const words =
    ordered.length >= 2
      ? [ordered[start]!, ordered[(start + stride) % ordered.length]!]
      : [ordered[start]!];

  const base = siteUrl.replace(/\/$/, "");
  return words.map((w, i) => {
    const path = w.pushOpenFlashcards ? "/flashcards" : "/ielts-speaking";

    // Title: "word (POS) — short def" — fits in one line on Chrome/Apple Watch
    const posLabel = w.partOfSpeech ? ` (${posAbbrev(w.partOfSpeech)})` : "";
    const shortDef = w.shortDefinition
      || (typeof w.explanation === "string" ? htmlToPlainPushText(w.explanation) : "");
    const titlePrefix = `${w.word}${posLabel}`;
    const title = shortDef ? `${titlePrefix} — ${shortDef}` : titlePrefix;

    // Body: example sentence only (definition is already in the title)
    const ex = pickExampleForPushBody(w, bucket).trim();
    const body = (ex && ex !== shortDef) ? clampPushBody(ex) : (w.pushOpenFlashcards
      ? "Open vocabulary notes to review."
      : "IELTS vocabulary — open to review.");

    return JSON.stringify({
      title,
      body,
      url: `${base}${path}`,
      tag: `vocab-${bucket}-${i}`,
    });
  });
}

export async function runVocabReminderSweep(
  db: SupabaseClient,
  siteUrl: string,
): Promise<{ sent: number; errors: number; skipped: string }> {
  try {
    return await runVocabReminderSweepImpl(db, siteUrl);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("runVocabReminderSweep", e);
    return { sent: 0, errors: 0, skipped: `error: ${msg}` };
  }
}

async function runVocabReminderSweepImpl(
  db: SupabaseClient,
  siteUrl: string,
): Promise<{ sent: number; errors: number; skipped: string }> {
  if (!isWebPushConfigured()) {
    return { sent: 0, errors: 0, skipped: "web-push not configured" };
  }

  ensureWebPushConfigured();

  const { data: subs, error: subErr } = await db
    .from("push_subscriptions")
    .select("user_id,endpoint,p256dh,auth");
  if (subErr) throw subErr;
  if (!subs?.length) {
    return { sent: 0, errors: 0, skipped: "no push subscriptions" };
  }

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const s of subs) {
    const uid = s.user_id as string;
    if (!subsByUser.has(uid)) subsByUser.set(uid, []);
    subsByUser.get(uid)!.push({
      endpoint: s.endpoint as string,
      p256dh: s.p256dh as string,
      auth: s.auth as string,
    });
  }

  const subscribedUserIds = [...subsByUser.keys()];
  const flashByUser = await loadUserFlashcardVocabByUserId(db, subscribedUserIds);
  const anyUserCards = [...flashByUser.values()].some((a) => a.length > 0);
  if (!anyUserCards) {
    return { sent: 0, errors: 0, skipped: "no vocab items" };
  }

  const bucket = tenMinuteBucket();

  let sent = 0;
  let errors = 0;

  for (const [userId, userSubs] of subsByUser) {
    const userWords = flashByUser.get(userId) ?? [];
    const payloads = pickVocabPayloadsForUser([], userWords, bucket, siteUrl);
    if (payloads.length === 0) continue;

    const shouldSend = await tryLogVocabSent(db, userId, bucket);
    if (!shouldSend) continue;

    for (const sub of userSubs) {
      for (const payload of payloads) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 600, urgency: "normal" },
          );
          sent += 1;
        } catch (e: unknown) {
          errors += 1;
          const wpe = e as { statusCode?: number; body?: string };
          const errBody = typeof wpe.body === "string" ? wpe.body : undefined;
          if (shouldDropPushSubscription(wpe.statusCode, errBody)) {
            await removeDeadSubscription(db, sub.endpoint);
          }
        }
      }
    }
  }

  return { sent, errors, skipped: "" };
}

export type VocabTestPushResult = {
  sent: number;
  failed: number;
  skipped: string;
  /** True when no IELTS/flashcard vocab existed — a help payload was sent instead. */
  usedSample: boolean;
  /** Number of IELTS speaking topic vocab items found. */
  ieltsCount?: number;
  /** Number of user flashcard vocab items found. */
  flashcardCount?: number;
};

/**
 * Immediate push for debugging — does not write `calendar_reminder_sent` (no dedupe).
 */
export async function sendVocabTestPushToUser(
  db: SupabaseClient,
  userId: string,
  siteUrl: string,
): Promise<VocabTestPushResult> {
  if (!isWebPushConfigured()) {
    return {
      sent: 0,
      failed: 0,
      skipped: "web-push not configured",
      usedSample: false,
    };
  }
  ensureWebPushConfigured();

  const { data: subs, error: subErr } = await db
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (subErr) throw subErr;
  if (!subs?.length) {
    return {
      sent: 0,
      failed: 0,
      skipped: "no push subscriptions",
      usedSample: false,
    };
  }

  const ieltsWords = await loadAllIeltsTopicVocab(db);
  const flashByUser = await loadUserFlashcardVocabByUserId(db, [userId]);
  const userWords = flashByUser.get(userId) ?? [];
  const bucket = tenMinuteBucket();
  const payloads = pickVocabPayloadsForUser(
    ieltsWords,
    userWords,
    bucket,
    siteUrl,
  );

  let usedSample = false;
  const toSend: string[] =
    payloads.length > 0
      ? [payloads[0]!]
      : (() => {
          usedSample = true;
          const base = siteUrl.replace(/\/$/, "");
          return [
            JSON.stringify({
              title: "Vocabulary reminder (test)",
              body: "Add IELTS topic words or save cards in Vocabulary notes — reminders use the same schedule as calendar push.",
              url: `${base}/flashcards`,
              tag: `vocab-test-${Date.now()}`,
            }),
          ];
        })();

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    for (const payload of toSend) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: {
              p256dh: sub.p256dh as string,
              auth: sub.auth as string,
            },
          },
          payload,
          { TTL: 120, urgency: "normal" },
        );
        sent += 1;
      } catch (e: unknown) {
        failed += 1;
        const wpe = e as { statusCode?: number; body?: string };
        const errBody = typeof wpe.body === "string" ? wpe.body : undefined;
        if (shouldDropPushSubscription(wpe.statusCode, errBody)) {
          await removeDeadSubscription(db, sub.endpoint as string);
        }
      }
    }
  }

  return {
    sent,
    failed,
    skipped: "",
    usedSample,
    ieltsCount: ieltsWords.length,
    flashcardCount: userWords.length,
  };
}

