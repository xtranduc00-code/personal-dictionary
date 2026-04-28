/**
 * Server-side glue between Supabase tables and the pure `computeStreak`
 * algorithm. Single entry point so both `/api/daily-tasks` and the new
 * `/api/streak/*` routes return the same shape.
 *
 * Freeze (sick day / travel) was removed — see streak_v3_remove_freezes.sql.
 * Forgiveness via 1-miss/7-day window is the only relaxation now.
 */

import { computeStreak, type StreakOutput } from "@/lib/streak-compute";
import { supabaseForUserData } from "@/lib/supabase-server";

const DEFAULT_LOOKBACK_DAYS = 90;

export type StreakStatusPayload = StreakOutput & {
    needsSkipRecoveryPrompt: boolean;
    yesterdayCompletion: {
        completedTasks: number;
        totalTasks: number;
        complete: boolean;
    };
    today: string;
};

function todayInTimezone(timezone: string): string {
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return fmt.format(new Date());
}

function addDays(date: string, delta: number): string {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

export async function getStreakStatus(
    userId: string,
    clientToday?: string,
): Promise<StreakStatusPayload> {
    const db = supabaseForUserData();

    const [{ data: prefs }, { data: templates }] = await Promise.all([
        db
            .from("user_streak_prefs")
            .select("timezone, threshold_pct, skip_recovery_enabled, streak_enabled")
            .eq("user_id", userId)
            .maybeSingle(),
        db
            .from("daily_task_templates")
            .select("id")
            .eq("user_id", userId),
    ]);

    const timezone = prefs?.timezone ?? "Asia/Bangkok";
    const thresholdPct = prefs?.threshold_pct ?? 100;
    const skipRecoveryEnabled = prefs?.skip_recovery_enabled ?? true;
    const today = clientToday ?? todayInTimezone(timezone);
    const templateCount = templates?.length ?? 5;

    const lookbackStart = addDays(today, -(DEFAULT_LOOKBACK_DAYS - 1));

    const { data: completions } = await db
        .from("daily_tasks")
        .select("task_date, task_key")
        .eq("user_id", userId)
        .gte("task_date", lookbackStart)
        .lte("task_date", today)
        .not("completed_at", "is", null);

    const completionsByDate = new Map<string, number>();
    const perDateKeys = new Map<string, Set<string>>();
    for (const row of completions ?? []) {
        const set = perDateKeys.get(row.task_date) ?? new Set<string>();
        set.add(row.task_key);
        perDateKeys.set(row.task_date, set);
    }
    for (const [date, keys] of perDateKeys) {
        completionsByDate.set(date, keys.size);
    }

    const streak = computeStreak({
        today,
        completionsByDate,
        templateCount,
        thresholdPct,
        lookbackDays: DEFAULT_LOOKBACK_DAYS,
    });

    const yesterday = addDays(today, -1);
    const yesterdayKeys = perDateKeys.get(yesterday)?.size ?? 0;
    const yesterdayComplete = yesterdayKeys >= streak.minRequiredTasks;
    // If today is already complete, the recovery prompt is moot — user is
    // back on track, no need to remind them about yesterday's miss.
    const todayKeys = perDateKeys.get(today)?.size ?? 0;
    const todayComplete = todayKeys >= streak.minRequiredTasks;

    let needsSkipRecoveryPrompt = false;
    if (
        skipRecoveryEnabled &&
        streak.yesterdayMissed &&
        !yesterdayComplete &&
        !todayComplete
    ) {
        const { data: dismissed } = await db
            .from("streak_recovery_dismissals")
            .select("action")
            .eq("user_id", userId)
            .eq("dismiss_date", today)
            .maybeSingle();
        if (!dismissed) needsSkipRecoveryPrompt = true;
    }

    return {
        ...streak,
        needsSkipRecoveryPrompt,
        yesterdayCompletion: {
            completedTasks: yesterdayKeys,
            totalTasks: templateCount,
            complete: yesterdayComplete,
        },
        today,
    };
}
