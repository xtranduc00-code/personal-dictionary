/**
 * Service layer for the puzzle API. Pure functions where possible — they
 * take the repo as a dependency so the routes don't have to know about
 * mock-vs-db. Business logic (rating offsets, "next puzzle" picking, error
 * shaping) lives here.
 */
import type { LibraryPuzzle } from "@/lib/chess-types";
import {
  DEFAULT_PUZZLE_RATING,
  DIFFICULTY_OFFSETS,
  RATING_BUCKETS,
  type Difficulty,
  type Level,
} from "./constants";
import {
  getPuzzleRepo,
  type PuzzleQueryFilters,
  type PuzzleQueryOptions,
} from "./repo";
import { getThemeByKey } from "./themes-data";
import { getOpeningOrVariationByKey } from "./openings-data";

interface ResolvedRange {
  ratingMin?: number;
  ratingMax?: number;
}

/** Convert a level + explicit override into a final rating range.
 *
 *  We deliberately *don't* synthesise a rating range from the level when no
 *  override is present — the puzzles table already carries a denormalised
 *  `level` column derived from rating, so `WHERE level = ?` is equivalent
 *  to `WHERE rating BETWEEN <bucket>`. Sending both is redundant and hides
 *  the level-only fast path in the count layer.
 *
 *  Explicit min/max are still passed through (e.g. user wants beginner
 *  puzzles ≥ 600 rating), and `RATING_BUCKETS` remains the documentation /
 *  default-by-level mapping for callers that do want explicit ranges.
 */
export function resolveRatingRange(
  _level: Level | undefined,
  ratingMin: number | undefined,
  ratingMax: number | undefined,
): ResolvedRange {
  const out: ResolvedRange = {};
  if (ratingMin != null) out.ratingMin = ratingMin;
  if (ratingMax != null) out.ratingMax = ratingMax;
  return out;
}

/** Validate the resolved range — surfaced as a 400 by the route handler. */
export function validateRatingRange(range: ResolvedRange): string | null {
  if (range.ratingMin != null && range.ratingMax != null && range.ratingMin > range.ratingMax) {
    return "ratingMin must not exceed ratingMax";
  }
  return null;
}

/** Decorate puzzles with their synthesized opening tags so the frontend can
 *  display the opening chip without an extra round-trip per puzzle. */
export async function decorateWithOpenings(
  puzzles: LibraryPuzzle[],
): Promise<(LibraryPuzzle & { openings: string[] })[]> {
  const repo = getPuzzleRepo();
  const out: (LibraryPuzzle & { openings: string[] })[] = [];
  for (const p of puzzles) {
    const openings = await repo.getOpeningTags(p.id);
    out.push({ ...p, openings });
  }
  return out;
}

/** Run a library query — returns the same shape regardless of repo. */
export interface DecoratedQueryResult {
  items: (LibraryPuzzle & { openings: string[] })[];
  total: number;
  totalIsCapped: boolean;
}
export async function queryLibrary(
  filters: PuzzleQueryFilters,
  options: PuzzleQueryOptions,
): Promise<DecoratedQueryResult> {
  const repo = getPuzzleRepo();
  const { items, total, totalIsCapped } = await repo.query(filters, options);
  const decorated = await decorateWithOpenings(items);
  return { items: decorated, total, totalIsCapped };
}

/** Resolve `/puzzles/next?angle=...` — angle can be either a theme key or
 *  an opening key. We disambiguate by looking each up. Theme wins on
 *  collision (extremely unlikely given the disjoint key spaces).
 *
 *  Returns the filter clause to apply ON TOP of the difficulty range.
 *  If `angle` is unknown, returns null to signal a 404 to the caller. */
export async function resolveAngle(
  angle: string,
): Promise<{ themes?: string[]; openings?: string[] } | null> {
  if (!angle) return {};
  const theme = await getThemeByKey(angle);
  if (theme) return { themes: [angle] };
  // Match either a family ("Sicilian_Defense") or a variation
  // ("Sicilian_Defense_Najdorf_Variation").
  const opening = await getOpeningOrVariationByKey(angle);
  if (opening) return { openings: [angle] };
  return null;
}

/** Compute the rating window for a `/puzzles/next` request. The user's
 *  current rating ± the difficulty offset, clamped into a sensible global
 *  range so we don't ask for a -200 puzzle. */
export function difficultyRange(
  userRating: number,
  difficulty: Difficulty,
): { ratingMin: number; ratingMax: number } {
  const offset = DIFFICULTY_OFFSETS[difficulty];
  const min = Math.max(400, userRating + offset.min);
  const max = Math.min(3200, userRating + offset.max);
  return { ratingMin: Math.min(min, max), ratingMax: Math.max(min, max) };
}

/** Pick the next puzzle. Prefers ones in the rating window, weighted by a
 *  stable popularity proxy so popular puzzles surface first but everything
 *  remains reachable. */
export async function pickNextPuzzle(opts: {
  angle: string;
  difficulty: Difficulty;
  rating?: number;
  excludeIds?: string[];
}): Promise<{
  puzzle: (LibraryPuzzle & { openings: string[] }) | null;
  reason: "ok" | "unknown_angle" | "no_match";
}> {
  const angleFilter = await resolveAngle(opts.angle);
  if (angleFilter === null) return { puzzle: null, reason: "unknown_angle" };

  const userRating = opts.rating ?? DEFAULT_PUZZLE_RATING;
  const range = difficultyRange(userRating, opts.difficulty);

  const repo = getPuzzleRepo();
  // Pull a generous sample (24 puzzles) within the range so we have room to
  // pick a "popular" one rather than always returning the first match.
  const { items } = await repo.query(
    {
      ratingMin: range.ratingMin,
      ratingMax: range.ratingMax,
      themes: angleFilter.themes,
      openings: angleFilter.openings,
      excludeIds: opts.excludeIds,
    },
    {
      sort: "popular",
      limit: 24,
      offset: 0,
    },
  );

  if (items.length === 0) return { puzzle: null, reason: "no_match" };

  // Within the top-24 by popularity, pick one randomly so the user doesn't
  // see the exact same puzzle every time they hit /next.
  const idx = Math.floor(Math.random() * items.length);
  const decorated = await decorateWithOpenings([items[idx]]);
  return { puzzle: decorated[0], reason: "ok" };
}
