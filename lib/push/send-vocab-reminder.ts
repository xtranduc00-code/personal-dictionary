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

/**
 * Dedup bucket: floor current time to the nearest 10-minute mark.
 * Prevents duplicate sends if the cron is called multiple times within the same window.
 */
function tenMinuteBucket(): string {
  const tz = getCalendarEventStorageTimeZone();
  const now = new Date();
  const hhmm = formatInTimeZone(now, tz, "yyyy-MM-dd_HH:mm");
  // Replace the last digit of minutes with 0 to get the 10-min bucket.
  return hhmm.slice(0, hhmm.length - 1) + "0";
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

/** Pick `count` distinct random items from an array using a seed. */
function pickRandom<T>(arr: T[], count: number, seed: number): T[] {
  if (arr.length <= count) return [...arr];
  const result: T[] = [];
  const used = new Set<number>();
  let s = seed;
  while (result.length < count) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const idx = s % arr.length;
    if (!used.has(idx)) {
      used.add(idx);
      result.push(arr[idx]!);
    }
  }
  return result;
}

export async function runVocabReminderSweep(
  db: SupabaseClient,
  siteUrl: string,
): Promise<{ sent: number; errors: number; skipped: string }> {
  if (!isWebPushConfigured()) {
    return { sent: 0, errors: 0, skipped: "web-push not configured" };
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

  // Dedup bucket: floor to nearest 10-minute window.
  const bucket = tenMinuteBucket();

  // Pick 2 distinct random words for this bucket (seed from bucket string).
  const seed = [...bucket].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const words = pickRandom(allWords, 2, seed);

  // Build one payload per word — cleaner to read as separate notifications.
  const payloads = words.map((w, i) => {
    const body = [
      w.explanation ?? "",
      w.example ? `"${w.example}"` : "",
    ].filter(Boolean).join(" · ");
    return JSON.stringify({
      title: w.word,
      body: body || "—",
      url: `${siteUrl.replace(/\/$/, "")}/ielts-speaking`,
      tag: `vocab-${bucket}-${i}`,
    });
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
