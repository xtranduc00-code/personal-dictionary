import * as cheerio from "cheerio";
import Parser from "rss-parser";
import type { RssItem } from "@/app/api/rss/route";

/**
 * HBR's feed is dead (hbr.org/feed → 404). For each public section page, we
 * scrape the HTML directly. The page strategies differ:
 *
 *   stream-item   — /the-latest (custom element with data-* attributes)
 *   feed-entry    — /data-visuals (classic server-rendered <li>)
 *   __NEXT_DATA__ — /reading-lists, /executive (Next.js JSON payload)
 *   cards / tiles — /magazine, /case-selections (generic .card / .tile)
 *
 * To keep the main flow simple we run a pipeline of parser strategies; the
 * first strategy that yields items wins. When `?page=N` actually returns new
 * content we accumulate pages 1..5 in parallel and dedupe by URL.
 *
 * Fallback: if scraping still yields nothing we swap in MIT Tech Review's RSS
 * so the sidebar isn't empty — but ONLY for the /the-latest tab, so a reader
 * opening /magazine doesn't accidentally get MIT content mis-labeled.
 */

export type HbrTab =
    | "latest"
    | "magazine"
    | "topics"
    | "podcasts"
    | "store"
    | "reading-lists"
    | "data-visuals"
    | "case-selections"
    | "executive";

export const HBR_TAB_ORDER: HbrTab[] = [
    "latest",
    "magazine",
    "topics",
    "podcasts",
    "store",
    "reading-lists",
    "data-visuals",
    "case-selections",
    "executive",
];

export const HBR_TAB_LABELS: Record<HbrTab, string> = {
    latest: "Latest",
    magazine: "Magazine",
    topics: "Topics",
    podcasts: "Podcasts",
    store: "Store",
    "reading-lists": "Reading Lists",
    "data-visuals": "Data & Visuals",
    "case-selections": "Case Selections",
    executive: "HBR Executive",
};

const HBR_TAB_PATHS: Record<HbrTab, string> = {
    latest: "/the-latest",
    magazine: "/magazine",
    topics: "/topics",
    podcasts: "/podcasts",
    store: "/store",
    "reading-lists": "/reading-lists",
    "data-visuals": "/data-visuals",
    "case-selections": "/case-selections",
    executive: "/executive",
};

const MIT_FEED_URL = "https://www.technologyreview.com/feed/";
/**
 * Trimmed for Netlify free tier (10s sync function cap). We previously fanned
 * out 5 pages × 10 topics = up to 15 sockets per request, which routinely
 * pushed past the wall. 2 pages + 3 topics = 5 sockets keeps us under it.
 */
const MAX_PAGES_PER_SECTION = 2;
const MAX_ITEMS_PER_SECTION = 50;

/**
 * /the-latest only ever server-renders 8 items. We supplement it (and power
 * the /topics tab) by scraping a small set of high-volume HBR subject pages —
 * each returns ~40 stream-items — then dedupe and sort by publish date.
 * Cut from 10 to 3 to stay inside the 10s Netlify sync function limit.
 */
const HBR_LATEST_TOPIC_SLUGS = [
    "strategy",
    "leadership",
    "generative-ai",
];

const BROWSER_HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.google.com/",
};

/* ───────────────────── helpers ───────────────────── */

function absolutize(href: string | undefined | null): string | null {
    if (!href) return null;
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return `https://hbr.org${trimmed}`;
    return `https://hbr.org/${trimmed.replace(/^\.?\//, "")}`;
}

function cleanText(s: string | undefined | null): string {
    return (s ?? "").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&rsquo;/g, "\u2019")
        .replace(/&lsquo;/g, "\u2018")
        .replace(/&rdquo;/g, "\u201D")
        .replace(/&ldquo;/g, "\u201C")
        .replace(/&ndash;/g, "\u2013")
        .replace(/&mdash;/g, "\u2014")
        .replace(/&hellip;/g, "\u2026")
        // HBR sometimes ships malformed entities without a trailing `;`
        // (e.g. `Problem&#8212and How to…` instead of `Problem&#8212;and …`).
        // Match both forms.
        .replace(/&#(\d+);?/g, (_, n: string) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);?/gi, (_, n: string) =>
            String.fromCharCode(parseInt(n, 16)),
        );
}

/**
 * Predicate: is this URL an actual HBR article worth opening in the reader?
 * Filters out store products, podcast subscriptions, store landings,
 * downloads, etc. — anything that wouldn't render meaningfully as prose.
 */
