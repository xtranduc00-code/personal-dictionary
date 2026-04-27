/**
 * Puzzle repository — Postgres-backed reads against the Lichess subset
 * imported into Supabase (`chess_lib_*` tables).
 *
 * This is a port of the original `better-sqlite3` repository. The query
 * shapes (multi-theme AND, opening OR, popularity sort, count probe) are
 * preserved verbatim, with two adjustments for Postgres:
 *   1. Parameter syntax `?` → `$1, $2 …` (pg uses positional $-args).
 *   2. `RANDOM()` is the same in Postgres; rowid-jump trick is gone — we
 *      just `ORDER BY random() LIMIT N`. For the dataset scale here (200K
 *      puzzles) the planner walks `idx_chess_lib_puzzles_level_rating`
 *      and the random sort is fast enough.
 *
 * Repo functions are async (pg is fundamentally async) — callers were
 * already `async` in the previous implementation, so signatures match.
 */
import type { LibraryPuzzle } from "@/lib/chess-types";
import { pgOne, pgRows } from "./db";
import { RATING_BUCKETS, type Level } from "./constants";

// ─── Public types ───────────────────────────────────────────────────────────

export interface PuzzleQueryFilters {
  level?: Level;
  ratingMin?: number;
  ratingMax?: number;
  /** AND match — a puzzle must carry every theme listed. */
  themes?: string[];
  /** OR match — a puzzle qualifies if it carries any one of these openings. */
  openings?: string[];
  excludeIds?: string[];
}

export type SortKey =
  | "popular"
  | "random"
  | "hardest"
  | "easiest"
  // Legacy aliases. The frontend used to send these; both now map onto the
  // SQL-level sorts above so no caller breaks during the redesign.
  | "newest"
  | "rating_asc"
  | "rating_desc";

export interface PuzzleQueryOptions {
  sort: SortKey;
  limit: number;
  offset: number;
}

export interface QueryResult {
  items: LibraryPuzzle[];
  /** Number of matching puzzles. When `totalIsCapped` is true the actual
   *  count is greater than `total` — clients should render it as e.g.
   *  "1000+ puzzles" rather than a precise figure. */
  total: number;
  /** When true, `total` is the cap (`COUNT_CAP`), not the exact match count.
   *  Exact counts are produced for filter shapes that hit a materialised
   *  lookup (single theme, single opening, level only); multi-theme AND
   *  uses an early-stopping probe to avoid scanning the full result set. */
  totalIsCapped: boolean;
}

/** Probe-cap for total counts when no fast path applies. Picked so the UI
 *  can fearlessly say "1000+" for the rare multi-theme intersections that
 *  exceed it; under it, the exact count is still surfaced. */
export const COUNT_CAP = 1000;

export interface PuzzleRepo {
  getById(id: string): Promise<LibraryPuzzle | null>;
  query(filters: PuzzleQueryFilters, options: PuzzleQueryOptions): Promise<QueryResult>;
  getOpeningTags(puzzleId: string): Promise<string[]>;
  getThemeCount(themeKey: string, level?: Level): Promise<number>;
  getOpeningCount(openingKey: string, level?: Level): Promise<number>;
  /** Legacy hook used by the "newest" sort — now a no-op. */
  getInsertionOrder(): Promise<Map<string, number>>;
}

// ─── SQL building blocks ────────────────────────────────────────────────────

interface PuzzleRow {
  puzzle_id: string;
  fen: string;
  moves: string;
  rating: number;
  level: Level;
}

/** Build a parameterised WHERE clause for a filter set.
 *
 *  Returns `{ sql, params, nextIndex }` where `nextIndex` is the next
 *  available `$N` placeholder so callers can append additional bindings
 *  (LIMIT / OFFSET) without recomputing indexes. */
