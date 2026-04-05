import { NextResponse } from "next/server";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import { fetchGuardianListItems } from "@/lib/guardian-list-fetch";

/** Node runtime so `process.env.GUARDIAN_API_KEY` matches Netlify server env (not Edge). */
export const runtime = "nodejs";

/**
 * GET ?section=world|sport — Guardian Content API search (developer key).
 * `sport` → Guardian `football` section + filter out women's-football stories (men's EPL/UCL/WC/transfers focus).
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
  const sectionRaw = searchParams.get("section")?.trim().toLowerCase();
  const section: "world" | "sport" = sectionRaw === "sport" ? "sport" : "world";
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 30));

  try {
    const items = await fetchGuardianListItems(section, pageSize);
    return NextResponse.json(
      { items, section: sectionRaw === "sport" ? "sport" : "world" },
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
