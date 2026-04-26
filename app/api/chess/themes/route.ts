import { NextResponse } from "next/server";
import {
  METADATA_CACHE_HEADERS,
  VALID_LEVELS,
  type Level,
} from "@/lib/chess/puzzles-api/constants";
import { getPuzzleRepo } from "@/lib/chess/puzzles-api/repo";
import { getThemesCatalogue } from "@/lib/chess/puzzles-api/themes-data";

/**
 * GET /api/chess/themes?level=beginner
 *
 * Returns the full theme catalogue (6 groups × ~63 keys) annotated with the
 * puzzle count for the requested difficulty level. Counts come from the
 * materialised `theme_counts` lookup, so even with 64 chips the response
 * resolves in a fraction of a millisecond.
 *
 * `level` is optional — when omitted the response carries the *total* count
 * across all difficulties, which is what the no-difficulty-yet landing
 * shows before the user picks one.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  const url = new URL(req.url);
  const rawLevel = url.searchParams.get("level");
  const level = (VALID_LEVELS as readonly string[]).includes(rawLevel ?? "")
    ? (rawLevel as Level)
    : undefined;

  try {
    const file = await getThemesCatalogue();
    const repo = getPuzzleRepo();

    const groups = await Promise.all(
      file.groups.map(async (group) => ({
        id: group.id,
        name: group.name,
        themes: await Promise.all(
          group.themes.map(async (t) => ({
            ...t,
            count: await repo.getThemeCount(t.key, level),
          })),
        ),
      })),
    );

    console.log(
      `[chess/themes] ok level=${level ?? "all"} groups=${groups.length} duration=${Date.now() - t0}ms`,
    );
    return NextResponse.json(
      { level: level ?? null, groups },
      { headers: METADATA_CACHE_HEADERS },
    );
  } catch (e) {
    console.error("[chess/themes]", e);
    return NextResponse.json(
      { error: "Failed to load themes" },
      { status: 500 },
    );
  }
}