function isReadableHbrArticle(url: string, contentType?: string | null): boolean {
    try {
        const u = new URL(url);
        if (/(^|\.)store\.hbr\.org$/i.test(u.hostname)) return false;
        if (/^\/store\//i.test(u.pathname)) return false;
        if (/^\/(downloads?|product)/i.test(u.pathname)) return false;
    } catch {
        return false;
    }
    if (contentType) {
        const t = contentType.toLowerCase();
        if (
            t === "book" ||
            t === "ebook" ||
            t === "audiobook" ||
            t.includes("special collection") ||
            t.includes("paperback") ||
            t.includes("subscription")
        ) {
            return false;
        }
    }
    return true;
}

function dateFromUrl(url: string): string | null {
    const m = url.match(/\/(\d{4})\/(\d{1,2})\//);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
    }
    return new Date(Date.UTC(year, month - 1, 1)).toISOString();
}

function joinAuthors(raw: string | undefined | null): string | null {
    const s = cleanText(raw);
    if (!s) return null;
    const parts = s.split(";").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
    return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}

function firstSrcFromSrcset(srcset: string | undefined | null): string | null {
    if (!srcset) return null;
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    return first || null;
}

function computeReadingTime(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}

async function fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const res = await fetch(url, {
            redirect: "follow",
            signal: controller.signal,
            cache: "no-store",
            headers: BROWSER_HEADERS,
        });
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("text/html")) return null;
        return await res.text();
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function loadNextData(
    html: string,
): { pageProps?: Record<string, unknown> } | null {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    try {
        const parsed = JSON.parse(m[1]) as { props?: { pageProps?: Record<string, unknown> } };
        return parsed.props ?? null;
    } catch {
        return null;
    }
}

/* ───────────────────── parsers (strategies) ───────────────────── */

function parseStreamItems(html: string): RssItem[] {
    const $ = cheerio.load(html);
    const items: RssItem[] = [];
    $("stream-item").each((_i, el) => {
        const $el = $(el);
        const title = cleanText($el.attr("data-title"));
        const url = absolutize($el.attr("data-url"));
        if (!title || !url) return;
        const summary = cleanText($el.attr("data-summary")) || null;
        const category = cleanText($el.attr("data-topic")) || null;
        const contentType = cleanText($el.attr("data-content-type")) || null;
        // Topic feeds mix in books, ebooks, paperback bundles, store landing
        // pages — none of which render meaningfully in the reader. Drop them.
        if (!isReadableHbrArticle(url, contentType)) return;
        const author = joinAuthors($el.attr("data-authors"));
        const thumbnail = absolutize($el.attr("data-content-image"));
        const timeEl = $el.find("pubdate time, time").first();
        const publishedAt =
            cleanText(timeEl.attr("datetime")) ||
            cleanText(timeEl.text()) ||
            dateFromUrl(url) ||
            null;
        items.push({
            id: url,
            title: decodeEntities(title),
            url,
            summary: summary ? decodeEntities(summary) : null,
            author,
            publishedAt,
            source: "hbr",
            thumbnail,
            category: category ?? contentType,
            readingTime: computeReadingTime(summary ?? title),
        });
    });
    return items;
}

function parseFeedEntries(html: string): RssItem[] {
    const $ = cheerio.load(html);
    const items: RssItem[] = [];
    $("li.feed-entry").each((_i, el) => {
        const $el = $(el);
        const title = cleanText($el.find(".entry-title").first().text());
        const parentLinkEl = $el.find(".entry-parent-article a[href]").first();
        const url = absolutize(parentLinkEl.attr("href"));
        if (!title || !url) return;
        const category = cleanText($el.find(".entry-subject").first().text()) || null;
        const thumbnail =
            absolutize($el.find(".entry-image img").attr("src")) ||
            absolutize(firstSrcFromSrcset($el.find(".entry-image img").attr("srcset")));
        const parentText = cleanText($el.find(".entry-parent-article").first().text());
        const dateMatch = parentText.match(/([A-Z][a-z]+ \d{1,2},\s*\d{4})/);
        const parsedDate = dateMatch
            ? (() => {
                  const d = new Date(dateMatch[1]);
                  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
              })()
            : dateFromUrl(url);
        const parentTitle = cleanText(parentLinkEl.text());
        const summary = parentTitle ? `Chart from: ${parentTitle}` : null;
        items.push({
            id: url,
            title: decodeEntities(title),
            url,
            summary,
            author: null,
            publishedAt: parsedDate,
            source: "hbr",
            thumbnail,
            category,
            readingTime: computeReadingTime(summary ?? title),
        });
    });
    return items;
}

