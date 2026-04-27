import { NextResponse } from "next/server";
import { getGamePuzzleSummary } from "@/lib/chess/puzzles-api/game-puzzles-repo";
import { NO_STORE_HEADERS } from "@/lib/chess/puzzles-api/constants";
import { getAuthUser } from "@/lib/get-auth-user";

/**
 * GET /api/chess/game-puzzles/summary
 *
 * Aggregated counts for the "From my games" landing card and stats
 * integration, scoped to the authenticated user.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await getGamePuzzleSummary(user.id);
    return NextResponse.json(summary, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("[chess/game-puzzles/summary]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load game-puzzle summary" },
      { status: 500 },
    );
  }
}
