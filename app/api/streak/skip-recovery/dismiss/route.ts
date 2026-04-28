import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import { getStreakStatus } from "@/lib/streak-status";

/**
 * POST /api/streak/skip-recovery/dismiss
 *   { action: "skip" | "make_up" | "dont_ask_again" }
 *
 * - `skip`            — close the prompt for today, may show again tomorrow
 * - `make_up`         — same as skip, just records intent for analytics
 * - `dont_ask_again`  — also flips skip_recovery_enabled=false on prefs
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action;
  if (action !== "skip" && action !== "make_up" && action !== "dont_ask_again") {
    return NextResponse.json({ error: "action must be 'skip' | 'make_up' | 'dont_ask_again'" }, { status: 400 });
  }

  const db = supabaseForUserData();
  const today = new Date().toISOString().slice(0, 10);

  // Idempotent — re-dismiss same day just updates action.
  const { error } = await db
    .from("streak_recovery_dismissals")
    .upsert(
      { user_id: user.id, dismiss_date: today, action },
      { onConflict: "user_id,dismiss_date", ignoreDuplicates: false },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (action === "dont_ask_again") {
    // Upsert prefs row with skip_recovery_enabled=false. Other columns
    // default-fill on insert; on update we only flip the one flag.
    await db
      .from("user_streak_prefs")
      .upsert(
        { user_id: user.id, skip_recovery_enabled: false },
        { onConflict: "user_id", ignoreDuplicates: false },
      );
  }

  console.log(
    "[streak] recovery-action",
    JSON.stringify({ user: user.id.slice(0, 8), date: today, action }),
  );

  const streak = await getStreakStatus(user.id);
  return NextResponse.json({ ok: true, streak });
}
