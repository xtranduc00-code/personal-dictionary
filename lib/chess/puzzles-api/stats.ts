/**
 * Progress / stats aggregation against `chess_attempts` joined with the
 * Lichess library and the user's game-extracted puzzles.
 *
 * "Attempted" = distinct puzzles touched. A puzzle attempted three times
 * counts once. "Solved" = any attempt for that puzzle had `solved=true`.
 *
 * Every query takes a `userId` — `chess_attempts` is RLS-enabled and the
 * server bypasses RLS via service role, so the scope filter is applied
 * manually. Same pattern as `chess_games`, `notes`, etc.
 */
import { pgOne, pgRows } from "./db";
import { getThemeByKey } from "./themes-data";

export interface ThemeStat {
  theme: string;
  /** Human-readable name from themes.json; falls back to the key if absent. */
  name: string;
  attempted: number;
  solved: number;
  accuracyPct: number;
}

export interface RecentAttempt {
  puzzleId: string;
  attemptedAt: number;     // unix ms
  solved: boolean;
  hintsUsed: number;
  durationMs: number;
  rating: number;
  level: string;
  themes: string[];
}

export interface ProgressStats {
  totalAttempted: number;  // distinct puzzles touched
  totalSolved: number;     // distinct puzzles ever solved
  accuracyPct: number;     // 0..100
  todayAttempts: number;   // raw attempt rows today (local TZ)
  streakDays: number;      // consecutive days ending today (or yesterday) with ≥1 attempt
  weakestThemes: ThemeStat[];
  recentAttempts: RecentAttempt[];
}

/** A composite key identifying any attempt: either a Lichess puzzle id or a
 *  game-puzzle id. The DB enforces exactly-one-non-null. */
function attemptKey(r: { lib_puzzle_id: string | null; game_puzzle_id: string | null }): string {
  return r.lib_puzzle_id ?? r.game_puzzle_id ?? "";
}

/** Distinct local dates that have at least one attempt, newest first. The
 *  client's local timezone is computed in JS — Postgres only knows UTC. */
async function attemptDays(userId: string): Promise<string[]> {
  // Pull just the timestamps; the streak window is small (last ~year of
  // active days) so transferring a few hundred dates is cheap, and doing
  // the local-TZ bucket in JS avoids needing to round-trip a TZ name to PG.
  const rows = await pgRows<{ attempted_at: Date }>(
    `SELECT attempted_at FROM public.chess_attempts WHERE user_id = $1
      ORDER BY attempted_at DESC LIMIT 5000`,
    [userId],
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const day = new Date(r.attempted_at).toLocaleDateString("sv-SE");
    if (!seen.has(day)) {
      seen.add(day);
      out.push(day);
    }
  }
  return out;
}

/** Walk the distinct attempt-days backwards from today (or yesterday if
 *  today is empty). Stops as soon as a gap appears. */
function computeStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const today = new Date();
  const fmt = (d: Date) => d.toLocaleDateString("sv-SE");
  const todayStr = fmt(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = fmt(yesterday);

  if (days[0] !== todayStr && days[0] !== yesterdayStr) return 0;

  let streak = 0;
  const cursor = new Date(`${days[0]}T00:00:00`);
  let i = 0;
  while (i < days.length && days[i] === fmt(cursor)) {
    streak++;
    i++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function loadThemesFor(ids: string[]): Promise<Map<string, string[]>> {
  if (ids.length === 0) return new Map();
  const rows = await pgRows<{ puzzle_id: string; theme: string }>(
    `SELECT puzzle_id, theme FROM public.chess_lib_themes
      WHERE puzzle_id = ANY($1::text[])`,
    [ids],
  );
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.puzzle_id);
    if (list) list.push(r.theme);
    else out.set(r.puzzle_id, [r.theme]);
  }
  return out;
}

