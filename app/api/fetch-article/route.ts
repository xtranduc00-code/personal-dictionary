import { Readability } from "@mozilla/readability";
import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { z } from "zod";
import {
    extractHbrArticleFromHtml,
    isHbrArticleUrl,
} from "@/lib/hbr-article-extract";

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
/** Wayback snapshots are immutable — keep them around longer than direct fetches. */
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
                // Pretend the user just clicked through from a Google search and
                // explicitly wipe any cookies — keeps HBR's meter at 0/freshest.
                Cookie: "",
                Referer: "https://www.google.com/",
                "sec-ch-ua":
                    '"Chromium";v="120", "Google Chrome";v="120"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"macOS"',
            },
        });
        if (!res.ok) {
            throw new Error(`Upstream HTTP ${res.status}`);
        }
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("text/html") && !ct.includes("xml")) {
            throw new Error("Upstream did not return HTML");
        }
        const html = await res.text();
        if (
            typeof process !== "undefined" &&
            process.env.NODE_ENV === "production"
        ) {
            // Fetch-stage diagnostic: status + bytes received from upstream.
            // If `htmlLen` is suspiciously short for an HBR article, the
            // publisher served a paywall/login stub — meaning `__NEXT_DATA__`
            // (and `articleBody` inside it) is already truncated upstream.
            try {
                console.log(
                    "[fetch-article] upstream",
                    JSON.stringify({
                        requested: url,
                        finalUrl: res.url || url,
                        status: res.status,
                        contentType: ct,
                        contentLength:
                            res.headers.get("content-length") ?? null,
                        contentEncoding:
                            res.headers.get("content-encoding") ?? null,
                        htmlLen: html.length,
                    }),
                );
            } catch {
                /* ignore */
            }
        }
        return { html, finalUrl: res.url || url };
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Strip Wayback's injected toolbar, scripts, and URL-rewrites so the
 * remaining HTML looks like the original page. Without this, Readability
 * trips on Wayback's wrapper navigation and emits a sea of empty <p> tags;
 * `__NEXT_DATA__` JSON also lives unmodified on the page so HBR's bespoke
 * extractor (`extractHbrArticleFromHtml`) parses cleanly once the wrapper
 * is gone.
 */
function stripWaybackChrome(html: string): string {
    return html
        // 1. Toolbar block injected at the top of every snapshot.
        .replace(
            /<!--\s*BEGIN WAYBACK TOOLBAR[\s\S]*?END WAYBACK TOOLBAR[^>]*-->/gi,
            "",
        )
        // 2. The toolbar's <script> + <link> tags from archive.org.
        .replace(
            /<script[^>]*\b(?:src=["'][^"']*archive\.org[^"']*["'][^>]*|>[\s\S]*?wbhack[\s\S]*?)<\/script>/gi,
            "",
        )
        .replace(
            /<link[^>]+archive\.org[^>]*>/gi,
            "",
        )
        // 3. URL rewrites: `https://web.archive.org/web/<ts>[mod_]/<original>`
        //    Strip the prefix so srcs/hrefs point at the real origin again.
        .replace(
            /https?:\/\/web\.archive\.org\/web\/\d+\w{0,3}\//gi,
            "",
        );
}

/**
 * Try to load the article from the Wayback Machine before hitting hbr.org
 * directly. HBR detects datacenter IPs (Netlify Lambda) and serves a
 * deliberately corrupted `articleBody` ("intent to fulfillment" → "illment")
 * to anti-bot it, but Wayback archives the page from a real browser session
 * so the snapshot HTML is clean and `__NEXT_DATA__` parses normally.
 */
async function fetchViaWayback(url: string): Promise<string | null> {
    try {
        const availRes = await fetch(
            `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
            { signal: AbortSignal.timeout(5_000) },
        );
        if (!availRes.ok) return null;

        const avail = (await availRes.json()) as {
            archived_snapshots?: { closest?: { url?: string } };
        };
        const snapshotUrl = avail?.archived_snapshots?.closest?.url;
        if (!snapshotUrl) return null;

        const snapRes = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(10_000),
            headers: {
                "User-Agent": pickUserAgent(),
                Accept: "text/html",
            },
        });
        if (!snapRes.ok) return null;

        const html = await snapRes.text();
        if (!html || html.length < 10_000) return null;
        return stripWaybackChrome(html);
    } catch {
        return null;
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
    // hero image, and primary topic without HTML guessing. If the embedded
    // body is suspiciously short (paywall served a truncated stub), keep the
    // candidate around and compare against Readability's pass over the same
    // HTML — sometimes the inline DOM has more than the JSON envelope did.
    let hbrCandidate: ArticlePayload | null = null;
    if (isHbrArticleUrl(url)) {
        hbrCandidate = extractHbrArticleFromHtml(html, url);
        if (hbrCandidate && (hbrCandidate.textContent?.length ?? 0) >= 2000) {
            return hbrCandidate;
        }
    }

    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    const reader = new Readability(doc);
    const parsed = reader.parse();

    const textContent = parsed?.textContent?.trim() ?? "";
    if (!textContent || textContent.length < 80) {
        // Readability bailed but the HBR JSON envelope had *something* — better
        // a short HBR stub than a hard 422.
        return hbrCandidate;
    }

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

    const readabilityPayload: ArticlePayload = {
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

    // For HBR, return whichever extractor produced more body text.
    if (hbrCandidate) {
        const hbrLen = hbrCandidate.textContent?.length ?? 0;
        const readLen = readabilityPayload.textContent?.length ?? 0;
        return hbrLen >= readLen ? hbrCandidate : readabilityPayload;
    }

    return readabilityPayload;
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

        // HBR serves a corrupted articleBody to datacenter IPs. Wayback's
        // archived snapshot was captured by a real browser session, so the
        // text is intact. Try it first; fall through to direct fetch if no
        // snapshot exists yet or extraction is too short to trust.
        if (isHbrArticleUrl(key)) {
            try {
                const waybackHtml = await fetchViaWayback(key);
                if (waybackHtml) {
                    const article = extractArticle(waybackHtml, key);
                    if (article && (article.textContent?.length ?? 0) > 2000) {
                        try {
                            cacheSet(key, article, ARCHIVE_CACHE_TTL_MS);
                        } catch {
                            /* cache write failed — still return the article */
                        }
                        return NextResponse.json(article, {
                            headers: {
                                "x-article-cache": "miss",
                                "x-article-source": "wayback",
                                ...NO_CACHE_HEADERS,
                            },
                        });
                    }
                }
            } catch {
                /* Wayback failed — fall through to direct fetch */
            }
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
