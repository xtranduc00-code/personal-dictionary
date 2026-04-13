import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/push/web-push-config";
import { shouldDropPushSubscription } from "@/lib/push/should-drop-push-subscription";
import { getCalendarEventStorageTimeZone } from "@/lib/calendar/event-start-utc";

/** Hour (0-23) in user-local time to fire the pending-tasks reminder. */
const REMINDER_HOUR = 20;

type Sub = { endpoint: string; p256dh: string; auth: string };

async function tryLogReminderSent(
  db: SupabaseClient,
  userId: string,
  dayKey: string,
): Promise<boolean> {
  const { error } = await db.from("calendar_reminder_sent").insert({
    user_id: userId,
    event_id: userId,
    kind: `daily_tasks_${dayKey}`,
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function removeDeadSubscription(db: SupabaseClient, endpoint: string) {
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function runDailyTasksReminderSweep(
  db: SupabaseClient,
  siteUrl: string,
): Promise<{ sent: number; errors: number; skipped: string }> {
  try {
    return await runDailyTasksReminderSweepImpl(db, siteUrl);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("runDailyTasksReminderSweep", e);
    return { sent: 0, errors: 0, skipped: `error: ${msg}` };
  }
}

async function runDailyTasksReminderSweepImpl(
  db: SupabaseClient,
  siteUrl: string,
): Promise<{ sent: number; errors: number; skipped: string }> {
  if (!isWebPushConfigured()) {
    return { sent: 0, errors: 0, skipped: "web-push not configured" };
  }

  // Only fire during the configured evening hour (local TZ).
  const tz = getCalendarEventStorageTimeZone();
  const now = new Date();
  const hh = Number(formatInTimeZone(now, tz, "HH"));
  if (hh !== REMINDER_HOUR) {
    return { sent: 0, errors: 0, skipped: `outside reminder hour (${hh}:00)` };
  }

  ensureWebPushConfigured();

  const dayKey = formatInTimeZone(now, tz, "yyyy-MM-dd");

  const { data: subs, error: subErr } = await db
    .from("push_subscriptions")
    .select("user_id,endpoint,p256dh,auth");
  if (subErr) throw subErr;
  if (!subs?.length) {
    return { sent: 0, errors: 0, skipped: "no push subscriptions" };
  }

  const subsByUser = new Map<string, Sub[]>();
  for (const s of subs) {
    const uid = s.user_id as string;
    if (!subsByUser.has(uid)) subsByUser.set(uid, []);
    subsByUser.get(uid)!.push({
      endpoint: s.endpoint as string,
      p256dh: s.p256dh as string,
      auth: s.auth as string,
    });
  }

  const base = siteUrl.replace(/\/$/, "");
  let sent = 0;
  let errors = 0;

  for (const [userId, userSubs] of subsByUser) {
    // Count templates (total daily tasks for this user)
    const { data: templates } = await db
      .from("daily_task_templates")
      .select("id")
      .eq("user_id", userId);
    const total = templates?.length ?? 0;
    if (total === 0) continue;

    // Count today's completed tasks (only those that match an active template)
    const templateIds = new Set((templates ?? []).map((t) => t.id as string));
    const { data: doneRows } = await db
      .from("daily_tasks")
      .select("task_key")
      .eq("user_id", userId)
      .eq("task_date", dayKey);
    const doneCount = (doneRows ?? []).filter((r) =>
      templateIds.has(r.task_key as string),
    ).length;

    const pending = total - doneCount;
    if (pending <= 0) continue;

    // Dedupe: only one reminder per user per day
    const shouldSend = await tryLogReminderSent(db, userId, dayKey);
    if (!shouldSend) continue;

    const payload = JSON.stringify({
      title: `Còn ${pending} nhiệm vụ hôm nay`,
      body: `Mở app để hoàn thành chuỗi ngày của bạn.`,
      url: `${base}/`,
      tag: `daily-tasks-${dayKey}`,
    });

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
        const errBody = typeof wpe.body === "string" ? wpe.body : undefined;
        if (shouldDropPushSubscription(wpe.statusCode, errBody)) {
          await removeDeadSubscription(db, sub.endpoint);
        }
      }
    }
  }

  return { sent, errors, skipped: "" };
}
