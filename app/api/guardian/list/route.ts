import { NextResponse } from "next/server";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import {
  fetchGuardianListItems,
  type GuardianListSection,
} from "@/lib/guardian-list-fetch";

/** Node runtime so `process.env.GUARDIAN_API_KEY` matches Netlify server env (not Edge). */
export const runtime = "nodejs";

/** Allowlist of sections this route exposes (matches Daily News tab → Guardian map). */
const ALLOWED_SECTIONS: ReadonlySet<GuardianListSection> = new Set([
  "world",
  "sport",
  "business",
  "technology",
  "lifeandstyle",
  "culture",
  "travel",
]);

/**
 * GET ?section=world|sport|business|technology|lifeandstyle|culture|travel
 * — Guardian Content API search (developer key).
 * `sport` → Guardian `football` section + filter out women's-football stories (men's EPL/UCL/WC/transfers focus).
 * Other sections pass through 1:1 to Guardian's section IDs.
 * https://open-platform.theguardian.com/documentation/
 */
export async function GET(req: Request) {
  /** Code and Netlify UI must both use exactly `GUARDIAN_API_KEY` (no NEXT_PUBLIC_ prefix). */
  const key = process.env.GUARDIAN_API_KEY?.trim();
  if (!key) {
    console.warn("[guardian/list] GUARDIAN_API_KEY missing");
    return NextResponse.json(
      {
        error: "GUARDIAN_API_KEY is not set",
        code: "missing_api_key",
        items: [] as GuardianListItem[],
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const sectionRaw = searchParams.get("section")?.trim().toLowerCase() ?? "";
  const section: GuardianListSection = ALLOWED_SECTIONS.has(
    sectionRaw as GuardianListSection,
  )
    ? (sectionRaw as GuardianListSection)
    : "world";
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize")) || 50));

  try {
    const items = await fetchGuardianListItems(section, pageSize);
    return NextResponse.json(
      { items, section },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[guardian/list] fetch failed", { message: msg });
    return NextResponse.json(
      {
        error: msg || "Guardian list failed",
        code: "upstream_error",
        items: [] as GuardianListItem[],
      },
      { status: 502 },
    );
  }
}
