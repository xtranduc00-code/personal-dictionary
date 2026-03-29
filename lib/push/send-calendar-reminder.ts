import type { SupabaseClient } from "@supabase/supabase-js";
import { eventStartUtc, getCalendarEventStorageTimeZone } from "@/lib/calendar/event-start-utc";
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

const WINDOW_MS = 90_000;
const DATE_WINDOW_DAYS = 8;

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

/** Fire once when cron hits within WINDOW_MS of (start - offset). */
const REMINDER_TRIGGERS: {
  offsetMs: number;
  kind: string;
  title: string;
  body: (eventTitle: string) => string;
}[] = [
  {
    offsetMs: MS_DAY,
    kind: "before_24h",
    title: "Lịch · 1 day left",
    body: (t) => `${t} — 1 day until start · còn 1 ngày`,
  },
  {
    offsetMs: MS_HOUR,
    kind: "before_1h",
    title: "Lịch · 1 hour left",
    body: (t) => `${t} — 1 hour until start · còn 1 giờ`,
  },
  {
    offsetMs: 10 * MS_MIN,
    kind: "before_10",
    title: "Sắp đến giờ · Up soon",
    body: (t) => `${t} — 10 minutes · 10 phút nữa`,
  },
];

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

function loadDateWindow(): { from: string; to: string } {
  const tz = getCalendarEventStorageTimeZone();
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 1);
  const to = new Date(now);
  to.setDate(to.getDate() + DATE_WINDOW_DAYS);
  return { from: formatDateInStorageTz(from), to: formatDateInStorageTz(to) };
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

  for (const ev of list) {
    const userSubs = subsByUser.get(ev.user_id);
    if (!userSubs?.length) continue;

    const startUtc = eventStartUtc(ev.date, ev.start_time);
    if (!startUtc || Number.isNaN(startUtc.getTime())) continue;

    const startMs = startUtc.getTime();

    const kinds: { kind: string; title: string; body: string }[] = [];

    for (const tr of REMINDER_TRIGGERS) {
      const fireAt = startMs - tr.offsetMs;
      if (Math.abs(now - fireAt) <= WINDOW_MS) {
        kinds.push({
          kind: tr.kind,
          title: tr.title,
          body: tr.body(ev.title),
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
            { TTL: 3600 },
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
