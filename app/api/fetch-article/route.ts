import { Readability } from "@mozilla/readability";
import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { z } from "zod";
import {
    extractHbrArticleFromHtml,
    isHbrArticleUrl,
} from "@/lib/hbr-article-extract";
import {
    buildHbrProxyChain,
    fetchProxyHtml,
    type HbrProxySource,
} from "@/lib/hbr-proxy-chain";

export const runtime = "nodejs";

/**
 * Never let Netlify's CDN cache article responses. The payload varies by
 * `?url=` query; a single stale edge-cache entry would collapse every
 * subsequent article fetch into the same body.
 */
const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Netlify-CDN-Cache-Control": "no-store",
    Vary: "*",
};

/**
 * Smart Reader article fetcher.
 *
 * GET /api/fetch-article?url=<encoded>
 *   → rich Readability output (title, byline, content, textContent, excerpt,
 *     siteName, publishedTime, readingTime, coverImage, url) with 1h memory cache
 *     and per-request Chrome User-Agent rotation to defeat cookie/storage paywalls
 *     (notably HBR).
 *
 * POST (legacy, kept for `components/articles/article-browser-home.tsx`) returns
 *   a lighter payload { title, content, source, url }.
 */

const CHROME_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

function pickUserAgent(): string {
    return CHROME_UAS[Math.floor(Math.random() * CHROME_UAS.length)];
}

type ArticlePayload = {
    title: string;
    byline: string | null;
    content: string;
    textContent: string;
    excerpt: string | null;
    siteName: string | null;
    publishedTime: string | null;
    readingTime: number;
    coverImage: string | null;
    url: string;
    category?: string | null;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
/** archive.ph snapshots don't move once captured, so cache HBR-via-archive results longer. */
const ARCHIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
type CacheEntry = { payload: ArticlePayload; expiresAt: number };
const articleCache = new Map<string, CacheEntry>();

function cacheGet(url: string): ArticlePayload | null {
    const hit = articleCache.get(url);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        articleCache.delete(url);
        return null;
    }
    return hit.payload;
}

function cacheSet(url: string, payload: ArticlePayload, ttlMs = CACHE_TTL_MS): void {
    articleCache.set(url, { payload, expiresAt: Date.now() + ttlMs });
}

function validateUrl(raw: string): URL | null {
    try {
        const u = new URL(raw);
        if (!["http:", "https:"].includes(u.protocol)) return null;
        return u;
    } catch {
        return null;
    }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const res = await fetch(url, {
            redirect: "follow",
            signal: controller.signal,
            // `cache: "no-store"` ensures we never reuse a prior response — each call
            // gets a fresh server socket, which matters for meter-based paywalls.
            cache: "no-store",
            headers: {
                "User-Agent": pickUserAgent(),
                Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
                // Fresh Sec-Fetch-* hints — most sites expect these from Chrome.
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
                Connection: "close",
            },
        });
        if (!res.ok) {
            throw new Error(`Upstream HTTP ${res.status}`);
        }
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("text/html") && !ct.includes("xml")) {
            throw new Error("Upstream did not return HTML");
        }
        return { html: await res.text(), finalUrl: res.url || url };
    } finally {
        clearTimeout(timeout);
    }
}

function metaContent(doc: Document, selectors: string[]): string | null {
    for (const sel of selectors) {
        const el = doc.querySelector(sel);
        const v = el?.getAttribute("content")?.trim();
        if (v) return v;
    }
    return null;
}

function computeReadingTime(words: number): number {
    return Math.max(1, Math.round(words / 200));
}

function extractArticle(html: string, url: string): ArticlePayload | null {
    // HBR articles bundle a clean JSON payload in __NEXT_DATA__ — prefer that
    // over Readability on *.hbr.org so we get the full body, real byline list,
    // hero image, and primary topic without HTML guessing.
    if (isHbrArticleUrl(url)) {
        const hbr = extractHbrArticleFromHtml(html, url);
        if (hbr) return hbr;
    }

    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    const reader = new Readability(doc);
    const parsed = reader.parse();

    const textContent = parsed?.textContent?.trim() ?? "";
    if (!textContent || textContent.length < 80) return null;

    const words = textContent.split(/\s+/).filter(Boolean).length;
    const hostname = new URL(url).hostname.replace(/^www\./, "");

    const title =
        parsed?.title?.trim() ||
        metaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
        doc.querySelector("title")?.textContent?.trim() ||
        hostname;

    const byline =
        parsed?.byline?.trim() ||
        metaContent(doc, [
            'meta[name="author"]',
            'meta[property="article:author"]',
            'meta[name="twitter:creator"]',
        ]);

    const excerpt =
        parsed?.excerpt?.trim() ||
        metaContent(doc, [
            'meta[property="og:description"]',
            'meta[name="description"]',
            'meta[name="twitter:description"]',
        ]);

    const siteName =
        parsed?.siteName?.trim() ||
        metaContent(doc, ['meta[property="og:site_name"]']) ||
        hostname;

    const publishedTime = metaContent(doc, [
        'meta[property="article:published_time"]',
        'meta[name="article:published_time"]',
        'meta[property="og:published_time"]',
        'meta[itemprop="datePublished"]',
    ]);

    const coverImage = metaContent(doc, [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[property="twitter:image"]',
    ]);

    return {
        title,
        byline: byline ?? null,
        content: parsed?.content ?? "",
        textContent,
        excerpt: excerpt ?? null,
        siteName: siteName ?? null,
        publishedTime: publishedTime ?? null,
        readingTime: computeReadingTime(words),
        coverImage: coverImage ?? null,
        url,
    };
}

