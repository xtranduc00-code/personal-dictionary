import { NextResponse } from "next/server";
import { runCalendarReminderSweep } from "@/lib/push/send-calendar-reminder";
import { runStudyScheduleReminderSweep } from "@/lib/push/send-study-schedule-reminder";
import { runVocabReminderSweep } from "@/lib/push/send-vocab-reminder";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * Call every minute (e.g. Vercel Cron or external cron with CRON_SECRET).
 * Calendar + shared study grid reminders (same push subscriptions).
 * Authorization: Bearer <CRON_SECRET>
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY: calendar_events are per-user under RLS; anon sees no rows,
 * so calendar reminders would never fire while study grid (shared table) could still work.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getSupabaseServiceClient();
    if (!db) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY is not set; calendar reminders need service role to read all users’ events",
        },
        { status: 503 },
      );
    }
    const siteUrl = getSiteUrl();
    const [calendar, studySchedule, vocab] = await Promise.all([
      runCalendarReminderSweep(db, siteUrl),
      runStudyScheduleReminderSweep(db, siteUrl),
      runVocabReminderSweep(db, siteUrl),
    ]);
    return NextResponse.json({
      ok: true,
      checked: calendar.checked + studySchedule.checked,
      sent: calendar.sent + studySchedule.sent + vocab.sent,
      errors: calendar.errors + studySchedule.errors + vocab.errors,
      calendar,
      studySchedule,
      vocab,
    });
  } catch (e) {
    console.error("calendar-reminders cron", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
