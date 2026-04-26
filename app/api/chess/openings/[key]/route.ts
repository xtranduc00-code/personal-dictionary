import { NextResponse } from "next/server";
import {
  METADATA_CACHE_HEADERS,
  VALID_LEVELS,
  type Level,
} from "@/lib/chess/puzzles-api/constants";
import { getPuzzleRepo } from "@/lib/chess/puzzles-api/repo";
import {
  getOpeningOrVariationByKey,
  suggestOpeningKeys,
} from "@/lib/chess/puzzles-api/openings-data";
import { decorateWithOpenings } from "@/lib/chess/puzzles-api/service";

/**
 * GET /api/chess/openings/:key?level=beginner
 *
 * Single opening (family or variation) with its puzzle count and a small
 * sample list. 404s with suggestions when the key is unknown.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params;
  const t0 = Date.now();
  const url = new URL(req.url);
  const rawLevel = url.searchParams.get("level");
  const level = (VALID_LEVELS as readonly string[]).includes(rawLevel ?? "")
    ? (rawLevel as Level)
    : undefined;

  try {
    const found = await getOpeningOrVariationByKey(key);
    if (!found) {
      const suggestions = await suggestOpeningKeys(key);
      console.warn(
        `[chess/openings/:key] not_found key=${key} suggestions=${suggestions.length}`,
      );
      return NextResponse.json(
        { error: "Opening not found", key, suggestions },
        { status: 404 },
      );
    }

    const repo = getPuzzleRepo();
    const count = await repo.getOpeningCount(key, level);
    const { items } = await repo.query(
      { openings: [key], level },
      { sort: "popular", limit: 6, offset: 0 },
    );
    const samplePuzzles = await decorateWithOpenings(items);

    // Same envelope for family or variation. When a variation key was
    // requested, `variation` carries its readable name; the parent family
    // info still travels via `family` / `color` / `ecoRange`.
    console.log(
      `[chess/openings/:key] ok key=${key} level=${level ?? "all"} count=${count}` +
        ` kind=${found.variation ? "variation" : "family"} duration=${Date.now() - t0}ms`,
    );
    return NextResponse.json(
      {
        family: found.family.family,
        key,
        color: found.family.color,
        ecoRange: found.family.ecoRange,
        variation: found.variation
          ? { key: found.variation.key, name: found.variation.name }
          : null,
        variations: found.variation ? [] : found.family.variations,
        level: level ?? null,
        count,
        samplePuzzles,
      },
      { headers: METADATA_CACHE_HEADERS },
    );
  } catch (e) {
    console.error("[chess/openings/:key]", e);
    return NextResponse.json(
      { error: "Failed to load opening" },
      { status: 500 },
    );
  }
}
