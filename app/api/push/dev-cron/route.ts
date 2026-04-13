import { NextResponse } from "next/server";
import { runCalendarReminderSweep } from "@/lib/push/send-calendar-reminder";
import { runStudyScheduleReminderSweep } from "@/lib/push/send-study-schedule-reminder";
import { runVocabReminderSweep } from "@/lib/push/send-vocab-reminder";
import { runDailyTasksReminderSweep } from "@/lib/push/send-daily-tasks-reminder";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

/** Dev-only: runs the full reminder sweep without CRON_SECRET (parity with /api/cron/calendar-reminders). */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Dev only" }, { status: 403 });
  }
  const db = getSupabaseServiceClient();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is required for dev-cron: without it the server cannot read all push_subscriptions / calendar rows under RLS (vocab reminders stay empty).",
      },
      { status: 503 },
    );
  }
  const siteUrl = getSiteUrl();
  const [calendar, studySchedule, vocab, dailyTasks] = await Promise.all([
    runCalendarReminderSweep(db, siteUrl).catch((e) => {
      console.error("dev-cron: calendar sweep", e);
      return { checked: 0, sent: 0, errors: 0 };
    }),
    runStudyScheduleReminderSweep(db, siteUrl).catch((e) => {
      console.error("dev-cron: study schedule sweep", e);
      return { checked: 0, sent: 0, errors: 0 };
    }),
    runVocabReminderSweep(db, siteUrl).catch((e) => {
      console.error("dev-cron: vocab sweep", e);
      return { sent: 0, errors: 0, skipped: `error: ${e instanceof Error ? e.message : String(e)}` };
    }),
    runDailyTasksReminderSweep(db, siteUrl).catch((e) => {
      console.error("dev-cron: daily-tasks sweep", e);
      return { sent: 0, errors: 0, skipped: `error: ${e instanceof Error ? e.message : String(e)}` };
    }),
  ]);
  return NextResponse.json({ ok: true, calendar, studySchedule, vocab, dailyTasks });
}
