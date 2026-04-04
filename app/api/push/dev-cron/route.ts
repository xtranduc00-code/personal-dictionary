import { NextResponse } from "next/server";
import { runCalendarReminderSweep } from "@/lib/push/send-calendar-reminder";
import { runStudyScheduleReminderSweep } from "@/lib/push/send-study-schedule-reminder";
import { runVocabReminderSweep } from "@/lib/push/send-vocab-reminder";
import { getSiteUrl } from "@/lib/site-url";
import { supabaseForUserData } from "@/lib/supabase-server";

/** Dev-only: runs the full reminder sweep without CRON_SECRET (parity with /api/cron/calendar-reminders). */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Dev only" }, { status: 403 });
  }
  const db = supabaseForUserData();
  const siteUrl = getSiteUrl();
  const [calendar, studySchedule, vocab] = await Promise.all([
    runCalendarReminderSweep(db, siteUrl),
    runStudyScheduleReminderSweep(db, siteUrl),
    runVocabReminderSweep(db, siteUrl),
  ]);
  return NextResponse.json({ ok: true, calendar, studySchedule, vocab });
}
