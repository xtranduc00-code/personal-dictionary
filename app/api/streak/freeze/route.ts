import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import { getStreakStatus, STREAK_QUOTAS } from "@/lib/streak-status";

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function* iterateDates(start: string, end: string): Generator<string> {
  const d = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (d <= last) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/**
 * POST /api/streak/freeze
 *
 * Body:
 *   { freeze_type: "sick_day" | "travel", start_date: YYYY-MM-DD, end_date?: YYYY-MM-DD }
 *
 * Quota-enforced: 1 sick day / month, 21 travel days / year. Idempotent on
 * (user_id, freeze_date) — re-submitting the same date is a no-op.
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { freeze_type, start_date, end_date } = body as {
    freeze_type?: string;
    start_date?: string;
    end_date?: string;
  };

  if (freeze_type !== "sick_day" && freeze_type !== "travel") {
    return NextResponse.json({ error: "freeze_type must be 'sick_day' or 'travel'" }, { status: 400 });
  }
  if (!isYmd(start_date)) {
    return NextResponse.json({ error: "start_date must be YYYY-MM-DD" }, { status: 400 });
  }
  const finalEnd = end_date && isYmd(end_date) ? end_date : start_date;
  if (finalEnd < start_date) {
    return NextResponse.json({ error: "end_date must be ≥ start_date" }, { status: 400 });
  }
  if (freeze_type === "sick_day" && finalEnd !== start_date) {
    return NextResponse.json({ error: "sick_day is single-day only" }, { status: 400 });
  }

  const dates = Array.from(iterateDates(start_date, finalEnd));
  if (dates.length > 31) {
    return NextResponse.json({ error: "freeze range capped at 31 days per call" }, { status: 400 });
  }

  const db = supabaseForUserData();

  // Quota check before inserting.
  if (freeze_type === "sick_day") {
    const monthStart = start_date.slice(0, 7) + "-01";
    const { data: monthRows } = await db
      .from("streak_freezes")
      .select("freeze_date")
      .eq("user_id", user.id)
      .eq("freeze_type", "sick_day")
      .gte("freeze_date", monthStart);
    if ((monthRows?.length ?? 0) >= STREAK_QUOTAS.SICK_DAYS_PER_MONTH) {
      return NextResponse.json(
        { error: `Sick day quota exceeded (${STREAK_QUOTAS.SICK_DAYS_PER_MONTH}/month)` },
        { status: 429 },
      );
    }
  } else {
    const yearStart = start_date.slice(0, 4) + "-01-01";
    const { data: yearRows } = await db
      .from("streak_freezes")
      .select("freeze_date")
      .eq("user_id", user.id)
      .eq("freeze_type", "travel")
      .gte("freeze_date", yearStart);
    const used = yearRows?.length ?? 0;
    if (used + dates.length > STREAK_QUOTAS.TRAVEL_DAYS_PER_YEAR) {
      return NextResponse.json(
        {
          error: `Travel quota would exceed ${STREAK_QUOTAS.TRAVEL_DAYS_PER_YEAR} days/year (${used} used, ${dates.length} requested)`,
        },
        { status: 429 },
      );
    }
  }

  // Bulk upsert (unique on user_id, freeze_date — re-submitting same dates is a no-op).
  const rows = dates.map((d) => ({
    user_id: user.id,
    freeze_date: d,
    freeze_type,
  }));
  const { error } = await db
    .from("streak_freezes")
    .upsert(rows, { onConflict: "user_id,freeze_date", ignoreDuplicates: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(
    "[streak] freeze-applied",
    JSON.stringify({ user: user.id.slice(0, 8), type: freeze_type, days: dates.length, start: start_date, end: finalEnd }),
  );

  const streak = await getStreakStatus(user.id);
  return NextResponse.json({ ok: true, streak });
}

/** DELETE /api/streak/freeze?date=YYYY-MM-DD — undo a freeze for a single day. */
export async function DELETE(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!isYmd(date)) {
    return NextResponse.json({ error: "date query param required (YYYY-MM-DD)" }, { status: 400 });
  }

  const db = supabaseForUserData();
  await db
    .from("streak_freezes")
    .delete()
    .eq("user_id", user.id)
    .eq("freeze_date", date);

  const streak = await getStreakStatus(user.id);
  return NextResponse.json({ ok: true, streak });
}
