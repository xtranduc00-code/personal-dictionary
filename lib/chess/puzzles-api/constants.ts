/**
 * Constants for the puzzle library API. Mirror Lichess's terminology so
 * frontend code can rely on the same vocabulary (level keys, difficulty
 * offsets, sort order).
 */

export const RATING_BUCKETS = {
  beginner: { min: 400, max: 1100 },
  intermediate: { min: 1100, max: 1500 },
  hard: { min: 1500, max: 1900 },
  expert: { min: 1900, max: 3000 },
} as const;

export type Level = keyof typeof RATING_BUCKETS;

export const VALID_LEVELS = Object.keys(RATING_BUCKETS) as Level[];

/** Offset (vs. user's puzzle rating) used by `/puzzles/next?difficulty=...`. */
export const DIFFICULTY_OFFSETS = {
  easiest: { min: -600, max: -300 },
  easier: { min: -300, max: -100 },
  normal: { min: -100, max: 100 },
  harder: { min: 100, max: 300 },
  hardest: { min: 300, max: 600 },
} as const;

export type Difficulty = keyof typeof DIFFICULTY_OFFSETS;

export const VALID_DIFFICULTIES = Object.keys(DIFFICULTY_OFFSETS) as Difficulty[];

export const VALID_SORTS = [
  "newest",
  "popular",
  "random",
  "hardest",
  "easiest",
  // Legacy aliases the existing /library route already accepts. Keep them
  // around so the new endpoint is a strict superset.
  "rating_asc",
  "rating_desc",
] as const;

export type Sort = (typeof VALID_SORTS)[number];

export const VALID_PROGRESS = ["all", "unsolved", "solved"] as const;
export type Progress = (typeof VALID_PROGRESS)[number];

export const DEFAULT_PUZZLE_RATING = 1500;

/** 24h cache for theme/opening metadata — Lichess updates these very rarely. */
export const METADATA_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
} as const;

/** Short cache for hot list endpoints — fresh enough for live progress. */
export const QUERY_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
} as const;

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;
