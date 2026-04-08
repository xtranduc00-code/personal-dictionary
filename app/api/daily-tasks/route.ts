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

/** GET /api/daily-tasks?date=YYYY-MM-DD&keys=a,b,c — today's completions + streak */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = getLocalDate(req);
  const db = supabaseForUserData();

  // Client sends the active task keys so we know what to return
  const url = new URL(req.url);
  const keysParam = url.searchParams.get("keys");
  const requestedKeys = keysParam ? keysParam.split(",").filter(Boolean) : [];

  const { data: rows } = await db
    .from("daily_tasks")
    .select("task_key, completed_at")
    .eq("user_id", user.id)
    .eq("task_date", today);

  const completedMap = new Map((rows ?? []).map((r) => [r.task_key, r.completed_at]));

  // Return completions for requested keys (or all DB rows if no keys specified)
  const tasks = requestedKeys.length > 0
    ? requestedKeys.map((key) => ({ taskKey: key, completedAt: completedMap.get(key) ?? null }))
    : (rows ?? []).map((r) => ({ taskKey: r.task_key, completedAt: r.completed_at }));

  const { data: streakRow } = await db.rpc("daily_tasks_streak", { p_user_id: user.id });
  const streak = typeof streakRow === "number" ? streakRow : 0;

  return NextResponse.json({ tasks, streak, date: today });
}

/** POST /api/daily-tasks — mark task complete/incomplete */
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

  const { data: streakRow } = await db.rpc("daily_tasks_streak", { p_user_id: user.id });
  const streak = typeof streakRow === "number" ? streakRow : 0;

  return NextResponse.json({ ok: true, streak });
}
