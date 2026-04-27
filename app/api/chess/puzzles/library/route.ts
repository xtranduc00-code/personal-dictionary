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
import { pgOne, pgRows } from "@/lib/chess/puzzles-api/db";
import { getAuthUser } from "@/lib/get-auth-user";
export type { LibraryPuzzle };

/**
 * GET /api/chess/puzzles/library
 *
 * Filter + paginate puzzles from the Supabase mirror of Lichess's dataset.
 *
 * Per-user solve tracking comes from `chess_attempts`. When the request is
 * unauthenticated (no Bearer token), `solvedCount` and `solvedPuzzleIds`
 * fall back to empty — the library still browses, just without the solved
 * checkmarks.
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

  const user = await getAuthUser(req);

  try {
    // Per-level grand total — the badge reads "X / 500 solved" for the
    // active difficulty, and that denominator should NOT shift with active
    // theme/opening filters. Single tiny query against the materialised
    // level count.
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

    // Solved tracking. A puzzle is "solved" if any attempt row for the
    // current user has solved=true. For the level-scoped count we join
    // attempts to puzzles so we can constrain by level. For the page-only
    // ID list we just intersect against the rendered IDs.
    let solvedCount = 0;
    let solvedPuzzleIds: string[] = [];
    if (user) {
      const solvedCountRow = await pgOne<{ n: string | number }>(
        `SELECT COUNT(DISTINCT a.lib_puzzle_id) AS n
           FROM public.chess_attempts a
           JOIN public.chess_lib_puzzles p ON p.puzzle_id = a.lib_puzzle_id
          WHERE a.user_id = $1 AND a.solved = TRUE AND p.level = $2`,
        [user.id, level],
      );
      solvedCount = Number(solvedCountRow?.n ?? 0);

      const pageIds = result.items.map((p) => p.id);
      if (pageIds.length > 0) {
        const rows = await pgRows<{ lib_puzzle_id: string }>(
          `SELECT DISTINCT lib_puzzle_id FROM public.chess_attempts
            WHERE user_id = $1 AND solved = TRUE
              AND lib_puzzle_id = ANY($2::text[])`,
          [user.id, pageIds],
        );
        solvedPuzzleIds = rows.map((r) => r.lib_puzzle_id);
      }
    }

    // Page-level filter against the solved set.
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
    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("[chess/puzzles/library]", e);
    return NextResponse.json(
      {
        items: [],
        total: 0,
        offset: q.offset,
        limit: q.limit,
        error: e instanceof Error ? e.message : "Failed to load puzzle library",
      },
      { status: 500 },
    );
  }
}
