import type { SupabaseClient } from "@supabase/supabase-js";
import { eventStartUtc, getCalendarEventStorageTimeZone } from "@/lib/calendar/event-start-utc";
import {
  REMINDER_DATE_WINDOW_DAYS,
  REMINDER_FIRE_SPECS,
  REMINDER_WINDOW_MS,
} from "@/lib/push/reminder-fire-specs";
import {
  formatPushEventStartLabel,
  getPushNotificationTimeZone,
} from "@/lib/push/push-notification-time-label";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/push/web-push-config";
import { shouldDropPushSubscription } from "@/lib/push/should-drop-push-subscription";

type CalRow = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  start_time: string | null;
};

/** YYYY-MM-DD in storage TZ for date `d`. */
function formatDateInStorageTz(d: Date): string {
  const tz = getCalendarEventStorageTimeZone();
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = p.find((x) => x.type === "year")?.value;
  const m = p.find((x) => x.type === "month")?.value;
  const day = p.find((x) => x.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

/** Civil YYYY-MM-DD + integer days (Gregorian), independent of server TZ. */
function addCalendarDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return ymd;
  }
  const x = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = x.getUTCFullYear();
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(x.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function loadDateWindow(): { from: string; to: string } {
  const today = formatDateInStorageTz(new Date());
  return {
    from: addCalendarDaysYmd(today, -1),
    to: addCalendarDaysYmd(today, REMINDER_DATE_WINDOW_DAYS),
  };
}

async function tryLogSent(
  db: SupabaseClient,
  userId: string,
  eventId: string,
  kind: string,
): Promise<boolean> {
  const { error } = await db.from("calendar_reminder_sent").insert({
    user_id: userId,
    event_id: eventId,
    kind,
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function removeDeadSubscription(db: SupabaseClient, endpoint: string) {
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function runCalendarReminderSweep(
  db: SupabaseClient,
  siteUrl: string,
): Promise<{ checked: number; sent: number; errors: number }> {
  if (!isWebPushConfigured()) {
    return { checked: 0, sent: 0, errors: 0 };
  }
  ensureWebPushConfigured();

  const { from, to } = loadDateWindow();
  const { data: events, error: evErr } = await db
    .from("calendar_events")
    .select("id,user_id,title,date,start_time")
    .not("start_time", "is", null)
    .gte("date", from)
    .lte("date", to);
  if (evErr) throw evErr;
  const list = (events ?? []) as CalRow[];

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

  const now = Date.now();
  let checked = 0;
  let sent = 0;
  let errors = 0;
  const pushTz = getPushNotificationTimeZone();

  for (const ev of list) {
    const userSubs = subsByUser.get(ev.user_id);
    if (!userSubs?.length) continue;

    const startUtc = eventStartUtc(ev.date, ev.start_time);
    if (!startUtc || Number.isNaN(startUtc.getTime())) continue;

    const startMs = startUtc.getTime();
    const whenLocal = formatPushEventStartLabel(startUtc, pushTz);

    const kinds: { kind: string; title: string; body: string }[] = [];

    for (const tr of REMINDER_FIRE_SPECS) {
      const fireAt = startMs - tr.offsetMs;
      if (Math.abs(now - fireAt) <= REMINDER_WINDOW_MS) {
        kinds.push({
          kind: tr.kind,
          title: tr.title,
          body: tr.calendarBody(ev.title, whenLocal),
        });
      }
    }

    for (const k of kinds) {
      checked += 1;
      const shouldSend = await tryLogSent(db, ev.user_id, ev.id, k.kind);
      if (!shouldSend) continue;

      const payload = JSON.stringify({
        title: k.title,
        body: k.body,
        url: `${siteUrl.replace(/\/$/, "")}/calendar`,
        tag: `${ev.id}-${k.kind}`,
      });

      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            { TTL: 3600, urgency: "high" },
          );
          sent += 1;
        } catch (e: unknown) {
          errors += 1;
          const wpe = e as { statusCode?: number; body?: string };
          const body =
            typeof wpe.body === "string" ? wpe.body : undefined;
          if (shouldDropPushSubscription(wpe.statusCode, body)) {
            await removeDeadSubscription(db, sub.endpoint);
          }
        }
      }
    }
  }

  return { checked, sent, errors };
}