function parseReadingListsNextData(html: string): RssItem[] {
    const props = loadNextData(html);
    const lists = props?.pageProps?.readingLists as
        | Array<{
              title?: string;
              dek?: string;
              curated?: string;
              articleCount?: number;
              image?: { srcset?: string; defaultSrc?: string };
              link?: string;
          }>
        | undefined;
    if (!Array.isArray(lists)) return [];
    const items: RssItem[] = [];
    for (const entry of lists) {
        const title = decodeEntities(cleanText(entry.title));
        const url = absolutize(entry.link);
        if (!title || !url) continue;
        const thumbnail =
            absolutize(entry.image?.defaultSrc) ??
            absolutize(firstSrcFromSrcset(entry.image?.srcset));
        const dek = entry.dek ? decodeEntities(cleanText(entry.dek)) : null;
        const count =
            typeof entry.articleCount === "number" ? entry.articleCount : null;
        const summary = dek
            ? count != null
                ? `${dek} (${count} articles)`
                : dek
            : count != null
              ? `${count} articles`
              : null;
        items.push({
            id: url,
            title,
            url,
            summary,
            author: null,
            publishedAt: entry.curated ?? null,
            source: "hbr",
            thumbnail,
            category: "Reading List",
            readingTime: computeReadingTime(summary ?? title),
        });
    }
    return items;
}

function parseExecutiveNextData(html: string): RssItem[] {
    const props = loadNextData(html);
    const exec = props?.pageProps?.execContent as
        | {
              featured?: ExecContentItem | ExecContentItem[];
              latest?: { contents?: ExecContentItem[] };
              "content-zone"?: { items?: ExecContentItem[] };
              "popular"?: { items?: ExecContentItem[] } | ExecContentItem[];
          }
        | undefined;
    if (!exec) return [];
    const buckets: ExecContentItem[] = [];
    const push = (v: ExecContentItem | ExecContentItem[] | undefined) => {
        if (!v) return;
        if (Array.isArray(v)) buckets.push(...v);
        else buckets.push(v);
    };
    push(exec.featured);
    push(exec.latest?.contents);
    push(exec["content-zone"]?.items);
    push(
        Array.isArray(exec.popular)
            ? exec.popular
            : exec.popular?.items,
    );

    const items: RssItem[] = [];
    for (const entry of buckets) {
        const title = decodeEntities(cleanText(entry.title));
        const url = absolutize(entry.uri);
        if (!title || !url) continue;
        const dek = entry.dek ? decodeEntities(cleanText(entry.dek)) : null;
        const image = entry.image ?? entry.thumbnail;
        const thumbnail =
            absolutize(image?.defaultSrc) ??
            absolutize(firstSrcFromSrcset(image?.srcset));
        items.push({
            id: url,
            title,
            url,
            summary: dek,
            author: null,
            publishedAt: entry["published-date"] ?? null,
            source: "hbr",
            thumbnail,
            category: entry.type ?? "HBR Executive",
            readingTime: computeReadingTime(dek ?? title),
        });
    }
    return items;
}

type ExecContentItem = {
    title?: string;
    dek?: string;
    uri?: string;
    type?: string;
    "published-date"?: string;
    image?: { defaultSrc?: string; srcset?: string };
    thumbnail?: { defaultSrc?: string; srcset?: string };
};

/**
 * Generic card/tile parser — used for /magazine and /case-selections where
 * HBR just renders `.card` or `.tile` blocks without data-* attributes.
 */
function parseCardsOrTiles(html: string): RssItem[] {
    const $ = cheerio.load(html);
    const items: RssItem[] = [];
    const seen = new Set<string>();

    const selectors = [".card", ".tile", ".magazine-cover", "article"];
    for (const sel of selectors) {
        $(sel).each((_i, el) => {
            const $el = $(el);
            const linkEl = $el.find("a[href]").first();
            const url = absolutize(linkEl.attr("href"));
            if (!url) return;
            // Only keep article-shaped URLs (skip nav, store, landing links)
            if (!/\/(20|19)\d{2}\/|\/reading-lists\/|\/magazine\/|\/case-selections\//.test(url)) {
                return;
            }
            if (seen.has(url)) return;

            const title =
                cleanText($el.find("h1, h2, h3, h4, .hed").first().text()) ||
                cleanText(linkEl.attr("aria-label")) ||
                cleanText(linkEl.text());
            if (!title || title.length < 4) return;

            const category =
                cleanText(
                    $el
                        .find('.topic, [class*="topic" i], [class*="category" i]')
                        .first()
                        .text(),
                ) || null;
            const summary =
                cleanText(
                    $el.find('.dek, .deck, .description, p').first().text(),
                ) || null;
            const thumbnail =
                absolutize($el.find("img").attr("src")) ||
                absolutize(firstSrcFromSrcset($el.find("img").attr("srcset"))) ||
                absolutize(firstSrcFromSrcset($el.find("source").attr("srcset")));

            seen.add(url);
            items.push({
                id: url,
                title: decodeEntities(title),
                url,
                summary: summary ? decodeEntities(summary) : null,
                author: null,
                publishedAt: dateFromUrl(url),
                source: "hbr",
                thumbnail,
                category,
                readingTime: computeReadingTime(summary ?? title),
            });
        });
    }
    return items;
}

