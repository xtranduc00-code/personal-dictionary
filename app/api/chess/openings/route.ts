import { NextResponse } from "next/server";
import {
  METADATA_CACHE_HEADERS,
  VALID_LEVELS,
  type Level,
} from "@/lib/chess/puzzles-api/constants";
import { getPuzzleRepo } from "@/lib/chess/puzzles-api/repo";
import { getOpeningsCatalogue } from "@/lib/chess/puzzles-api/openings-data";

/**
 * GET /api/chess/openings?level=beginner
 *
 * Returns the opening catalogue grouped by family + variation, annotated
 * with per-key puzzle counts. `level` is optional; omitting it returns the
 * across-all-difficulties total (used on screens that don't yet have a
 * difficulty selected).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  const url = new URL(req.url);
  const rawLevel = url.searchParams.get("level");
  const level = (VALID_LEVELS as readonly string[]).includes(rawLevel ?? "")
    ? (rawLevel as Level)
    : undefined;

  try {
    const file = await getOpeningsCatalogue();
    const repo = getPuzzleRepo();

    const openings = await Promise.all(
      file.openings.map(async (o) => ({
        family: o.family,
        key: o.key,
        color: o.color,
        ecoRange: o.ecoRange,
        count: await repo.getOpeningCount(o.key, level),
        variations: await Promise.all(
          o.variations.map(async (v) => ({
            ...v,
            count: await repo.getOpeningCount(v.key, level),
          })),
        ),
      })),
    );

    console.log(
      `[chess/openings] ok level=${level ?? "all"} families=${openings.length} duration=${Date.now() - t0}ms`,
    );
    return NextResponse.json(
      { level: level ?? null, openings },
      { headers: METADATA_CACHE_HEADERS },
    );
  } catch (e) {
    console.error("[chess/openings]", e);
    return NextResponse.json(
      { error: "Failed to load openings" },
      { status: 500 },
    );
  }
}