export async function getProgressStats(userId: string): Promise<ProgressStats> {
  // Headline counters — distinct puzzles touched / solved. Library and game
  // puzzles share the same attempt table; we count distinct attempts where
  // at least one of the FKs is set (the CHECK guarantees one is).
  const totalsRow = await pgOne<{ attempted: string | number; solved: string | number }>(
    `SELECT
       COUNT(DISTINCT COALESCE(lib_puzzle_id, game_puzzle_id)) AS attempted,
       COUNT(DISTINCT CASE WHEN solved THEN COALESCE(lib_puzzle_id, game_puzzle_id) END) AS solved
     FROM public.chess_attempts
     WHERE user_id = $1`,
    [userId],
  );
  const totalAttempted = Number(totalsRow?.attempted ?? 0);
  const totalSolved = Number(totalsRow?.solved ?? 0);
  const accuracyPct =
    totalAttempted > 0 ? Math.round((totalSolved / totalAttempted) * 1000) / 10 : 0;

  // "Today" — raw attempt rows. We pull the most recent batch and count in
  // JS so the local-TZ comparison matches the streak logic.
  const recentForToday = await pgRows<{ attempted_at: Date }>(
    `SELECT attempted_at FROM public.chess_attempts
      WHERE user_id = $1 AND attempted_at >= NOW() - INTERVAL '36 hours'`,
    [userId],
  );
  const todayStr = new Date().toLocaleDateString("sv-SE");
  const todayAttempts = recentForToday.filter(
    (r) => new Date(r.attempted_at).toLocaleDateString("sv-SE") === todayStr,
  ).length;

  const days = await attemptDays(userId);
  const streakDays = computeStreak(days);

  // Per-theme weakness — collapse multiple attempts on the same puzzle into
  // a single solved/unsolved outcome (any successful attempt → solved).
  // Only Lichess puzzles count here: `chess_lib_themes` is the only theme
  // source that's normalised. Game puzzles store themes as a free-text
  // column on the row itself; mixing them in would require a different
  // pivot and the chips are Lichess-flavoured anyway.
  const themeRows = await pgRows<{
    theme: string;
    attempted: string | number;
    solved: string | number;
  }>(
    `WITH puzzle_outcome AS (
       SELECT lib_puzzle_id AS puzzle_id, BOOL_OR(solved) AS solved
         FROM public.chess_attempts
        WHERE user_id = $1 AND lib_puzzle_id IS NOT NULL
        GROUP BY lib_puzzle_id
     )
     SELECT t.theme,
            COUNT(*)                                     AS attempted,
            SUM(CASE WHEN po.solved THEN 1 ELSE 0 END)   AS solved
       FROM puzzle_outcome po
       JOIN public.chess_lib_themes t ON t.puzzle_id = po.puzzle_id
      GROUP BY t.theme
     HAVING COUNT(*) >= 5
      ORDER BY (1.0 * SUM(CASE WHEN po.solved THEN 1 ELSE 0 END) / COUNT(*)) ASC,
               attempted DESC
      LIMIT 20`,
    [userId],
  );

  const weakestThemes: ThemeStat[] = await Promise.all(
    themeRows.map(async (r) => {
      const meta = await getThemeByKey(r.theme);
      const attemptedN = Number(r.attempted);
      const solvedN = Number(r.solved);
      return {
        theme: r.theme,
        name: meta?.entry.name ?? r.theme,
        attempted: attemptedN,
        solved: solvedN,
        accuracyPct: attemptedN > 0
          ? Math.round((solvedN / attemptedN) * 1000) / 10
          : 0,
      };
    }),
  );

  // Recent 20 attempts. LEFT JOIN both library and game-puzzle tables and
  // COALESCE rating/level so neither source drops out of the recent list.
  const recentRows = await pgRows<{
    lib_puzzle_id: string | null;
    game_puzzle_id: string | null;
    attempted_at: Date;
    solved: boolean;
    hints_used: number;
    duration_ms: number;
    rating: number;
    level: string;
    is_game_puzzle: boolean;
    gp_themes: string | null;
  }>(
    `SELECT a.lib_puzzle_id,
            a.game_puzzle_id,
            a.attempted_at,
            a.solved,
            a.hints_used,
            a.duration_ms,
            COALESCE(p.rating, gp.swing_cp)         AS rating,
            COALESCE(p.level,  'from-my-games')     AS level,
            (gp.id IS NOT NULL)                     AS is_game_puzzle,
            gp.themes                               AS gp_themes
       FROM public.chess_attempts a
  LEFT JOIN public.chess_lib_puzzles  p  ON p.puzzle_id = a.lib_puzzle_id
  LEFT JOIN public.chess_game_puzzles gp ON gp.id       = a.game_puzzle_id
      WHERE a.user_id = $1
        AND (p.puzzle_id IS NOT NULL OR gp.id IS NOT NULL)
      ORDER BY a.attempted_at DESC
      LIMIT 20`,
    [userId],
  );

  const lichessIds = recentRows
    .filter((r) => !r.is_game_puzzle && r.lib_puzzle_id)
    .map((r) => r.lib_puzzle_id!) as string[];
  const themesByPuzzle = await loadThemesFor(lichessIds);
  const recentAttempts: RecentAttempt[] = recentRows.map((r) => {
    const id = r.lib_puzzle_id ?? r.game_puzzle_id ?? "";
    return {
      puzzleId: id,
      attemptedAt: new Date(r.attempted_at).getTime(),
      solved: r.solved,
      hintsUsed: r.hints_used,
      durationMs: r.duration_ms,
      rating: r.rating,
      level: r.level,
      themes: r.is_game_puzzle
        ? (r.gp_themes ?? "").split(" ").filter(Boolean)
        : (themesByPuzzle.get(id) ?? []),
    };
  });

  return {
    totalAttempted,
    totalSolved,
    accuracyPct,
    todayAttempts,
    streakDays,
    weakestThemes,
    recentAttempts,
  };
}

/** Used by the legacy attempt key — exported so route code can compose it. */
export { attemptKey };