/** /magazine — `.card > a[href^="/archive-toc/"]` issue covers. */
function parseMagazineCovers(html: string): RssItem[] {
    const $ = cheerio.load(html);
    const items: RssItem[] = [];
    const seen = new Set<string>();
    $(".card").each((_i, el) => {
        const $el = $(el);
        const anchor = $el.find('a[href^="/archive-toc/"]').first();
        const url = absolutize(anchor.attr("href"));
        if (!url || seen.has(url)) return;
        const title =
            cleanText(anchor.attr("aria-label")) ||
            cleanText($el.find(".hed, h1, h2, h3, h4").first().text()) ||
            cleanText(anchor.text());
        if (!title) return;
        const thumbnail =
            absolutize($el.find("img").attr("src")) ||
            absolutize(firstSrcFromSrcset($el.find("img").attr("srcset"))) ||
            absolutize(firstSrcFromSrcset($el.find("source").attr("srcset")));
        seen.add(url);
        items.push({
            id: url,
            title: decodeEntities(title),
            url,
            summary: "Magazine issue",
            author: null,
            publishedAt: null,
            source: "hbr",
            thumbnail,
            category: "Magazine",
            readingTime: 1,
        });
    });
    return items;
}

/** /case-selections — `.tile[data-case-selection-name]` curated case bundles. */
function parseCaseSelections(html: string): RssItem[] {
    const $ = cheerio.load(html);
    const items: RssItem[] = [];
    const seen = new Set<string>();
    $(".tile[data-case-selection-name]").each((_i, el) => {
        const $el = $(el);
        const slug = cleanText($el.attr("data-case-selection-name"));
        if (!slug) return;
        const url = `https://hbr.org/case-selections/${slug}`;
        if (seen.has(url)) return;
        const title =
            cleanText($el.find(".tile-article-title").first().text()) ||
            cleanText(
                $el.find(".collection-data").attr("data-collection-name"),
            );
        if (!title) return;
        const summary = cleanText($el.find(".tile-summary").first().text()) || null;
        const category =
            cleanText($el.find(".tile-subject-tag").first().text()) ||
            cleanText(
                $el.find(".collection-data").attr("data-collection-category"),
            ) ||
            "Case Selection";
        const dateLabel = cleanText($el.find(".tile-date-label").first().text());
        const dateMatch = dateLabel.match(/([A-Z][a-z]+ \d{1,2},\s*\d{4})/);
        const publishedAt = dateMatch
            ? (() => {
                  const d = new Date(dateMatch[1]);
                  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
              })()
            : null;
        const thumbnail =
            absolutize($el.find("img").attr("src")) ||
            absolutize(firstSrcFromSrcset($el.find("img").attr("srcset")));
        seen.add(url);
        items.push({
            id: url,
            title: decodeEntities(title),
            url,
            summary: summary ? decodeEntities(summary) : null,
            author: null,
            publishedAt,
            source: "hbr",
            thumbnail,
            category,
            readingTime: computeReadingTime(summary ?? title),
        });
    });
    return items;
}

/* ───────────────────── parser pipeline ───────────────────── */

type ParserFn = (html: string) => RssItem[];

const STRATEGIES_BY_TAB: Record<HbrTab, ParserFn[]> = {
    latest: [parseStreamItems, parseCardsOrTiles],
    magazine: [parseMagazineCovers, parseStreamItems, parseCardsOrTiles],
    topics: [parseCardsOrTiles],
    podcasts: [parseCardsOrTiles],
    store: [parseCardsOrTiles],
    "reading-lists": [parseReadingListsNextData, parseCardsOrTiles],
    "data-visuals": [parseFeedEntries, parseCardsOrTiles],
    "case-selections": [parseCaseSelections, parseCardsOrTiles],
    executive: [parseExecutiveNextData, parseCardsOrTiles],
};

