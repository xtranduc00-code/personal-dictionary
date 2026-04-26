import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listGamePuzzles,
  type GamePuzzleQuery,
} from "@/lib/chess/puzzles-api/game-puzzles-repo";
import { PuzzleDbMissingError } from "@/lib/chess/puzzles-api/db";
import { QUERY_CACHE_HEADERS } from "@/lib/chess/puzzles-api/constants";

/**
 * GET /api/chess/game-puzzles
 *
 * Paginated list of puzzles extracted from my own analysed games. Same
 * shape as `/api/chess/puzzles/library` so the existing puzzle list UI
 * can render it without a special path — just hit a different endpoint
 * when `source=games`.
 */

const QuerySchema = z.object({
  classification: z.enum(["mistake", "blunder"]).optional(),
  gameId: z.string().optional(),
  themes: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    ),
  search: z.string().trim().optional().default(""),
  sort: z.enum(["popular", "random", "hardest", "easiest", "newest"]).optional().default("newest"),
  limit: z
    .string()
    .optional()
    .transform((s) => {
      const n = Number.parseInt(s ?? "", 10);
      return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 20;
    }),
  offset: z
    .string()
    .optional()
    .transform((s) => {
      const n = Number.parseInt(s ?? "", 10);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }),
});

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const q = parsed.data;
  const t0 = Date.now();

  try {
    const query: GamePuzzleQuery = {
      classification: q.classification,
      gameId: q.gameId,
      themes: q.themes,
      search: q.search,
      sort: q.sort,
      limit: q.limit,
      offset: q.offset,
    };
    const { items, total } = listGamePuzzles(query);

    console.log(
      `[chess/game-puzzles] ok total=${total} returned=${items.length} duration=${Date.now() - t0}ms`,
    );
    return NextResponse.json(
      {
        items,
        total,
        // Game-puzzle counts are exact (small dataset), so totalIsCapped
        // is always false. Kept in the payload to match the Lichess
        // library response shape.
        totalIsCapped: false,
        offset: q.offset,
        limit: q.limit,
        hasMore: q.offset + items.length < total,
        sort: q.sort,
        appliedFilters: {
          classification: q.classification ?? null,
          gameId: q.gameId ?? null,
          themes: q.themes,
          search: q.search,
        },
      },
      { headers: QUERY_CACHE_HEADERS },
    );
  } catch (e) {
    if (e instanceof PuzzleDbMissingError) {
      return NextResponse.json(
        { error: e.message, dbMissing: true },
        { status: 503 },
      );
    }
    console.error("[chess/game-puzzles]", e);
    return NextResponse.json(
      { error: "Failed to list game puzzles" },
      { status: 500 },
    );
  }
}
