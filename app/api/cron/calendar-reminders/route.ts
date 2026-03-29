import { NextResponse } from "next/server";
import { runCalendarReminderSweep } from "@/lib/push/send-calendar-reminder";
import { runStudyScheduleReminderSweep } from "@/lib/push/send-study-schedule-reminder";
import { getSiteUrl } from "@/lib/site-url";
import { supabaseForUserData } from "@/lib/supabase-server";

/**
 * Call every minute (e.g. Vercel Cron or external cron with CRON_SECRET).
 * Calendar + shared study grid reminders (same push subscriptions).
 * Authorization: Bearer <CRON_SECRET>
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
    const db = supabaseForUserData();
    const siteUrl = getSiteUrl();
    const calendar = await runCalendarReminderSweep(db, siteUrl);
    const studySchedule = await runStudyScheduleReminderSweep(db, siteUrl);
    return NextResponse.json({
      ok: true,
      checked: calendar.checked + studySchedule.checked,
      sent: calendar.sent + studySchedule.sent,
      errors: calendar.errors + studySchedule.errors,
      calendar,
      studySchedule,
    });
  } catch (e) {
    console.error("calendar-reminders cron", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
