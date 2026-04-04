import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/push/web-push-config";
import { shouldDropPushSubscription } from "@/lib/push/should-drop-push-subscription";
import { getCalendarEventStorageTimeZone } from "@/lib/calendar/event-start-utc";

type VocabItem = {
  word: string;
  explanation?: string;
  example?: string;
  /**
   * Optional list of extra example sentences (same word, different usage).
   * Push picks one per 10-min bucket so the line changes over time without any API call.
   */
  examples?: string[];
  /** Preferred: fully-formed sentences generated and stored ahead of time. */
  sentences?: string[];
};

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

  // Gather all vocab items across all topics (paginate — PostgREST default cap per request).
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

  const allWords = dedupeVocabItems(allWordsRaw);
  if (allWords.length === 0) {
    return { sent: 0, errors: 0, skipped: "no vocab items" };
  }

  const bucket = tenMinuteBucket();

  // Two vocabulary pushes per 10-minute window per device; one DB dedupe row per user per window.
  const dayKey = bucketDayKey(bucket);
  const sentencePool = allWords.filter((w) => hasSentenceForPush(w));
  const nonTrivial = allWords.filter((w) => !isTrivialForPush(w));
  const pool =
    sentencePool.length >= 8
      ? sentencePool
      : nonTrivial.length >= 8
        ? nonTrivial
        : allWords;
  const ordered = stableDailyWordOrder(pool, dayKey);
  const slotIdx = bucketSlotIndex(bucket);
  const start = (slotIdx * 2) % ordered.length;
  const words =
    ordered.length >= 2
      ? [ordered[start]!, ordered[(start + 1) % ordered.length]!]
      : [ordered[start]!];

  // Two separate pushes per 10-minute window (same dedupe bucket = one tryLogVocabSent per user).
  const payloads = words.map((w, i) => {
    const ex = pickExampleForPushBody(w, bucket);
    return JSON.stringify({
      title: w.word,
      body: ex || " ",
      url: `${siteUrl.replace(/\/$/, "")}/ielts-speaking`,
      tag: `vocab-${bucket}-${i}`,
    });
  });

  let sent = 0;
  let errors = 0;

  for (const [userId, userSubs] of subsByUser) {
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

