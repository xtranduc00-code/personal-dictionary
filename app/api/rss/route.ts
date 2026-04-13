import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { listRssSources, resolveRssSource } from "@/lib/rss-sources";
import {
    HBR_TAB_LABELS,
    HBR_TAB_ORDER,
    isValidHbrTab,
    scrapeTabProgressive,
    type HbrTab,
} from "@/lib/hbr-scrape";
import { hbrCacheGet, hbrCacheSet } from "@/lib/hbr-blob-cache";

export const runtime = "nodejs";
export const maxDuration = 30;

export type RssItem = {
    id: string;
    title: string;
    url: string;
    summary: string | null;
    author: string | null;
    publishedAt: string | null;
    source: string;
    thumbnail: string | null;
    category: string | null;
    readingTime: number;
};

type ParserExtras = {
    "media:content"?: { $?: { url?: string } };
    "media:thumbnail"?: { $?: { url?: string } };
    enclosure?: { url?: string; type?: string };
    "content:encoded"?: string;
    categories?: string[];
    creator?: string;
    author?: string;
};

const parser: Parser<Record<string, never>, ParserExtras> = new Parser({
    timeout: 15_000,
    customFields: {
        item: [
            ["media:content", "media:content"],
            ["media:thumbnail", "media:thumbnail"],
            ["content:encoded", "content:encoded"],
        ],
    },
});

const CACHE_TTL_MS = 30 * 60 * 1000;
type CacheEntry = { items: RssItem[]; expiresAt: number };
const feedCache = new Map<string, CacheEntry>();

function stripHtml(s: string): string {
    return s
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function firstImgFromHtml(html: string | undefined | null): string | null {
    if (!html) return null;
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1] : null;
}

function computeReadingTime(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}

function normalizeItem(
    raw: Parser.Item & ParserExtras,
    sourceName: string,
): RssItem | null {
    const title = raw.title?.trim();
    const url = raw.link?.trim();
    if (!title || !url) return null;

    const htmlBody =
        raw["content:encoded"] ?? raw.content ?? raw.contentSnippet ?? raw.summary ?? "";
    const summary = htmlBody ? stripHtml(htmlBody).slice(0, 400) : null;

    const thumbnail =
        raw["media:content"]?.$?.url ??
        raw["media:thumbnail"]?.$?.url ??
        (raw.enclosure?.type?.startsWith("image/") ? raw.enclosure.url ?? null : null) ??
        firstImgFromHtml(raw["content:encoded"] ?? raw.content ?? null);

    const author = raw.creator ?? raw.author ?? null;
    const category = Array.isArray(raw.categories) ? raw.categories[0] ?? null : null;

    return {
        id: raw.guid ?? url,
        title,
        url,
        summary,
        author,
        publishedAt: raw.isoDate ?? raw.pubDate ?? null,
        source: sourceName,
        thumbnail: thumbnail ?? null,
        category,
        readingTime: computeReadingTime(summary ?? title),
    };
}

async function fetchFeed(source: { name: string; url: string }): Promise<RssItem[]> {
    const cached = feedCache.get(source.name);
    if (cached && Date.now() < cached.expiresAt) return cached.items;

    const feed = await parser.parseURL(source.url);
    const items = (feed.items ?? [])
        .map((it) => normalizeItem(it, source.name))
        .filter((v): v is RssItem => v !== null);

    feedCache.set(source.name, { items, expiresAt: Date.now() + CACHE_TTL_MS });
    return items;
}

/** Stream HBR scrape results as NDJSON: one line per batch + a final `done` line. */
function streamHbrTab(tab: HbrTab): Response {
    const encoder = new TextEncoder();
    const all: RssItem[] = [];

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (obj: unknown) => {
                controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
            };
            try {
                await scrapeTabProgressive(tab, async (batch) => {
                    all.push(...batch.items);
                    send({
                        type: "batch",
                        articles: batch.items,
                        page: batch.page,
                        hasMore: batch.hasMore,
                    });
                });
                send({ type: "done", total: all.length });
            } catch (e) {
                send({
                    type: "error",
                    error: e instanceof Error ? e.message : String(e),
                });
            } finally {
                controller.close();
                // Persist after closing the stream so a slow Blob write
                // can't block the response — best-effort, never throws.
                if (all.length > 0) {
                    void hbrCacheSet(tab, all, "none").catch(() => {});
                }
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson",
            "X-Cache": "miss",
            "Cache-Control": "no-store",
        },
    });
}

export async function GET(req: NextRequest) {
    const sourceParam = req.nextUrl.searchParams.get("source")?.trim() ?? "";

    if (!sourceParam) {
        const sources = await listRssSources();
        sources.unshift({
            name: "hbr",
            url: "https://hbr.org/the-latest",
            label: "Harvard Business Review",
            preset: true,
        });
        return NextResponse.json({
            sources,
            hbrTabs: HBR_TAB_ORDER.map((t) => ({ id: t, label: HBR_TAB_LABELS[t] })),
        });
    }

    if (sourceParam.toLowerCase() === "hbr") {
        const rawTab =
            req.nextUrl.searchParams.get("section")?.trim() ??
            req.nextUrl.searchParams.get("tab")?.trim() ??
            "latest";
        const tab: HbrTab = isValidHbrTab(rawTab) ? rawTab : "latest";

        // Cache hit → respond instantly with regular JSON.
        const cached = await hbrCacheGet(tab);
        if (cached) {
            return NextResponse.json(
                {
                    source: "hbr",
                    tab,
                    label: "Harvard Business Review",
                    tabLabel: HBR_TAB_LABELS[tab],
                    items: cached.items,
                    fallback: cached.fallback ?? "none",
                },
                {
                    headers: {
                        "X-Cache": "hit",
                        "Cache-Control":
                            "public, s-maxage=1800, stale-while-revalidate=3600",
                    },
                },
            );
        }

        // Cache miss → progressive NDJSON stream so the client can render the
        // first batch in ~2-3s and append later batches as they arrive,
        // fitting inside Netlify's 10s sync function cap.
        return streamHbrTab(tab);
    }

    const source = await resolveRssSource(sourceParam);
    if (!source) {
        return NextResponse.json(
            { error: `Unknown RSS source: ${sourceParam}` },
            { status: 404 },
        );
    }

    try {
        const items = await fetchFeed(source);
        return NextResponse.json(
            { source: source.name, label: source.label, items },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
                },
            },
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : "RSS fetch failed";
        return NextResponse.json({ error: msg }, { status: 502 });
    }
}
