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
};

/** Hour (0–23) in the storage timezone at which the vocab reminder fires. */
function getVocabReminderHour(): number {
  const raw = process.env.VOCAB_REMINDER_HOUR?.trim();
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 8;
}

/** YYYY-MM-DD in the storage timezone for dedup key. */
function todayYmd(): string {
  return formatInTimeZone(new Date(), getCalendarEventStorageTimeZone(), "yyyy-MM-dd");
}

/** Returns true if the current time is within ±5 min of the configured reminder hour. */
function isWithinReminderWindow(): boolean {
  const tz = getCalendarEventStorageTimeZone();
  const now = new Date();
  const hhmm = formatInTimeZone(now, tz, "HH:mm");
  const [hh, mm] = hhmm.split(":").map(Number);
  const minuteOfDay = hh * 60 + mm;
  const targetMinute = getVocabReminderHour() * 60;
  return Math.abs(minuteOfDay - targetMinute) <= 5;
}

async function tryLogVocabSent(
  db: SupabaseClient,
  userId: string,
  dateYmd: string,
): Promise<boolean> {
  const { error } = await db.from("calendar_reminder_sent").insert({
    user_id: userId,
    event_id: userId,
    kind: `vocab_${dateYmd}`,
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function removeDeadSubscription(db: SupabaseClient, endpoint: string) {
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function runVocabReminderSweep(
  db: SupabaseClient,
  siteUrl: string,
): Promise<{ sent: number; errors: number; skipped: string }> {
  if (!isWebPushConfigured()) {
    return { sent: 0, errors: 0, skipped: "web-push not configured" };
  }
  if (!isWithinReminderWindow()) {
    return { sent: 0, errors: 0, skipped: "outside reminder window" };
  }

  ensureWebPushConfigured();

  // Gather all vocab items across all topics.
  const { data: vocabRows, error: vocabErr } = await db
    .from("ielts_topic_vocab")
    .select("items");
  if (vocabErr) throw vocabErr;

  const allWords: VocabItem[] = [];
  for (const row of vocabRows ?? []) {
    if (Array.isArray(row.items)) {
      for (const item of row.items as VocabItem[]) {
        if (typeof item?.word === "string" && item.word.trim()) {
          allWords.push(item);
        }
      }
    }
  }
  if (allWords.length === 0) {
    return { sent: 0, errors: 0, skipped: "no vocab items" };
  }

  // Pick a deterministic-random word for today (same word for all users).
  const dateYmd = todayYmd();
  const idx = [...dateYmd].reduce((acc, c) => acc + c.charCodeAt(0), 0) % allWords.length;
  const word = allWords[idx]!;

  // Build notification payload.
  const bodyParts = [word.word];
  if (word.explanation) bodyParts.push(word.explanation);
  if (word.example) bodyParts.push(`"${word.example}"`);
  const body = bodyParts.join(" — ");

  const payload = JSON.stringify({
    title: "Word of the day",
    body,
    url: `${siteUrl.replace(/\/$/, "")}/ielts-speaking`,
    tag: `vocab-${dateYmd}`,
  });

  // Get all push subscriptions grouped by user.
  const { data: subs, error: subErr } = await db
    .from("push_subscriptions")
    .select("user_id,endpoint,p256dh,auth");
  if (subErr) throw subErr;

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const s of subs ?? []) {
    const uid = s.user_id as string;
    if (!subsByUser.has(uid)) subsByUser.set(uid, []);
    subsByUser.get(uid)!.push({
      endpoint: s.endpoint as string,
      p256dh: s.p256dh as string,
      auth: s.auth as string,
    });
  }

  let sent = 0;
  let errors = 0;

  for (const [userId, userSubs] of subsByUser) {
    const shouldSend = await tryLogVocabSent(db, userId, dateYmd);
    if (!shouldSend) continue;

    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 3600, urgency: "normal" },
        );
        sent += 1;
      } catch (e: unknown) {
        errors += 1;
        const wpe = e as { statusCode?: number; body?: string };
        const body = typeof wpe.body === "string" ? wpe.body : undefined;
        if (shouldDropPushSubscription(wpe.statusCode, body)) {
          await removeDeadSubscription(db, sub.endpoint);
        }
      }
    }
  }

  return { sent, errors, skipped: "" };
}
