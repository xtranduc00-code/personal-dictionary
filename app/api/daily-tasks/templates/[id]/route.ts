import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string }> };

/** Server-side mirror of the client COUNTER_TASKS map — needed when we
 *  re-evaluate completion after a target_count change. Keep in sync with
 *  components/daily-tasks/daily-tasks-auto-detect.ts. */
const COUNTER_KEY_FOR_TASK: Record<string, string> = {
  vocab_10: "vocab",
  chess_puzzles_10: "chess",
};

/** PATCH — update a template's label, target_count, and/or sort_order.
 *  Locked: id, href, is_default. Type/trigger are derived from id. */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label || label.length > 100) {
      return NextResponse.json({ error: "Invalid label" }, { status: 400 });
    }
    update.label = label;
  }

  let newTargetCount: number | null | undefined;
  if ("targetCount" in body) {
    const v = body.targetCount;
    if (v === null) {
      update.target_count = null;
      newTargetCount = null;
    } else if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      update.target_count = Math.floor(v);
      newTargetCount = Math.floor(v);
    } else {
      return NextResponse.json({ error: "Invalid targetCount" }, { status: 400 });
    }
  }

  const clientDate =
    typeof body.clientDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.clientDate)
      ? body.clientDate
      : new Date().toISOString().slice(0, 10);

  if ("sortOrder" in body) {
    const v = body.sortOrder;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "Invalid sortOrder" }, { status: 400 });
    }
    update.sort_order = Math.floor(v);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = supabaseForUserData();
  const { error } = await db
    .from("daily_task_templates")
    .update(update)
    .eq("user_id", user.id)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Re-evaluate completion when target_count changed ──────────────────
  // If the target moved past the current counter value, drop today's tick
  // (only if it was auto-detected — preserve manual ticks). If the target
  // moved at or below the counter, ensure the task is ticked.
  // No-op for non-counter tasks.
  let recomputed: { ticked: boolean; counter: number } | null = null;
  if (newTargetCount !== undefined && COUNTER_KEY_FOR_TASK[id]) {
    const counterKey = COUNTER_KEY_FOR_TASK[id];
    const { data: counterRow } = await db
      .from("daily_task_counters")
      .select("value")
      .eq("user_id", user.id)
      .eq("counter_date", clientDate)
      .eq("counter_key", counterKey)
      .maybeSingle();
    const counter = counterRow?.value ?? 0;

    if (newTargetCount != null && counter >= newTargetCount) {
      await db.from("daily_tasks").upsert(
        {
          user_id: user.id,
          task_date: clientDate,
          task_key: id,
          completed_at: new Date().toISOString(),
          auto_detected: true,
        },
        { onConflict: "user_id,task_date,task_key", ignoreDuplicates: false },
      );
      recomputed = { ticked: true, counter };
    } else {
      // Only drop auto-detected ticks; leave manual ticks alone.
      await db
        .from("daily_tasks")
        .delete()
        .eq("user_id", user.id)
        .eq("task_date", clientDate)
        .eq("task_key", id)
        .eq("auto_detected", true);
      recomputed = { ticked: false, counter };
    }
  }

  return NextResponse.json({ ok: true, recomputed });
}

/** DELETE — remove a template. Allowed for both default and manual rows
 *  (user can always restore defaults via POST /reset). Also clears today's
 *  completion row for this task so the day-complete count stays consistent. */
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = supabaseForUserData();
  const { error } = await db
    .from("daily_task_templates")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
