import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";
import { runCalendarReminderSweep } from "@/lib/push/send-calendar-reminder";
import { supabaseForUserData } from "@/lib/supabase-server";

/**
 * Call every minute (e.g. Vercel Cron or external cron with CRON_SECRET).
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
    const result = await runCalendarReminderSweep(
      supabaseForUserData(),
      getSiteUrl(),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("calendar-reminders cron", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
