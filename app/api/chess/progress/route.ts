import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/chess/puzzles-api/constants";
import { getProgressStats } from "@/lib/chess/puzzles-api/stats";
import { getAuthUser } from "@/lib/get-auth-user";

/**
 * GET /api/chess/progress
 *
 * Aggregated stats for the authenticated user: headline counters,
 * today/streak, weakest themes, recent attempts. One round-trip per
 * request — at the user's expected attempt-log size this is fine.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const stats = await getProgressStats(user.id);
    console.log(
      `[chess/progress] ok user=${user.id} attempted=${stats.totalAttempted} solved=${stats.totalSolved} streak=${stats.streakDays} duration=${Date.now() - t0}ms`,
    );
    return NextResponse.json(stats, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("[chess/progress]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load progress stats" },
      { status: 500 },
    );
  }
}
