import { NextResponse } from "next/server";
import {
  METADATA_CACHE_HEADERS,
  VALID_LEVELS,
  type Level,
} from "@/lib/chess/puzzles-api/constants";
import { pgRows } from "@/lib/chess/puzzles-api/db";
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

    // Bulk-load every opening_tag count in one query — there are ~1.1k
    // tags in the subset; doing one round-trip per chip would be hundreds
    // of round-trips per page render.
    const countRows = level
      ? await pgRows<{ opening_tag: string; count: number }>(
          `SELECT opening_tag, count FROM public.chess_lib_opening_counts WHERE level = $1`,
          [level],
        )
      : await pgRows<{ opening_tag: string; count: string | number }>(
          `SELECT opening_tag, SUM(count) AS count FROM public.chess_lib_opening_counts GROUP BY opening_tag`,
        );
    const countByKey = new Map<string, number>(
      countRows.map((r) => [r.opening_tag, Number(r.count)]),
    );

    const openings = file.openings.map((o) => ({
      family: o.family,
      key: o.key,
      color: o.color,
      ecoRange: o.ecoRange,
      count: countByKey.get(o.key) ?? 0,
      variations: o.variations.map((v) => ({
        ...v,
        count: countByKey.get(v.key) ?? 0,
      })),
    }));

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
