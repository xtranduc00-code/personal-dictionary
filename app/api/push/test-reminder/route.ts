import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { getSiteUrl } from "@/lib/site-url";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/push/web-push-config";
import { shouldDropPushSubscription } from "@/lib/push/should-drop-push-subscription";
import { supabaseForUserData } from "@/lib/supabase-server";
import { eventStartUtc } from "@/lib/calendar/event-start-utc";
import { REMINDER_FIRE_SPECS } from "@/lib/push/reminder-fire-specs";
import {
  formatPushEventStartLabel,
  getPushNotificationTimeZone,
} from "@/lib/push/push-notification-time-label";

function devOnly() {
  return process.env.NODE_ENV !== "development"
    ? NextResponse.json({ error: "Only available in development" }, { status: 403 })
    : null;
}

async function getNextEvent(userId: string) {
  const db = supabaseForUserData();
  const today = new Date().toISOString().slice(0, 10);
  const { data: events } = await db
    .from("calendar_events")
    .select("id,title,date,start_time")
    .eq("user_id", userId)
    .not("start_time", "is", null)
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(10);

  return (events ?? []).find((ev) => {
    const utc = eventStartUtc(ev.date as string, ev.start_time as string);
    return utc && utc.getTime() > Date.now();
  }) ?? null;
}

/**
 * GET — returns the next upcoming event and how many seconds until
 * the earliest reminder should fire (startMs - offsetMs - now).
 * Returns countdownSec = 0 if already within the window (fire immediately).
 */
export async function GET(req: Request) {
  const guard = devOnly(); if (guard) return guard;
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ev = await getNextEvent(user.id);
  if (!ev) {
    return NextResponse.json(
      { error: "No upcoming timed event found. Add a calendar event with a start time." },
      { status: 404 },
    );
  }

  const startMs = eventStartUtc(ev.date as string, ev.start_time as string)!.getTime();
  const now = Date.now();

  // Dev: fire 15 seconds before the event starts (instead of 10min/1h/24h offsets).
  const DEV_LEAD_MS = 15_000;
  const countdownSec = Math.max(0, Math.ceil((startMs - DEV_LEAD_MS - now) / 1000));

  return NextResponse.json({
    event: { title: ev.title, date: ev.date, start_time: ev.start_time },
    startMs,
    countdownSec,
  });
}

/**
 * POST — immediately fires all reminder notifications for the next upcoming
 * event, ignoring timing windows and dedup (dev only).
 */
export async function POST(req: Request) {
  const guard = devOnly(); if (guard) return guard;
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Push is not configured on the server" },
      { status: 503 },
    );
  }
  ensureWebPushConfigured();

  const db = supabaseForUserData();

  const { data: subs, error: subErr } = await db
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", user.id);
  if (subErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  if (!subs?.length)
    return NextResponse.json({ error: "No subscription", sent: 0 }, { status: 400 });

  const upcoming = await getNextEvent(user.id);
  if (!upcoming) {
    return NextResponse.json(
      { error: "No upcoming timed event found. Add a calendar event with a start time." },
      { status: 404 },
    );
  }

  const startUtc = eventStartUtc(
    upcoming.date as string,
    upcoming.start_time as string,
  )!;
  const pushTz = getPushNotificationTimeZone();
  const whenLocal = formatPushEventStartLabel(startUtc, pushTz);
  const siteUrl = getSiteUrl().replace(/\/$/, "");

  let sent = 0;
  let failed = 0;

  for (const spec of REMINDER_FIRE_SPECS) {
    const payload = JSON.stringify({
      title: spec.title,
      body: spec.calendarBody(upcoming.title as string, whenLocal),
      url: `${siteUrl}/calendar`,
      tag: `test-reminder-${upcoming.id}-${spec.kind}-${Date.now()}`,
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
          },
          payload,
          { TTL: 120, urgency: "high" },
        );
        sent++;
      } catch (e: unknown) {
        failed++;
        const wpe = e as { statusCode?: number; body?: string };
        if (shouldDropPushSubscription(wpe.statusCode, typeof wpe.body === "string" ? wpe.body : undefined)) {
          await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    event: { title: upcoming.title, date: upcoming.date, start_time: upcoming.start_time },
    specs: REMINDER_FIRE_SPECS.map((s) => s.kind),
    sent,
    failed,
  });
}
