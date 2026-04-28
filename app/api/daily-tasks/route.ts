import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import { getStreakStatus } from "@/lib/streak-status";

function getLocalDate(req: Request, body?: { date?: string }): string {
  const fromBody = body?.date;
  if (fromBody && /^\d{4}-\d{2}-\d{2}$/.test(fromBody)) return fromBody;
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("date");
  if (fromQuery && /^\d{4}-\d{2}-\d{2}$/.test(fromQuery)) return fromQuery;
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/daily-tasks?date=YYYY-MM-DD&keys=a,b,c
 *   → today's completions + full streak status object
 *
 * `streak` is now the rich StreakStatusPayload (current/longest/status/
 * needsSkipRecoveryPrompt/freezesRemaining/...). Old callers reading
 * `streak` as a number will silently get NaN — adjacent commit updates the
 * single client (DailyTasksContext) to consume the new shape.
 */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = getLocalDate(req);
  const db = supabaseForUserData();

  const url = new URL(req.url);
  const keysParam = url.searchParams.get("keys");
  const requestedKeys = keysParam ? keysParam.split(",").filter(Boolean) : [];

  const [tasksRes, streak] = await Promise.all([
    db
      .from("daily_tasks")
      .select("task_key, completed_at")
      .eq("user_id", user.id)
      .eq("task_date", today),
    getStreakStatus(user.id, today),
  ]);

  const completedMap = new Map(
    (tasksRes.data ?? []).map((r) => [r.task_key, r.completed_at]),
  );

  const tasks = requestedKeys.length > 0
    ? requestedKeys.map((key) => ({ taskKey: key, completedAt: completedMap.get(key) ?? null }))
    : (tasksRes.data ?? []).map((r) => ({ taskKey: r.task_key, completedAt: r.completed_at }));

  if (process.env.NODE_ENV === "production") {
    console.log(
      "[streak] status",
      JSON.stringify({
        user: user.id.slice(0, 8),
        date: today,
        current: streak.currentStreak,
        longest: streak.longestStreak,
        status: streak.status,
        miss_week: streak.missCountThisWeek,
        needs_recovery: streak.needsSkipRecoveryPrompt,
      }),
    );
  }

  return NextResponse.json({ tasks, streak, date: today });
}

/** POST /api/daily-tasks — mark task complete/incomplete (idempotent upsert) */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { taskKey, completed = true, autoDetected = false } = body as {
    taskKey: string;
    completed?: boolean;
    autoDetected?: boolean;
    date?: string;
  };

  if (!taskKey || typeof taskKey !== "string" || taskKey.length > 100) {
    return NextResponse.json({ error: "Invalid task key" }, { status: 400 });
  }

  const today = getLocalDate(req, body);
  const db = supabaseForUserData();

  if (completed) {
    const { error } = await db.from("daily_tasks").upsert(
      {
        user_id: user.id,
        task_date: today,
        task_key: taskKey,
        completed_at: new Date().toISOString(),
        auto_detected: autoDetected,
      },
      { onConflict: "user_id,task_date,task_key", ignoreDuplicates: false }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    await db
      .from("daily_tasks")
      .delete()
      .eq("user_id", user.id)
      .eq("task_date", today)
      .eq("task_key", taskKey);
  }

  const streak = await getStreakStatus(user.id, today);

  if (process.env.NODE_ENV === "production") {
    console.log(
      "[streak] tick",
      JSON.stringify({
        user: user.id.slice(0, 8),
        task: taskKey,
        date: today,
        completed,
        current: streak.currentStreak,
      }),
    );
  }

  return NextResponse.json({ ok: true, streak });
}