function parseWithStrategies(html: string, tab: HbrTab): RssItem[] {
    for (const strategy of STRATEGIES_BY_TAB[tab]) {
        const out = strategy(html);
        if (out.length > 0) return out;
    }
    return [];
}

async function fetchPage(tab: HbrTab, page: number): Promise<RssItem[]> {
    const base = `https://hbr.org${HBR_TAB_PATHS[tab]}`;
    const url = page > 1 ? `${base}?page=${page}` : base;
    const html = await fetchHtml(url);
    if (!html) return [];
    return parseWithStrategies(html, tab);
}

function sortByDateDesc(items: RssItem[]): RssItem[] {
    return items.slice().sort((a, b) => {
        const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return (tb || 0) - (ta || 0);
    });
}

/**
 * Fetch pages 1..N in parallel, dedupe by url, sort desc, slice to 50.
 * If page 2 returns the same top URL as page 1 (HBR doesn't honor `?page=`
 * server-side for this section), the dedupe step naturally reduces the set
 * to whatever the section actually rendered.
 */
async function scrapeTabAcrossPages(tab: HbrTab): Promise<RssItem[]> {
    const pages = Array.from({ length: MAX_PAGES_PER_SECTION }, (_, i) => i + 1);
    const results = await Promise.all(pages.map((p) => fetchPage(tab, p)));
    const seen = new Set<string>();
    const merged: RssItem[] = [];
    for (const page of results) {
        for (const it of page) {
            if (seen.has(it.url)) continue;
            seen.add(it.url);
            merged.push(it);
        }
    }
    return sortByDateDesc(merged).slice(0, MAX_ITEMS_PER_SECTION);
}

/**
 * Fetch the listed topic-subject pages in parallel and merge their
 * stream-items. Each topic page renders ~40 items, so this gives us a much
 * fatter pool than /the-latest alone (which caps at 8).
 */
async function fetchLatestAcrossTopics(): Promise<RssItem[]> {
    const urls = HBR_LATEST_TOPIC_SLUGS.map(
        (slug) => `https://hbr.org/topic/subject/${slug}`,
    );
    const htmls = await Promise.all(urls.map((u) => fetchHtml(u)));
    const seen = new Set<string>();
    const merged: RssItem[] = [];
    for (const html of htmls) {
        if (!html) continue;
        for (const it of parseStreamItems(html)) {
            if (seen.has(it.url)) continue;
            seen.add(it.url);
            merged.push(it);
        }
    }
    return sortByDateDesc(merged);
}

/* ───────────────────── MIT Tech Review fallback ───────────────────── */

const mitParser = new Parser({ timeout: 15_000 });

export async function fetchMitTechReviewAsHbr(): Promise<RssItem[]> {
    try {
        const feed = await mitParser.parseURL(MIT_FEED_URL);
        return (feed.items ?? [])
            .map((raw): RssItem | null => {
                const title = raw.title?.trim();
                const url = raw.link?.trim();
                if (!title || !url) return null;
                const body =
                    raw.content ?? raw.contentSnippet ?? raw.summary ?? "";
                const summary = body
                    ? body.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 400)
                    : null;
                const firstImg =
                    body.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;
                return {
                    id: raw.guid ?? url,
                    title,
                    url,
                    summary,
                    author: raw.creator ?? raw.author ?? null,
                    publishedAt: raw.isoDate ?? raw.pubDate ?? null,
                    source: "hbr",
                    thumbnail: firstImg,
                    category: Array.isArray(raw.categories)
                        ? raw.categories[0] ?? null
                        : null,
                    readingTime: computeReadingTime(summary ?? title),
                };
            })
            .filter((v): v is RssItem => v !== null);
    } catch {
        return [];
    }
}

/* ───────────────────── public API ───────────────────── */

export type HbrProgressiveBatch = {
    page: number;
    items: RssItem[];
    hasMore: boolean;
};

/**
 * Progressive variant: emit page 1 immediately so the client can render, then
 * race the remaining sources in parallel against a wall-clock deadline.
 * Default 9s — keeps us under Netlify's 10s sync function cap.
 *
 * `onBatch` receives un-sorted, deduped batches in completion order. Final
 * return value is the date-sorted, sliced list suitable for cache persistence.
 */
