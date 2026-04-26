/**
 * Puzzle repository — direct SQLite queries against the imported Lichess
 * dataset. Replaces the previous mock implementation. There is no longer
 * a swappable "data source" abstraction; this is the one and only
 * implementation, by design.
 *
 * All functions are sync at the SQLite level (better-sqlite3) but exposed
 * as async to match the existing service-layer call sites.
 */
import type { LibraryPuzzle } from "@/lib/chess-types";
import { getDb } from "./db";
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

/** Threshold below which `ORDER BY RANDOM()` materialises fast enough to be
 *  fine. Above it we switch to a rowid-range sample. Picked from
 *  benchmarking notes; revisit with `EXPLAIN QUERY PLAN` if it ever feels
 *  slow. */
const RANDOM_FULLSCAN_LIMIT = 50_000;

function buildWhere(filters: PuzzleQueryFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = ["1=1"];
  const params: unknown[] = [];

  if (filters.level) {
    clauses.push("p.level = ?");
    params.push(filters.level);
  }
  if (filters.ratingMin != null) {
    clauses.push("p.rating >= ?");
    params.push(filters.ratingMin);
  }
  if (filters.ratingMax != null) {
    clauses.push("p.rating <= ?");
    params.push(filters.ratingMax);
  }

  // EXISTS-per-theme rather than `IN (SELECT … GROUP BY … HAVING COUNT)`.
  // Lets the planner walk `puzzles(level, popularity DESC)` in order and
  // short-circuit per row at the first failed EXISTS — single-theme drops
  // from ~470 ms to <1 ms; AND of two themes from ~880 ms to ~330 ms.
  // `mix` is a Lichess meta-tag meaning "any puzzle" — treat it as a
  // no-op rather than a real EXISTS check (no rows are tagged `mix`, so
  // the EXISTS would always fail).
  if (filters.themes && filters.themes.length > 0) {
    for (const theme of filters.themes) {
      if (theme === "mix") continue;
      clauses.push(
        `EXISTS (SELECT 1 FROM puzzle_themes t WHERE t.puzzle_id = p.puzzle_id AND t.theme = ?)`,
      );
      params.push(theme);
    }
  }

  // Openings have OR semantics across selected keys (a Sicilian-or-French
  // filter, not Sicilian-AND-French — that combination is empty).
  if (filters.openings && filters.openings.length > 0) {
    const placeholders = filters.openings.map(() => "?").join(",");
    clauses.push(
      `EXISTS (SELECT 1 FROM puzzle_openings o
                 WHERE o.puzzle_id = p.puzzle_id
                   AND o.opening_tag IN (${placeholders}))`,
    );
    params.push(...filters.openings);
  }

  // Search-by-id / search-by-theme-keyword was removed — searching by
  // puzzle ID is rarely useful in personal training and theme keyword
  // search duplicates the sidebar filter.

  if (filters.excludeIds && filters.excludeIds.length > 0) {
    const placeholders = filters.excludeIds.map(() => "?").join(",");
    clauses.push(`p.puzzle_id NOT IN (${placeholders})`);
    params.push(...filters.excludeIds);
  }

  return { sql: clauses.join(" AND "), params };
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
      return "RANDOM()";
  }
}

/** Decorate puzzle rows with their themes (and openings, when callers need
 *  it). Single round-trip per request rather than N+1. */
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

