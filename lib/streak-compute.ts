/**
 * Forgiving streak algorithm — computes a user's current/longest streak from
 * raw daily completion counts and freeze records. Pure function so it can be
 * unit-tested without a DB.
 *
 * Rules (matches the spec in components/daily-tasks):
 *   - A day is "complete" if completedTaskCount >= ceil(templateCount * threshold / 100)
 *     (default threshold 100% — every task done).
 *   - A day in the freezes set never breaks the streak (skipped over, not
 *     counted as miss). Sick day / travel mode mark days here.
 *   - Walking back from `today` (today inclusive):
 *       - Today incomplete is OK (mid-day) — anchor effective start at yesterday
 *         instead of breaking immediately.
 *       - 2 consecutive non-frozen non-complete days → break.
 *       - 1 miss inside any rolling 7-day window is OK; a 2nd miss inside the
 *         same window → break. ("Never miss twice" / Atomic Habits.)
 *   - Status:
 *       'active'     — last activity was today or yesterday, no warning
 *       'at_risk'    — used the 7-day window's 1 miss budget (one more = break)
 *       'frozen'     — today is in the freezes set
 *       'broken'     — current_streak === 0 AND there was activity in the
 *                      last 14 days (otherwise 'active' for new users)
 *
 * Caller is responsible for converting to the user's local date *before*
 * passing into this function — everything here is in plain `YYYY-MM-DD`
 * strings, no timezone math.
 */

export type DayCompletion = {
    /** YYYY-MM-DD in user's local timezone */
    date: string;
    /** distinct completed task_keys on this date */
    completedCount: number;
};

export type StreakInput = {
    today: string; // YYYY-MM-DD
    completionsByDate: Map<string, number>; // date -> distinctCompletedTaskCount
    frozenDates: Set<string>; // dates marked sick_day or travel
    templateCount: number; // current number of tasks in the user's template
    thresholdPct?: number; // default 100
    /** How many calendar days back to scan. 90 covers ~3 months which is plenty
     *  for both current-streak and longest-streak in this dataset. */
    lookbackDays?: number;
};

export type StreakStatus =
    | "active"
    | "at_risk"
    | "frozen"
    | "broken"
    | "never_started";

export type StreakOutput = {
    currentStreak: number;
    longestStreak: number;
    lastActiveDate: string | null;
    /** Misses within the last 7 calendar days (today inclusive). */
    missCountThisWeek: number;
    minRequiredTasks: number;
    status: StreakStatus;
    /** True when yesterday was a miss + today not yet complete + within recovery window. */
    yesterdayMissed: boolean;
};

function addDays(date: string, delta: number): string {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

function isComplete(
    completionsByDate: Map<string, number>,
    date: string,
    minRequired: number,
): boolean {
    return (completionsByDate.get(date) ?? 0) >= minRequired;
}

export function computeStreak(input: StreakInput): StreakOutput {
    const {
        today,
        completionsByDate,
        frozenDates,
        templateCount,
        thresholdPct = 100,
        lookbackDays = 90,
    } = input;

    const minRequired = Math.max(
        1,
        Math.ceil((templateCount || 5) * (thresholdPct / 100)),
    );

    // Earliest date the user has any activity. Days older than this are
    // "before the user signed up" — they're not misses, just pre-history.
    // Without this anchor, a brand-new "5 in a row" user looks `at_risk`
    // because day-6 and day-7 (pre-existence) get counted as missed days.
    let oldestActivity: string | null = null;
    for (const date of completionsByDate.keys()) {
        if (oldestActivity === null || date < oldestActivity) {
            oldestActivity = date;
        }
    }

    // --- Walk back from today, build current run ---
    let cursor = today;
    let currentRun = 0;
    let lastActive: string | null = null;
    let consecutiveMisses = 0;
    // Misses spent inside the current run (forgivable, within 7-day window).
    const currentRunMisses: string[] = [];

    const cursorAtToday = today;

    for (let i = 0; i < lookbackDays; i += 1) {
        const day = cursor;
        // Walked past the user's first-ever activity → stop, the user wasn't
        // around earlier so don't count those days as misses.
        if (oldestActivity !== null && day < oldestActivity) break;
        const frozen = frozenDates.has(day);
        const complete = isComplete(completionsByDate, day, minRequired);

        if (frozen) {
            // Frozen days don't break the streak and don't count toward the run
            // (they're "paused"). Reset consecutive-miss counter.
            consecutiveMisses = 0;
        } else if (complete) {
            currentRun += 1;
            consecutiveMisses = 0;
            if (lastActive === null) lastActive = day;
        } else {
            // Miss.
            // Special case: today's miss is OK because the day is still in
            // progress — anchor the streak at yesterday instead of breaking.
            if (day === cursorAtToday && i === 0) {
                cursor = addDays(cursor, -1);
                continue;
            }
            consecutiveMisses += 1;
            if (consecutiveMisses >= 2) break;
            // Track miss date and check 7-day rolling window.
            currentRunMisses.push(day);
            const windowStart = addDays(day, -6);
            const inWindow = currentRunMisses.filter((d) => d >= windowStart).length;
            if (inWindow >= 2) break;
            // 1 miss within the 7-day window is forgiven — keep the run going.
        }
        cursor = addDays(cursor, -1);
    }

    // --- Longest streak: scan once more, tracking every run length ---
    let longestRun = 0;
    let runHere = 0;
    let consecMissHere = 0;
    let missDatesHere: string[] = [];
    cursor = today;
    for (let i = 0; i < lookbackDays; i += 1) {
        const day = cursor;
        const frozen = frozenDates.has(day);
        const complete = isComplete(completionsByDate, day, minRequired);

        if (frozen) {
            consecMissHere = 0;
        } else if (complete) {
            runHere += 1;
            if (runHere > longestRun) longestRun = runHere;
            consecMissHere = 0;
        } else {
            consecMissHere += 1;
            if (consecMissHere >= 2) {
                runHere = 0;
                missDatesHere = [];
            } else {
                missDatesHere.push(day);
                const windowStart = addDays(day, -6);
                const inWindow = missDatesHere.filter((d) => d >= windowStart).length;
                if (inWindow >= 2) {
                    runHere = 0;
                    missDatesHere = [];
                }
            }
        }
        cursor = addDays(cursor, -1);
    }
    if (currentRun > longestRun) longestRun = currentRun;

    // --- Misses in last 7 days (today inclusive), excluding frozen ---
    // Only count *forgiven* misses inside the active run window — not "pre-
    // streak" days where the user simply hadn't started using the app yet.
    // (Otherwise a brand-new "5 in a row" user would show as `at_risk`
    // because days before they signed up look like misses.)
    const windowStart = addDays(today, -6);
    const missCountThisWeek = currentRunMisses.filter(
        (d) => d >= windowStart,
    ).length;

    const yesterdayMissed =
        !frozenDates.has(addDays(today, -1)) &&
        !isComplete(completionsByDate, addDays(today, -1), minRequired);

    let status: StreakStatus;
    if (frozenDates.has(today)) status = "frozen";
    else if (currentRun === 0) {
        const recentActivity = (() => {
            for (let i = 0; i < 14; i += 1) {
                if ((completionsByDate.get(addDays(today, -i)) ?? 0) > 0) return true;
            }
            return false;
        })();
        status = recentActivity ? "broken" : "never_started";
    } else if (missCountThisWeek >= 1) status = "at_risk";
    else status = "active";

    return {
        currentStreak: currentRun,
        longestStreak: longestRun,
        lastActiveDate: lastActive,
        missCountThisWeek,
        minRequiredTasks: minRequired,
        status,
        yesterdayMissed,
    };
}