function buildWhere(filters: PuzzleQueryFilters): {
  sql: string;
  params: unknown[];
  next: number;
} {
  const clauses: string[] = ["TRUE"];
  const params: unknown[] = [];
  let i = 1;

  if (filters.level) {
    clauses.push(`p.level = $${i++}`);
    params.push(filters.level);
  }
  if (filters.ratingMin != null) {
    clauses.push(`p.rating >= $${i++}`);
    params.push(filters.ratingMin);
  }
  if (filters.ratingMax != null) {
    clauses.push(`p.rating <= $${i++}`);
    params.push(filters.ratingMax);
  }

  // EXISTS-per-theme rather than `IN (SELECT … GROUP BY … HAVING COUNT)`.
  // Lets the planner walk the (level, popularity) index in order and
  // short-circuit per row at the first failed EXISTS.
  // `mix` is a Lichess meta-tag meaning "any puzzle" — treat as no-op.
  if (filters.themes && filters.themes.length > 0) {
    for (const theme of filters.themes) {
      if (theme === "mix") continue;
      clauses.push(
        `EXISTS (SELECT 1 FROM public.chess_lib_themes t
                  WHERE t.puzzle_id = p.puzzle_id AND t.theme = $${i++})`,
      );
      params.push(theme);
    }
  }

  // Openings have OR semantics across selected keys.
  if (filters.openings && filters.openings.length > 0) {
    clauses.push(
      `EXISTS (SELECT 1 FROM public.chess_lib_openings o
                WHERE o.puzzle_id = p.puzzle_id
                  AND o.opening_tag = ANY($${i++}::text[]))`,
    );
    params.push(filters.openings);
  }

  if (filters.excludeIds && filters.excludeIds.length > 0) {
    clauses.push(`p.puzzle_id <> ALL($${i++}::text[])`);
    params.push(filters.excludeIds);
  }

  return { sql: clauses.join(" AND "), params, next: i };
}

function orderByClause(sort: SortKey): string {
  switch (sort) {
    case "popular":
    case "newest": // legacy → popular (Lichess IDs aren't time-ordered).
      return "p.popularity DESC, p.nb_plays DESC, p.puzzle_id";
    case "hardest":
    case "rating_desc":
      return "p.rating DESC, p.puzzle_id";
    case "easiest":
    case "rating_asc":
      return "p.rating ASC, p.puzzle_id";
    case "random":
      return "random()";
  }
}

/** Decorate puzzle rows with their themes (and openings, when callers need
 *  it). Single round-trip per request rather than N+1. */
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

async function loadOpeningsFor(ids: string[]): Promise<Map<string, string[]>> {
  if (ids.length === 0) return new Map();
  const rows = await pgRows<{ puzzle_id: string; opening_tag: string }>(
    `SELECT puzzle_id, opening_tag FROM public.chess_lib_openings
      WHERE puzzle_id = ANY($1::text[])`,
    [ids],
  );
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.puzzle_id);
    if (list) list.push(r.opening_tag);
    else out.set(r.puzzle_id, [r.opening_tag]);
  }
  return out;
}

function rowToPuzzle(row: PuzzleRow, themes: string[]): LibraryPuzzle {
  return {
    id: row.puzzle_id,
    fen: row.fen,
    moves: row.moves.split(" "),
    rating: row.rating,
    themes,
    level: row.level,
  };
}

// ─── Repo implementation ────────────────────────────────────────────────────

async function getById(id: string): Promise<LibraryPuzzle | null> {
  const row = await pgOne<PuzzleRow>(
    `SELECT puzzle_id, fen, moves, rating, level
       FROM public.chess_lib_puzzles WHERE puzzle_id = $1`,
    [id],
  );
  if (!row) return null;
  const themesMap = await loadThemesFor([row.puzzle_id]);
  return rowToPuzzle(row, themesMap.get(row.puzzle_id) ?? []);
}

/** Fast-path total count for filter shapes that hit a materialised lookup.
 *  For anything else returns null and the caller falls back to a probe
 *  COUNT(*) over the WHERE expression. */
async function fastTotal(
  filters: PuzzleQueryFilters,
): Promise<number | null> {
  if (
    (filters.excludeIds?.length ?? 0) > 0 ||
    filters.ratingMin != null ||
    filters.ratingMax != null
  ) {
    return null;
  }
  const themes = filters.themes ?? [];
  const openings = filters.openings ?? [];

  if (filters.level && themes.length === 1 && openings.length === 0) {
    const r = await pgOne<{ count: number }>(
      `SELECT count FROM public.chess_lib_theme_counts
        WHERE theme = $1 AND level = $2`,
      [themes[0], filters.level],
    );
    return r?.count ?? 0;
  }
  if (filters.level && themes.length === 0 && openings.length === 1) {
    const r = await pgOne<{ count: number }>(
      `SELECT count FROM public.chess_lib_opening_counts
        WHERE opening_tag = $1 AND level = $2`,
      [openings[0], filters.level],
    );
    return r?.count ?? 0;
  }
  if (filters.level && themes.length === 0 && openings.length === 0) {
    // Plain level filter: the materialised count tables have one row per
    // (theme, level), and SUMing is cheap, but a direct `pg_class` reltuples
    // estimate would be even cheaper. Use the count table SUM — exact and
    // sub-millisecond at this scale.
    const r = await pgOne<{ n: string | number }>(
      `SELECT COUNT(*) AS n FROM public.chess_lib_puzzles WHERE level = $1`,
      [filters.level],
    );
    return Number(r?.n ?? 0);
  }
  if (!filters.level && themes.length === 0 && openings.length === 0) {
    const r = await pgOne<{ n: string | number }>(
      `SELECT COUNT(*) AS n FROM public.chess_lib_puzzles`,
    );
    return Number(r?.n ?? 0);
  }
  return null;
}

