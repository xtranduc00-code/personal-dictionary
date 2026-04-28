/**
 * Server-side glue between the Supabase daily_tasks / streak_freezes /
 * daily_task_templates tables and the pure `computeStreak` algorithm.
 *
 * Single entry point so both the existing `/api/daily-tasks` route and the
 * new `/api/streak/*` routes return the same shape — keeps the frontend
 * code path simple (one StreakStatus type) and means logging/regression
 * checks only need to look in one place.
 */

import { computeStreak, type StreakOutput } from "@/lib/streak-compute";
import { supabaseForUserData } from "@/lib/supabase-server";

const DEFAULT_LOOKBACK_DAYS = 90;
const SICK_DAYS_PER_MONTH = 1;
const TRAVEL_DAYS_PER_YEAR = 21;

export type StreakStatusPayload = StreakOutput & {
    needsSkipRecoveryPrompt: boolean;
    yesterdayCompletion: {
        completedTasks: number;
        totalTasks: number;
        complete: boolean;
    };
    freezesRemaining: {
        sickDaysThisMonth: number;
        travelDaysThisYear: number;
    };
    today: string;
};

function todayInTimezone(timezone: string): string {
    // Use Intl to get local YYYY-MM-DD in the requested timezone.
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return fmt.format(new Date()); // en-CA locale yields YYYY-MM-DD
}

function addDays(date: string, delta: number): string {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

/**
 * Compute full streak + skip-recovery status for the given user.
 * `clientToday` lets the route override today (e.g. when the client's
 * timezone differs from the stored profile timezone — frontend passes its
 * locally-resolved date so we don't double-roll the day).
 */
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

    const [completionsRes, freezesRes] = await Promise.all([
        db
            .from("daily_tasks")
            .select("task_date, task_key")
            .eq("user_id", userId)
            .gte("task_date", lookbackStart)
            .lte("task_date", today)
            .not("completed_at", "is", null),
        db
            .from("streak_freezes")
            .select("freeze_date, freeze_type")
            .eq("user_id", userId)
            .gte("freeze_date", lookbackStart)
            .lte("freeze_date", today),
    ]);

    // Group: count distinct task_key per date.
    const completionsByDate = new Map<string, number>();
    const perDateKeys = new Map<string, Set<string>>();
    for (const row of completionsRes.data ?? []) {
        const set = perDateKeys.get(row.task_date) ?? new Set<string>();
        set.add(row.task_key);
        perDateKeys.set(row.task_date, set);
    }
    for (const [date, keys] of perDateKeys) {
        completionsByDate.set(date, keys.size);
    }

    const frozenDates = new Set<string>(
        (freezesRes.data ?? []).map((r) => r.freeze_date),
    );

    const streak = computeStreak({
        today,
        completionsByDate,
        frozenDates,
        templateCount,
        thresholdPct,
        lookbackDays: DEFAULT_LOOKBACK_DAYS,
    });

    // Yesterday completion details for skip-recovery prompt.
    const yesterday = addDays(today, -1);
    const yesterdayKeys = perDateKeys.get(yesterday)?.size ?? 0;
    const yesterdayComplete = yesterdayKeys >= streak.minRequiredTasks;

    // Is the user eligible for a "you missed yesterday" prompt today?
    let needsSkipRecoveryPrompt = false;
    if (
        skipRecoveryEnabled &&
        streak.yesterdayMissed &&
        !frozenDates.has(yesterday) &&
        !yesterdayComplete
    ) {
        // Don't re-prompt if already dismissed today.
        const { data: dismissed } = await db
            .from("streak_recovery_dismissals")
            .select("action")
            .eq("user_id", userId)
            .eq("dismiss_date", today)
            .maybeSingle();
        if (!dismissed) needsSkipRecoveryPrompt = true;
    }

    // Freeze quota counts.
    const monthStart = today.slice(0, 7) + "-01";
    const yearStart = today.slice(0, 4) + "-01-01";
    const { data: freezeMonth } = await db
        .from("streak_freezes")
        .select("freeze_date, freeze_type")
        .eq("user_id", userId)
        .gte("freeze_date", monthStart)
        .lte("freeze_date", today);
    const sickThisMonth = (freezeMonth ?? []).filter(
        (r) => r.freeze_type === "sick_day",
    ).length;
    const { data: freezeYear } = await db
        .from("streak_freezes")
        .select("freeze_date, freeze_type")
        .eq("user_id", userId)
        .gte("freeze_date", yearStart)
        .lte("freeze_date", today);
    const travelThisYear = (freezeYear ?? []).filter(
        (r) => r.freeze_type === "travel",
    ).length;

    return {
        ...streak,
        needsSkipRecoveryPrompt,
        yesterdayCompletion: {
            completedTasks: yesterdayKeys,
            totalTasks: templateCount,
            complete: yesterdayComplete,
        },
        freezesRemaining: {
            sickDaysThisMonth: Math.max(0, SICK_DAYS_PER_MONTH - sickThisMonth),
            travelDaysThisYear: Math.max(0, TRAVEL_DAYS_PER_YEAR - travelThisYear),
        },
        today,
    };
}

export const STREAK_QUOTAS = {
    SICK_DAYS_PER_MONTH,
    TRAVEL_DAYS_PER_YEAR,
};
