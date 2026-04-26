import { NextResponse } from "next/server";
import {
  METADATA_CACHE_HEADERS,
  VALID_LEVELS,
  type Level,
} from "@/lib/chess/puzzles-api/constants";
import { getPuzzleRepo } from "@/lib/chess/puzzles-api/repo";
import {
  getThemeByKey,
  suggestThemeKeys,
} from "@/lib/chess/puzzles-api/themes-data";
import { decorateWithOpenings } from "@/lib/chess/puzzles-api/service";

/**
 * GET /api/chess/themes/:key?level=beginner
 *
 * Single theme details + a small popular-first sample list of puzzles.
 * 404s with "did you mean…?" suggestions when the key isn't in the
 * catalogue.
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
    const found = await getThemeByKey(key);
    if (!found) {
      const suggestions = await suggestThemeKeys(key);
      console.warn(
        `[chess/themes/:key] not_found key=${key} suggestions=${suggestions.length}`,
      );
      return NextResponse.json(
        { error: "Theme not found", key, suggestions },
        { status: 404 },
      );
    }

    const repo = getPuzzleRepo();
    const count = await repo.getThemeCount(key, level);
    const { items } = await repo.query(
      { themes: [key], level },
      { sort: "popular", limit: 6, offset: 0 },
    );
    const samplePuzzles = await decorateWithOpenings(items);

    console.log(
      `[chess/themes/:key] ok key=${key} level=${level ?? "all"} count=${count} duration=${Date.now() - t0}ms`,
    );
    return NextResponse.json(
      {
        key: found.entry.key,
        name: found.entry.name,
        description: found.entry.description,
        group: { id: found.group.id, name: found.group.name },
        level: level ?? null,
        count,
        samplePuzzles,
      },
      { headers: METADATA_CACHE_HEADERS },
    );
  } catch (e) {
    console.error("[chess/themes/:key]", e);
    return NextResponse.json(
      { error: "Failed to load theme" },
      { status: 500 },
    );
  }
}
