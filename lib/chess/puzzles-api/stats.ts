/**
 * Progress / stats aggregation. Reads from `progress.attempts` (the local
 * attempt log) joined against the puzzle dataset. All queries run via the
 * same `getDb()` connection that has the puzzles file as main + progress
 * attached as `progress`.
 *
 * "Attempted" semantics throughout this module = distinct puzzles touched.
 * A puzzle attempted three times is counted once. "Solved" = any attempt
 * for that puzzle had `solved=1`. This matches the user's mental model
 * ("I solved 3 of 10 puzzles") rather than per-row try-count semantics.
 */
import { getDb } from "./db";
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

/** Distinct local dates that have at least one attempt, newest first.
 *  Returns YYYY-MM-DD strings. SQLite's `date()` with `'localtime'` does the
 *  TZ conversion so we don't have to round-trip through JS. */
function attemptDays(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT date(attempted_at / 1000, 'unixepoch', 'localtime') AS day
         FROM progress.attempts
        ORDER BY day DESC`,
    )
    .all() as { day: string }[];
  return rows.map((r) => r.day);
}

/** Walk the distinct attempt-days backwards from today (or yesterday if
 *  today is empty — a streak should be forgiving of "haven't trained yet
 *  today" until the day ends). Stops as soon as a gap appears. */
function computeStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const today = new Date();
  // Local YYYY-MM-DD using sv-SE locale (canonical ISO date format).
  const fmt = (d: Date) => d.toLocaleDateString("sv-SE");
  const todayStr = fmt(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = fmt(yesterday);

  // Anchor: streak counts only if the most recent attempt was today or
  // yesterday. Anything older = streak broken.
  if (days[0] !== todayStr && days[0] !== yesterdayStr) return 0;

  let streak = 0;
  // Walk a moving cursor day-by-day backwards from the anchor. We only
  // increment when the cursor matches the next day in the distinct list.
  // The Date is mutated via setDate; the binding itself never reassigns.
  const cursor = new Date(`${days[0]}T00:00:00`);
  let i = 0;
  while (i < days.length && days[i] === fmt(cursor)) {
    streak++;
    i++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function loadThemesFor(ids: string[]): Map<string, string[]> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT puzzle_id, theme FROM puzzle_themes WHERE puzzle_id IN (${placeholders})`,
    )
    .all(...ids) as { puzzle_id: string; theme: string }[];
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.puzzle_id);
    if (list) list.push(r.theme);
    else out.set(r.puzzle_id, [r.theme]);
  }
  return out;
}

export async function getProgressStats(): Promise<ProgressStats> {
  const db = getDb();

  // Headline counters — distinct puzzles touched / solved.
  const totalsRow = db
    .prepare(
      `SELECT
         (SELECT COUNT(DISTINCT puzzle_id) FROM progress.attempts) AS attempted,
         (SELECT COUNT(DISTINCT puzzle_id) FROM progress.attempts WHERE solved = 1) AS solved`,
    )
    .get() as { attempted: number; solved: number };
  const totalAttempted = totalsRow.attempted;
  const totalSolved = totalsRow.solved;
  const accuracyPct =
    totalAttempted > 0 ? Math.round((totalSolved / totalAttempted) * 1000) / 10 : 0;

  // "Today" — raw attempt rows (lets the user see "I trained 12 times today"
  // even if they hammered the same puzzle, which is a useful signal).
  const todayRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM progress.attempts
        WHERE date(attempted_at / 1000, 'unixepoch', 'localtime')
            = date('now', 'localtime')`,
    )
    .get() as { n: number };

  const days = attemptDays();
  const streakDays = computeStreak(days);

  // Per-theme weakness — distinct puzzles per theme + solved-count, then
  // pick the lowest accuracy with ≥5 puzzles attempted. Inner CTE collapses
  // multiple attempts on the same puzzle into a single solved/unsolved
  // outcome (any successful attempt → solved).
  const themeRows = db
    .prepare(
      `WITH puzzle_outcome AS (
         SELECT puzzle_id, MAX(solved) AS solved
           FROM progress.attempts
          GROUP BY puzzle_id
       )
       SELECT t.theme            AS theme,
              COUNT(*)           AS attempted,
              SUM(po.solved)     AS solved
         FROM puzzle_outcome po
         JOIN puzzle_themes t ON t.puzzle_id = po.puzzle_id
        GROUP BY t.theme
       HAVING COUNT(*) >= 5
        ORDER BY (1.0 * SUM(po.solved) / COUNT(*)) ASC, attempted DESC
        LIMIT 20`,
    )
    .all() as { theme: string; attempted: number; solved: number }[];

  const weakestThemes: ThemeStat[] = await Promise.all(
    themeRows.map(async (r) => {
      const meta = await getThemeByKey(r.theme);
      return {
        theme: r.theme,
        name: meta?.entry.name ?? r.theme,
        attempted: r.attempted,
        solved: r.solved,
        accuracyPct: r.attempted > 0
          ? Math.round((r.solved / r.attempted) * 1000) / 10
          : 0,
      };
    }),
  );

  // Recent 20 attempts. The attempt log can hold both Lichess puzzles
  // (`puzzles.puzzles`) and game-extracted puzzles (`progress.game_puzzles`),
  // so we LEFT JOIN both and COALESCE the rating / level so neither
  // source is dropped from the recent list.
  const recentRows = db
    .prepare(
      `SELECT a.puzzle_id,
              a.attempted_at,
              a.solved,
              a.hints_used,
              a.duration_ms,
              COALESCE(p.rating, gp.swing_cp)         AS rating,
              COALESCE(p.level,  'from-my-games')    AS level,
              CASE WHEN gp.id IS NOT NULL THEN 1 ELSE 0 END AS is_game_puzzle,
              gp.themes                              AS gp_themes
         FROM progress.attempts a
    LEFT JOIN puzzles p              ON p.puzzle_id = a.puzzle_id
    LEFT JOIN progress.game_puzzles gp ON gp.id      = a.puzzle_id
        WHERE p.puzzle_id IS NOT NULL OR gp.id IS NOT NULL
        ORDER BY a.attempted_at DESC
        LIMIT 20`,
    )
    .all() as {
      puzzle_id: string;
      attempted_at: number;
      solved: number;
      hints_used: number;
      duration_ms: number;
      rating: number;
      level: string;
      is_game_puzzle: number;
      gp_themes: string | null;
    }[];

  // Lichess themes come from puzzle_themes (junction); game-puzzle themes
  // are stored space-joined on the row itself. Build one map per source.
  const lichessIds = recentRows
    .filter((r) => !r.is_game_puzzle)
    .map((r) => r.puzzle_id);
  const themesByPuzzle = loadThemesFor(lichessIds);
  const recentAttempts: RecentAttempt[] = recentRows.map((r) => ({
    puzzleId: r.puzzle_id,
    attemptedAt: r.attempted_at,
    solved: r.solved === 1,
    hintsUsed: r.hints_used,
    durationMs: r.duration_ms,
    rating: r.rating,
    level: r.level,
    themes: r.is_game_puzzle
      ? (r.gp_themes ?? "").split(" ").filter(Boolean)
      : (themesByPuzzle.get(r.puzzle_id) ?? []),
  }));

  return {
    totalAttempted,
    totalSolved,
    accuracyPct,
    todayAttempts: todayRow.n,
    streakDays,
    weakestThemes,
    recentAttempts,
  };
}