export async function scrapeTabProgressive(
    tab: HbrTab,
    onBatch: (batch: HbrProgressiveBatch) => void | Promise<void>,
    deadlineMs = 9_000,
): Promise<RssItem[]> {
    const start = Date.now();
    const remaining = () => Math.max(0, deadlineMs - (Date.now() - start));

    const seen = new Set<string>();
    const merged: RssItem[] = [];
    const dedupePush = (items: RssItem[]): RssItem[] => {
        const fresh: RssItem[] = [];
        for (const it of items) {
            if (seen.has(it.url)) continue;
            seen.add(it.url);
            merged.push(it);
            fresh.push(it);
        }
        return fresh;
    };

    type Task = () => Promise<RssItem[]>;
    let firstTask: Task;
    let restTasks: Task[];

    if (tab === "latest" || tab === "topics") {
        firstTask =
            tab === "latest"
                ? () => fetchPage("latest", 1)
                : async () => {
                      const html = await fetchHtml(
                          `https://hbr.org/topic/subject/${HBR_LATEST_TOPIC_SLUGS[0]}`,
                      );
                      return html ? parseStreamItems(html) : [];
                  };
        const topicSlugs =
            tab === "topics"
                ? HBR_LATEST_TOPIC_SLUGS.slice(1)
                : HBR_LATEST_TOPIC_SLUGS;
        restTasks = topicSlugs.map(
            (slug): Task =>
                async () => {
                    const html = await fetchHtml(
                        `https://hbr.org/topic/subject/${slug}`,
                    );
                    return html ? parseStreamItems(html) : [];
                },
        );
    } else {
        firstTask = () => fetchPage(tab, 1);
        restTasks = Array.from(
            { length: MAX_PAGES_PER_SECTION - 1 },
            (_, i) => () => fetchPage(tab, i + 2),
        );
    }

    let firstItems: RssItem[] = [];
    try {
        firstItems = await firstTask();
    } catch {
        firstItems = [];
    }
    const firstFresh = dedupePush(firstItems);
    await onBatch({
        page: 1,
        items: firstFresh,
        hasMore: restTasks.length > 0,
    });

    if (restTasks.length === 0) {
        return sortByDateDesc(merged).slice(0, MAX_ITEMS_PER_SECTION);
    }

    let resolvedCount = 0;
    const total = restTasks.length;
    const racing = restTasks.map((fn, i) =>
        fn()
            .catch(() => [] as RssItem[])
            .then(async (items) => {
                resolvedCount++;
                const fresh = dedupePush(items);
                if (fresh.length > 0) {
                    await onBatch({
                        page: i + 2,
                        items: fresh,
                        hasMore: resolvedCount < total,
                    });
                }
            }),
    );
    await Promise.race([
        Promise.allSettled(racing),
        new Promise<void>((r) => setTimeout(r, remaining())),
    ]);

    return sortByDateDesc(merged).slice(0, MAX_ITEMS_PER_SECTION);
}

export async function getHbrTabItems(
    tab: HbrTab,
): Promise<{ items: RssItem[]; fallback: "none" | "mit-tech-review" }> {
    // Latest + Topics: merge /the-latest with several topic-subject pages
    // (each yields ~40 items) so the user sees a real backlog instead of 8.
    if (tab === "latest" || tab === "topics") {
        const [primary, topicPool] = await Promise.all([
            tab === "latest" ? scrapeTabAcrossPages("latest") : Promise.resolve([] as RssItem[]),
            fetchLatestAcrossTopics(),
        ]);
        const seen = new Set<string>();
        const merged: RssItem[] = [];
        for (const it of [...primary, ...topicPool]) {
            if (seen.has(it.url)) continue;
            seen.add(it.url);
            merged.push(it);
        }
        const items = sortByDateDesc(merged).slice(0, MAX_ITEMS_PER_SECTION);
        if (items.length > 0) return { items, fallback: "none" };
        if (tab === "latest") {
            const fb = await fetchMitTechReviewAsHbr();
            return { items: fb, fallback: "mit-tech-review" };
        }
        return { items: [], fallback: "none" };
    }

    const items = await scrapeTabAcrossPages(tab);
    if (items.length > 0) return { items, fallback: "none" };
    return { items: [], fallback: "none" };
}

export async function getHbrFeedItems(): Promise<{
    items: RssItem[];
    fallback: "none" | "mit-tech-review";
}> {
    return getHbrTabItems("latest");
}

export function isValidHbrTab(value: string | null | undefined): value is HbrTab {
    return (HBR_TAB_ORDER as readonly string[]).includes(value ?? "");
}
