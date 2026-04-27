import { NextResponse } from "next/server";
import { getPuzzleRepo } from "@/lib/chess/puzzles-api/repo";
import { decorateWithOpenings } from "@/lib/chess/puzzles-api/service";
import { getGamePuzzleById } from "@/lib/chess/puzzles-api/game-puzzles-repo";
import { getAuthUser } from "@/lib/get-auth-user";

/**
 * GET /api/chess/puzzles/by-id?id=<puzzleId>
 *
 * Look up a single puzzle by id, transparent across both sources:
 *  - `gp_*`  → game-extracted puzzle in `public.chess_game_puzzles` (user-scoped)
 *  - else    → Lichess puzzle in `public.chess_lib_puzzles` (public)
 *
 * Both return the same `{ puzzle }` envelope so the solve UI doesn't
 * need to know which path produced it. Game puzzles require auth.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    if (id.startsWith("gp_")) {
      const user = await getAuthUser(req);
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const puzzle = await getGamePuzzleById(user.id, id);
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
    console.error("[chess/puzzles/by-id]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load puzzle" },
      { status: 500 },
    );
  }
}
