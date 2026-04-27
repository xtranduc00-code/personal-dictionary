import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/chess/puzzles-api/constants";
import {
  NextQuerySchema,
  flatZodError,
} from "@/lib/chess/puzzles-api/schemas";
import { pickNextPuzzle } from "@/lib/chess/puzzles-api/service";

/**
 * GET /api/chess/puzzles/next?angle=fork&difficulty=normal&rating=1450
 *
 * Returns a single puzzle near the requested rating window, filtered by an
 * "angle" — either a theme key or an opening key (Lichess's umbrella param).
 * Mirrors `https://lichess.org/api/puzzle/next` semantics.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = NextQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(flatZodError(parsed.error), { status: 400 });
  }
  const { angle, difficulty, rating } = parsed.data;
  const t0 = Date.now();

  try {
    const result = await pickNextPuzzle({ angle, difficulty, rating });
    if (result.reason === "unknown_angle") {
      return NextResponse.json(
        { error: "Unknown angle (must be a theme or opening key)", angle },
        { status: 404 },
      );
    }
    if (result.reason === "no_match" || !result.puzzle) {
      return NextResponse.json(
        { error: "No puzzle matches the requested angle/difficulty", angle, difficulty },
        { status: 404 },
      );
    }
    console.log(
      `[chess/puzzles/next] ok angle=${angle || "any"} difficulty=${difficulty} id=${result.puzzle.id} duration=${Date.now() - t0}ms`,
    );
    return NextResponse.json(result.puzzle, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("[chess/puzzles/next]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to pick next puzzle" },
      { status: 500 },
    );
  }
}
