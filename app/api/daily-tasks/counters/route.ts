import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

function getLocalDate(req: Request, body?: { date?: string }): string {
  const fromBody = body?.date;
  if (fromBody && /^\d{4}-\d{2}-\d{2}$/.test(fromBody)) return fromBody;
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("date");
  if (fromQuery && /^\d{4}-\d{2}-\d{2}$/.test(fromQuery)) return fromQuery;
  return new Date().toISOString().slice(0, 10);
}

/** GET /api/daily-tasks/counters?date=YYYY-MM-DD — today's counters for this user. */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = getLocalDate(req);
  const db = supabaseForUserData();

  const { data: rows } = await db
    .from("daily_task_counters")
    .select("counter_key, value")
    .eq("user_id", user.id)
    .eq("counter_date", today);

  const counters: Record<string, number> = {};
  for (const r of rows ?? []) {
    counters[r.counter_key as string] = r.value as number;
  }

  return NextResponse.json({ counters, date: today });
}

/**
 * POST /api/daily-tasks/counters — increment a counter by +1.
 * Body: { counterKey, taskKey, date? }
 *
 * Threshold is now read server-side from daily_task_templates.target_count
 * (no longer trusted from the client). The legacy `threshold` body field is
 * still accepted as a fallback for any caller that hasn't been updated, but
 * the DB row wins when present.
 *
 * If the new value reaches threshold, the backing task is marked complete.
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { counterKey, taskKey } = body as {
    counterKey: string;
    taskKey: string;
    threshold?: number;
    date?: string;
  };

  if (!counterKey || typeof counterKey !== "string" || counterKey.length > 50) {
    return NextResponse.json({ error: "Invalid counterKey" }, { status: 400 });
  }
  if (!taskKey || typeof taskKey !== "string" || taskKey.length > 100) {
    return NextResponse.json({ error: "Invalid taskKey" }, { status: 400 });
  }

  const today = getLocalDate(req, body);
  const db = supabaseForUserData();

  // Look up template-defined threshold (single source of truth).
  const { data: tmpl } = await db
    .from("daily_task_templates")
    .select("target_count")
    .eq("user_id", user.id)
    .eq("id", taskKey)
    .maybeSingle();

  const fallback =
    typeof body.threshold === "number" && Number.isFinite(body.threshold) && body.threshold > 0
      ? body.threshold
      : null;
  const threshold = tmpl?.target_count ?? fallback;
  if (!threshold || threshold <= 0) {
    return NextResponse.json({ error: "No threshold configured for this task" }, { status: 400 });
  }

  const { data: newValue, error: rpcErr } = await db.rpc(
    "increment_daily_task_counter",
    { p_user_id: user.id, p_date: today, p_key: counterKey },
  );
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }
  const value = typeof newValue === "number" ? newValue : 0;

  let completed = false;
  if (value >= threshold) {
    const { error: taskErr } = await db.from("daily_tasks").upsert(
      {
        user_id: user.id,
        task_date: today,
        task_key: taskKey,
        completed_at: new Date().toISOString(),
        auto_detected: true,
      },
      { onConflict: "user_id,task_date,task_key", ignoreDuplicates: false },
    );
    if (!taskErr) completed = true;
  }

  return NextResponse.json({ value, completed, threshold });
}
