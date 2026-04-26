import { NextResponse } from "next/server";
import { getPuzzleRepo } from "@/lib/chess/puzzles-api/repo";
import { decorateWithOpenings } from "@/lib/chess/puzzles-api/service";
import { PuzzleDbMissingError } from "@/lib/chess/puzzles-api/db";
import { getGamePuzzleById } from "@/lib/chess/puzzles-api/game-puzzles-repo";

/**
 * GET /api/chess/puzzles/by-id?id=<puzzleId>
 *
 * Look up a single puzzle by id, transparent across both sources:
 *  - `gp_*`  → game-extracted puzzle in `progress.game_puzzles`
 *  - else    → Lichess puzzle in `puzzles.puzzles`
 *
 * Both return the same `{ puzzle }` envelope so the solve UI doesn't
 * need to know which path produced it.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    if (id.startsWith("gp_")) {
      const puzzle = getGamePuzzleById(id);
      if (!puzzle) {
        return NextResponse.json({ error: "Game puzzle not found", id }, { status: 404 });
      }
      return NextResponse.json({ puzzle });
    }

    const repo = getPuzzleRepo();
    const puzzle = await repo.getById(id);
    if (!puzzle) {
      return NextResponse.json({ error: "Puzzle not found", id }, { status: 404 });
    }
    const [decorated] = await decorateWithOpenings([puzzle]);
    return NextResponse.json({ puzzle: decorated });
  } catch (e) {
    if (e instanceof PuzzleDbMissingError) {
      return NextResponse.json(
        { error: e.message, dbMissing: true },
        { status: 503 },
      );
    }
    console.error("[chess/puzzles/by-id]", e);
    return NextResponse.json({ error: "Failed to load puzzle" }, { status: 500 });
  }
}