function loadOpeningsFor(ids: string[]): Map<string, string[]> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT puzzle_id, opening_tag FROM puzzle_openings WHERE puzzle_id IN (${placeholders})`,
    )
    .all(...ids) as { puzzle_id: string; opening_tag: string }[];
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
  const row = getDb()
    .prepare(
      `SELECT puzzle_id, fen, moves, rating, level FROM puzzles WHERE puzzle_id = ?`,
    )
    .get(id) as PuzzleRow | undefined;
  if (!row) return null;
  const themes = loadThemesFor([row.puzzle_id]).get(row.puzzle_id) ?? [];
  return rowToPuzzle(row, themes);
}

/** Fast-path total count for filter shapes that hit a materialised lookup.
 *  For anything else returns null and the caller falls back to a live
 *  COUNT(*) over the WHERE expression. */
function fastTotal(
  db: ReturnType<typeof getDb>,
  filters: PuzzleQueryFilters,
): number | null {
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
    const r = db
      .prepare(`SELECT count FROM theme_counts WHERE theme = ? AND level = ?`)
      .get(themes[0], filters.level) as { count: number } | undefined;
    return r?.count ?? 0;
  }
  if (filters.level && themes.length === 0 && openings.length === 1) {
    const r = db
      .prepare(`SELECT count FROM opening_counts WHERE opening_tag = ? AND level = ?`)
      .get(openings[0], filters.level) as { count: number } | undefined;
    return r?.count ?? 0;
  }
  if (filters.level && themes.length === 0 && openings.length === 0) {
    // Plain level filter: index-only count over (level, popularity, …).
    const r = db
      .prepare(`SELECT COUNT(*) AS n FROM puzzles WHERE level = ?`)
      .get(filters.level) as { n: number };
    return r.n;
  }
  if (!filters.level && themes.length === 0 && openings.length === 0) {
    // No filters at all — read the row_count we stamped at import time
    // rather than running COUNT over 5.8 M rows. Falls through to live
    // COUNT(*) only if the meta row is missing (older imports).
    const m = db
      .prepare(`SELECT value FROM meta WHERE key = 'row_count'`)
      .get() as { value: string } | undefined;
    if (m) return parseInt(m.value, 10);
    const r = db.prepare(`SELECT COUNT(*) AS n FROM puzzles`).get() as { n: number };
    return r.n;
  }
  return null;
}

async function query(
  filters: PuzzleQueryFilters,
  options: PuzzleQueryOptions,
): Promise<QueryResult> {
  // Strip the "mix" meta-tag everywhere (fastTotal + WHERE) so the filter
  // semantically degrades to "no theme filter" the way Lichess models it.
  const themesNoMix = (filters.themes ?? []).filter((t) => t !== "mix");
  filters = {
    ...filters,
    themes: themesNoMix.length > 0 ? themesNoMix : undefined,
  };

  const db = getDb();
  const { sql: where, params } = buildWhere(filters);

  // Use the materialised lookup when we can; otherwise short-circuit at
  // COUNT_CAP+1 rather than scanning the full result set. A live COUNT(*)
  // for multi-theme AND has to materialise every match (~2 s for hot
  // combinations); the probe walks the same rows but the engine stops as
  // soon as it has 1001 of them.
  let total: number;
  let totalIsCapped: boolean;
  const fast = fastTotal(db, filters);
  if (fast != null) {
    total = fast;
    totalIsCapped = false;
  } else {
    // Scalar COUNT over a LIMIT subquery: SQLite short-circuits at COUNT_CAP+1
    // and we only marshal a single number back to JS (vs. the 1001-element
    // array a `SELECT 1 … LIMIT 1001` would produce).
    const r = db
      .prepare(
        `SELECT COUNT(*) AS n FROM (SELECT 1 FROM puzzles p WHERE ${where} LIMIT ?)`,
      )
      .get(...params, COUNT_CAP + 1) as { n: number };
    if (r.n > COUNT_CAP) {
      total = COUNT_CAP;
      totalIsCapped = true;
    } else {
      total = r.n;
      totalIsCapped = false;
    }
  }

  if (total === 0) {
    return { items: [], total: 0, totalIsCapped: false };
  }

  // Random sort over the *unfiltered* puzzles table: use a rowid-jump,
  // which is O(LIMIT) regardless of table size. Picking a random rowid and
  // taking `LIMIT N` consecutive rows is uniform enough for our purposes.
  // For filtered random (themes/openings/etc.), `ORDER BY RANDOM() LIMIT N`
  // is fine because the planner only materialises the matched subset, which
  // we've already verified stays under the 50k threshold for typical filters.
  let rows: PuzzleRow[];
  const onlyLevelOrEmpty =
    !filters.themes?.length &&
    !filters.openings?.length &&
    !filters.excludeIds?.length &&
    filters.ratingMin == null &&
    filters.ratingMax == null;

  if (
    options.sort === "random" &&
    onlyLevelOrEmpty &&
    total > RANDOM_FULLSCAN_LIMIT
  ) {
    // Pick a random rowid floor inside the table, scan forward.
    const maxRowidRow = db
      .prepare(`SELECT MAX(rowid) AS m FROM puzzles${filters.level ? " WHERE level = ?" : ""}`)
      .get(...(filters.level ? [filters.level] : [])) as { m: number };
    const target = 1 + Math.floor(Math.random() * (maxRowidRow.m || 1));
    rows = db
      .prepare(
        `SELECT p.puzzle_id, p.fen, p.moves, p.rating, p.level
           FROM puzzles p
          WHERE ${where} AND p.rowid >= ?
          LIMIT ?`,
      )
      .all(...params, target, options.limit) as PuzzleRow[];
  } else {
    rows = db
      .prepare(
        `SELECT p.puzzle_id, p.fen, p.moves, p.rating, p.level
           FROM puzzles p
          WHERE ${where}
          ORDER BY ${orderByClause(options.sort)}
          LIMIT ? OFFSET ?`,
      )
      .all(...params, options.limit, options.offset) as PuzzleRow[];
  }

  const ids = rows.map((r) => r.puzzle_id);
  const themesMap = loadThemesFor(ids);
  const items = rows.map((r) => rowToPuzzle(r, themesMap.get(r.puzzle_id) ?? []));
  return { items, total, totalIsCapped };
}

async function getOpeningTags(puzzleId: string): Promise<string[]> {
  return loadOpeningsFor([puzzleId]).get(puzzleId) ?? [];
}

// Theme/opening counts read from the materialised lookup tables built by
// the import script. Live aggregation over 5.8M puzzles + 26M theme rows
// takes hundreds of ms per chip, which doesn't fit a 64-chip browse page;
// the materialised tables turn each lookup into a sub-microsecond PK hit.
async function getThemeCount(themeKey: string, level?: Level): Promise<number> {
  const db = getDb();
  if (level) {
    const r = db
      .prepare(`SELECT count FROM theme_counts WHERE theme = ? AND level = ?`)
      .get(themeKey, level) as { count: number } | undefined;
    return r?.count ?? 0;
  }
  const r = db
    .prepare(`SELECT SUM(count) AS n FROM theme_counts WHERE theme = ?`)
    .get(themeKey) as { n: number | null };
  return r.n ?? 0;
}

async function getOpeningCount(openingKey: string, level?: Level): Promise<number> {
  const db = getDb();
  if (level) {
    const r = db
      .prepare(`SELECT count FROM opening_counts WHERE opening_tag = ? AND level = ?`)
      .get(openingKey, level) as { count: number } | undefined;
    return r?.count ?? 0;
  }
  const r = db
    .prepare(`SELECT SUM(count) AS n FROM opening_counts WHERE opening_tag = ?`)
    .get(openingKey) as { n: number | null };
  return r.n ?? 0;
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