async function query(
  filters: PuzzleQueryFilters,
  options: PuzzleQueryOptions,
): Promise<QueryResult> {
  // Strip the "mix" meta-tag everywhere so the filter semantically degrades
  // to "no theme filter" the way Lichess models it.
  const themesNoMix = (filters.themes ?? []).filter((t) => t !== "mix");
  filters = {
    ...filters,
    themes: themesNoMix.length > 0 ? themesNoMix : undefined,
  };

  const { sql: where, params, next } = buildWhere(filters);

  let total: number;
  let totalIsCapped: boolean;
  const fast = await fastTotal(filters);
  if (fast != null) {
    total = fast;
    totalIsCapped = false;
  } else {
    // 1001-row probe — Postgres short-circuits on LIMIT, so we never
    // materialise more than the cap+1.
    const probe = await pgOne<{ n: string | number }>(
      `SELECT COUNT(*) AS n FROM (
         SELECT 1 FROM public.chess_lib_puzzles p WHERE ${where} LIMIT $${next}
       ) AS probe`,
      [...params, COUNT_CAP + 1],
    );
    const n = Number(probe?.n ?? 0);
    if (n > COUNT_CAP) {
      total = COUNT_CAP;
      totalIsCapped = true;
    } else {
      total = n;
      totalIsCapped = false;
    }
  }

  if (total === 0) {
    return { items: [], total: 0, totalIsCapped: false };
  }

  const limitIdx = next;
  const offsetIdx = next + 1;
  const rows = await pgRows<PuzzleRow>(
    `SELECT p.puzzle_id, p.fen, p.moves, p.rating, p.level
       FROM public.chess_lib_puzzles p
      WHERE ${where}
      ORDER BY ${orderByClause(options.sort)}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...params, options.limit, options.offset],
  );

  const ids = rows.map((r) => r.puzzle_id);
  const themesMap = await loadThemesFor(ids);
  const items = rows.map((r) => rowToPuzzle(r, themesMap.get(r.puzzle_id) ?? []));
  return { items, total, totalIsCapped };
}

async function getOpeningTags(puzzleId: string): Promise<string[]> {
  return (await loadOpeningsFor([puzzleId])).get(puzzleId) ?? [];
}

// Theme/opening counts read from the materialised lookup tables built by
// the import script. Live aggregation over 200K puzzles + 900K theme rows
// is ~50ms; the materialised tables turn each lookup into a sub-millisecond
// PK hit.
async function getThemeCount(themeKey: string, level?: Level): Promise<number> {
  if (level) {
    const r = await pgOne<{ count: number }>(
      `SELECT count FROM public.chess_lib_theme_counts
        WHERE theme = $1 AND level = $2`,
      [themeKey, level],
    );
    return r?.count ?? 0;
  }
  const r = await pgOne<{ n: string | number | null }>(
    `SELECT SUM(count) AS n FROM public.chess_lib_theme_counts WHERE theme = $1`,
    [themeKey],
  );
  return Number(r?.n ?? 0);
}

async function getOpeningCount(openingKey: string, level?: Level): Promise<number> {
  if (level) {
    const r = await pgOne<{ count: number }>(
      `SELECT count FROM public.chess_lib_opening_counts
        WHERE opening_tag = $1 AND level = $2`,
      [openingKey, level],
    );
    return r?.count ?? 0;
  }
  const r = await pgOne<{ n: string | number | null }>(
    `SELECT SUM(count) AS n FROM public.chess_lib_opening_counts
      WHERE opening_tag = $1`,
    [openingKey],
  );
  return Number(r?.n ?? 0);
}

async function getInsertionOrder(): Promise<Map<string, number>> {
  // The "newest" sort is now an alias for "popular"; this hook is kept for
  // call-site compatibility but returns an empty map — the SQL-level sort
  // handles ordering directly.
  return new Map();
}

let _repoInstance: PuzzleRepo | null = null;

export function getPuzzleRepo(): PuzzleRepo {
  if (_repoInstance) return _repoInstance;
  _repoInstance = {
    getById,
    query,
    getOpeningTags,
    getThemeCount,
    getOpeningCount,
    getInsertionOrder,
  };
  return _repoInstance;
}

// Re-exported so the service layer can resolve level → rating range without
// circular imports.
export { RATING_BUCKETS };
