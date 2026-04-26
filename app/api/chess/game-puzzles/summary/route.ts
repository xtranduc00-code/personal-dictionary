import { NextResponse } from "next/server";
import { getGamePuzzleSummary } from "@/lib/chess/puzzles-api/game-puzzles-repo";
import { PuzzleDbMissingError } from "@/lib/chess/puzzles-api/db";
import { NO_STORE_HEADERS } from "@/lib/chess/puzzles-api/constants";

/**
 * GET /api/chess/game-puzzles/summary
 *
 * Aggregated counts for the "From my games" landing card and stats
 * integration. Returns total puzzles extracted, mistake/blunder split,
 * how many have been attempted/solved, and a per-game breakdown for the
 * landing screen's deep-links.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const summary = getGamePuzzleSummary();
    return NextResponse.json(summary, { headers: NO_STORE_HEADERS });
  } catch (e) {
    if (e instanceof PuzzleDbMissingError) {
      return NextResponse.json(
        { error: e.message, dbMissing: true },
        { status: 503 },
      );
    }
    console.error("[chess/game-puzzles/summary]", e);
    return NextResponse.json(
      { error: "Failed to load game-puzzle summary" },
      { status: 500 },
    );
  }
}