export async function GET(req: NextRequest) {
    // Outermost safety net: Netlify converts any uncaught throw into a plain
    // "Internal Server Error" text body, which breaks res.json() on the client.
    // Every code path below must resolve to a JSON response.
    try {
        const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
        if (!raw) {
            return NextResponse.json(
                { error: "Missing ?url" },
                { status: 400, headers: NO_CACHE_HEADERS },
            );
        }
        const parsedUrl = validateUrl(raw);
        if (!parsedUrl) {
            return NextResponse.json(
                { error: "Invalid URL" },
                { status: 400, headers: NO_CACHE_HEADERS },
            );
        }
        const key = parsedUrl.toString();

        try {
            const cached = cacheGet(key);
            if (cached) {
                return NextResponse.json(cached, {
                    headers: { "x-article-cache": "hit", ...NO_CACHE_HEADERS },
                });
            }
        } catch {
            /* cache read failed — fall through to live fetch */
        }

        // HBR's cookie-meter blocks direct fetch after ~2 articles per session.
        // Try a chain of public reader proxies first. Each gets 8s, then we run
        // Readability on the returned HTML and only accept it as a real success if
        // textContent >= 2000 chars (anything shorter usually means the proxy
        // returned a paywalled stub or its own error page).
        if (isHbrArticleUrl(key)) {
            const chain = buildHbrProxyChain(key);
            for (const attempt of chain) {
                try {
                    const html = await fetchProxyHtml(attempt.url, 8_000);
                    if (!html) continue;
                    const article = extractArticle(html, key);
                    if (!article) continue;
                    if ((article.textContent?.length ?? 0) < 2000) continue;
                    try {
                        cacheSet(key, article, ARCHIVE_CACHE_TTL_MS);
                    } catch {
                        /* cache write failed — still return the article */
                    }
                    return NextResponse.json(article, {
                        headers: {
                            "x-article-cache": "miss",
                            "x-article-source":
                                attempt.source satisfies HbrProxySource,
                            ...NO_CACHE_HEADERS,
                        },
                    });
                } catch {
                    // Any proxy-step failure (network, parse, jsdom OOM) must
                    // not abort the whole chain — move on to the next attempt.
                    continue;
                }
            }
            // All proxies failed — fall through to direct fetch (returns partial).
        }

        try {
            const { html, finalUrl } = await fetchHtml(key);
            const article = extractArticle(html, finalUrl);
            if (!article) {
                return NextResponse.json(
                    { error: "Could not extract readable content from this page." },
                    { status: 422, headers: NO_CACHE_HEADERS },
                );
            }
            try {
                cacheSet(key, article);
            } catch {
                /* cache write failed — still return the article */
            }
            return NextResponse.json(article, {
                headers: {
                    "x-article-cache": "miss",
                    "x-article-source": "direct",
                    ...NO_CACHE_HEADERS,
                },
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("abort") || msg === "AbortError") {
                return NextResponse.json(
                    { error: "The request timed out. Try again." },
                    { status: 408, headers: NO_CACHE_HEADERS },
                );
            }
            return NextResponse.json(
                { error: "Could not fetch or parse the page." },
                { status: 422, headers: NO_CACHE_HEADERS },
            );
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[fetch-article] unhandled", msg);
        return NextResponse.json(
            { error: "Failed to fetch article", content: null },
            { status: 500, headers: NO_CACHE_HEADERS },
        );
    }
}

const postSchema = z.object({ url: z.string().url().max(2048) });

export async function POST(req: NextRequest) {
    try {
    let body: { url: string };
    try {
        const j: unknown = await req.json();
        const r = postSchema.safeParse(j);
        if (!r.success) {
            return NextResponse.json(
                { error: "Invalid URL." },
                { status: 400, headers: NO_CACHE_HEADERS },
            );
        }
        body = r.data;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400, headers: NO_CACHE_HEADERS },
        );
    }

    const parsedUrl = validateUrl(body.url);
    if (!parsedUrl) {
        return NextResponse.json(
            { error: "Only http(s) URLs are allowed." },
            { status: 400, headers: NO_CACHE_HEADERS },
        );
    }
    const key = parsedUrl.toString();
    const cached = cacheGet(key);
    if (cached) {
        return NextResponse.json(
            {
                title: cached.title,
                content: cached.textContent,
                source: cached.siteName,
                url: cached.url,
            },
            { headers: NO_CACHE_HEADERS },
        );
    }

    try {
        const { html, finalUrl } = await fetchHtml(key);
        const article = extractArticle(html, finalUrl);
        if (!article) {
            return NextResponse.json(
                {
                    error:
                        "Could not extract readable article text. Try pasting the article text manually.",
                },
                { status: 422, headers: NO_CACHE_HEADERS },
            );
        }
        cacheSet(key, article);
        return NextResponse.json(
            {
                title: article.title,
                content: article.textContent,
                source: article.siteName,
                url: article.url,
            },
            { headers: NO_CACHE_HEADERS },
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("abort") || msg === "AbortError") {
            return NextResponse.json(
                { error: "The request timed out. Try again, or paste the article text manually." },
                { status: 408, headers: NO_CACHE_HEADERS },
            );
        }
        return NextResponse.json(
            {
                error:
                    "Could not fetch or parse the page. Many sites block automated access — paste the article text manually.",
            },
            { status: 422, headers: NO_CACHE_HEADERS },
        );
    }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[fetch-article POST] unhandled", msg);
        return NextResponse.json(
            { error: "Failed to fetch article", content: null },
            { status: 500, headers: NO_CACHE_HEADERS },
        );
    }
}
