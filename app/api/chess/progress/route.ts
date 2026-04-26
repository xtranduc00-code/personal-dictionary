import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/chess/puzzles-api/constants";
import { PuzzleDbMissingError } from "@/lib/chess/puzzles-api/db";
import { getProgressStats } from "@/lib/chess/puzzles-api/stats";

/**
 * GET /api/chess/progress
 *
 * Aggregated stats for the single-user training app. One round-trip serves
 * the whole stats page: headline counters, today/streak, weakest themes,
 * recent attempts. Built fresh per request — the dataset is small enough
 * that materialising a stats view would be premature for v1.
 */
export async function GET(): Promise<NextResponse> {
  const t0 = Date.now();
  try {
    const stats = await getProgressStats();
    console.log(
      `[chess/progress] ok attempted=${stats.totalAttempted} solved=${stats.totalSolved} streak=${stats.streakDays} duration=${Date.now() - t0}ms`,
    );
    return NextResponse.json(stats, { headers: NO_STORE_HEADERS });
  } catch (e) {
    if (e instanceof PuzzleDbMissingError) {
      return NextResponse.json(
        { error: e.message, dbMissing: true },
        { status: 503 },
      );
    }
    console.error("[chess/progress]", e);
    return NextResponse.json(
      { error: "Failed to load progress stats" },
      { status: 500 },
    );
  }
}
