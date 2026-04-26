import { NextResponse } from "next/server";
import type { LibraryPuzzle } from "@/lib/chess-types";
import {
  LibraryQuerySchema,
  flatZodError,
} from "@/lib/chess/puzzles-api/schemas";
import {
  resolveRatingRange,
  validateRatingRange,
  queryLibrary,
} from "@/lib/chess/puzzles-api/service";
import {
  NO_STORE_HEADERS,
  type Level,
} from "@/lib/chess/puzzles-api/constants";
import { getDb, PuzzleDbMissingError } from "@/lib/chess/puzzles-api/db";
export type { LibraryPuzzle };

/**
 * GET /api/chess/puzzles/library
 *
 * Filter + paginate puzzles from the local SQLite mirror of Lichess's
 * dataset.
 *
 * Auth was removed in pass 2 — this is a single-user app, so per-user
 * solved tracking is reading from `progress.attempts` (added in pass 5)
 * rather than Supabase. Until then, `solvedPuzzleIds` is empty.
 *
 * Response includes `totalIsCapped`: when true the actual match count is
 * larger than `total` (the materialised-count fast path didn't apply, so
 * we used a probe that stops at 1000). UI should display "1000+ puzzles"
 * in that case.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const t0 = Date.now();
  const parsed = LibraryQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(flatZodError(parsed.error), { status: 400 });
  }
  const q = parsed.data;

  // Combine legacy single-theme `theme` with the new multi-theme `themes`
  // param. Search-by-id / search-by-keyword was removed — it duplicated
  // sidebar filters and was rarely useful for personal training.
  const themes = [...(q.themes ?? [])];
  if (q.theme) themes.push(q.theme);
  const level = (q.level ?? "beginner") as Level;

  const range = resolveRatingRange(level, q.ratingMin, q.ratingMax);
  const rangeError = validateRatingRange(range);
  if (rangeError) {
    return NextResponse.json(
      { error: rangeError, fields: { ratingMin: rangeError } },
      { status: 400 },
    );
  }

  try {
    // Per-level grand total — the badge reads "X / 500 solved" for the
    // active difficulty, and that denominator should NOT shift with active
    // theme/opening filters. Single tiny query against the materialised
    // level count (sub-millisecond).
    const baseQuery = await queryLibrary(
      { level },
      { sort: "popular", limit: 1, offset: 0 },
    );
    const levelGrandTotal = baseQuery.total;

    const result = await queryLibrary(
      {
        level,
        ratingMin: range.ratingMin,
        ratingMax: range.ratingMax,
        themes,
        openings: q.openings,
      },
      { sort: q.sort, limit: q.limit, offset: q.offset },
    );

    // Solved tracking lives in progress.sqlite (pass 4). A puzzle is
    // "solved" if there is any attempt row with solved=1. We fetch:
    //   solvedCount  — distinct solved puzzles in the active level
    //   solvedIds    — solved IDs that intersect with the current page,
    //                  so the FE can flag them with a checkmark without
    //                  loading the entire solved set.
    const db = getDb();
    const solvedCountRow = db
      .prepare(
        `SELECT COUNT(DISTINCT a.puzzle_id) AS n
           FROM progress.attempts a
           JOIN puzzles p ON p.puzzle_id = a.puzzle_id
          WHERE a.solved = 1 AND p.level = ?`,
      )
      .get(level) as { n: number };
    const solvedCount = solvedCountRow.n;

    const pageIds = result.items.map((p) => p.id);
    let solvedPuzzleIds: string[] = [];
    if (pageIds.length > 0) {
      const ph = pageIds.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT DISTINCT puzzle_id FROM progress.attempts
            WHERE solved = 1 AND puzzle_id IN (${ph})`,
        )
        .all(...pageIds) as { puzzle_id: string }[];
      solvedPuzzleIds = rows.map((r) => r.puzzle_id);
    }

    // Apply the solved/unsolved client-side filter against this page only.
    // For exact accuracy across a 1.69M-row level we'd push the filter
    // into SQL via a LEFT JOIN, but the spec says "personal use, simple",
    // and the page-only filter matches what the user sees.
    let items = result.items;
    if (q.progress === "solved") {
      const set = new Set(solvedPuzzleIds);
      items = items.filter((p) => set.has(p.id));
    } else if (q.progress === "unsolved") {
      const set = new Set(solvedPuzzleIds);
      items = items.filter((p) => !set.has(p.id));
    }

    const payload = {
      items,
      total: result.total,
      totalIsCapped: result.totalIsCapped,
      offset: q.offset,
      limit: q.limit,
      hasMore: q.offset + items.length < result.total || result.totalIsCapped,
      level,
      sort: q.sort,
      progress: q.progress,
      levelGrandTotal,
      appliedFilters: {
        themes,
        openings: q.openings ?? [],
        ratingMin: range.ratingMin,
        ratingMax: range.ratingMax,
      },
      solvedCount,
      solvedPuzzleIds,
    };
    console.log(
      `[chess/puzzles/library] ok level=${level} sort=${q.sort} themes=${themes.length} openings=${q.openings?.length ?? 0} ` +
        `count=${result.items.length}/${result.total}${result.totalIsCapped ? "+" : ""} duration=${Date.now() - t0}ms`,
    );
    // No-store: the response embeds per-user solved status which changes
    // after every attempt POST. A 10-second client cache made the library
    // return stale data after a solve until the user F5'd.
    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (e) {
    if (e instanceof PuzzleDbMissingError) {
      return NextResponse.json(
        { error: e.message, dbMissing: true },
        { status: 503 },
      );
    }
    console.error("[chess/puzzles/library]", e);
    return NextResponse.json(
      {
        items: [],
        total: 0,
        offset: q.offset,
        limit: q.limit,
        error: "Failed to load puzzle library",
      },
      { status: 500 },
    );
  }
}
