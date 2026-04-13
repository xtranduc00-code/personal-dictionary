import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import {
    HBR_TAB_ORDER,
    type HbrTab,
} from "@/lib/hbr-scrape";
import { hbrCacheGet } from "@/lib/hbr-blob-cache";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Pre-warms the Netlify Blobs cache for every HBR section by hitting the
 * existing `/api/rss?source=hbr&section=<tab>` endpoint once per section.
 * Cache hits short-circuit immediately, so this is cheap to call repeatedly.
 *
 * Each request is fire-and-forget so the warmer route returns instantly —
 * the actual scrape work runs in the per-section Lambdas.
 */
export async function GET(req: NextRequest) {
    const h = await headers();
    const host =
        h.get("x-forwarded-host") ?? h.get("host") ?? req.nextUrl.host;
    const proto =
        h.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "") ?? "http";
    const base = `${proto}://${host}`;

    const triggered: HbrTab[] = [];
    const skipped: HbrTab[] = [];

    await Promise.all(
        HBR_TAB_ORDER.map(async (tab) => {
            // If the cache is already warm, skip the scrape entirely.
            const cached = await hbrCacheGet(tab);
            if (cached) {
                skipped.push(tab);
                return;
            }
            triggered.push(tab);
            try {
                // Fire-and-forget — the scrape Lambda runs independently and
                // writes its own blob entry on success.
                fetch(`${base}/api/rss?source=hbr&section=${tab}`, {
                    method: "GET",
                    signal: AbortSignal.timeout(8_000),
                }).catch(() => {});
            } catch {
                /* AbortSignal.timeout may throw on very old runtimes — ignore */
            }
        }),
    );

    return NextResponse.json(
        { triggered, skipped },
        { headers: { "Cache-Control": "no-store" } },
    );
}
