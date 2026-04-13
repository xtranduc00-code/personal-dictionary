import { Readability } from "@mozilla/readability";

/**
 * Browser-side HBR article loader.
 *
 * HBR's cookie meter blocks any third-party server fetch after a couple of
 * articles per session, and Netlify's 10s function cap leaves no room for
 * the multi-proxy chain `/api/fetch-article` runs server-side. Doing the
 * work in the browser sidesteps both: we fetch the archive.ph snapshot
 * directly (or via a thin same-origin proxy when CORS blocks the call),
 * then run Readability over the HTML in the user's tab.
 */

export type ClientArticle = {
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
};

const ARCHIVE_HOSTS = [
    (u: string) => `https://archive.ph/newest/${u}`,
    (u: string) => `https://archive.today/newest/${u}`,
    (u: string) => `https://web.archive.org/web/2*/${u}`,
];

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

function extractFromHtml(html: string, originalUrl: string): ClientArticle | null {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const reader = new Readability(doc);
    const parsed = reader.parse();
    const textContent = parsed?.textContent?.trim() ?? "";
    if (!textContent || textContent.length < 500) return null;

    const words = textContent.split(/\s+/).filter(Boolean).length;
    const hostname = (() => {
        try {
            return new URL(originalUrl).hostname.replace(/^www\./, "");
        } catch {
            return "hbr.org";
        }
    })();

    const title =
        parsed?.title?.trim() ||
        metaContent(doc, [
            'meta[property="og:title"]',
            'meta[name="twitter:title"]',
        ]) ||
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
        ]);

    const siteName =
        parsed?.siteName?.trim() ||
        metaContent(doc, ['meta[property="og:site_name"]']) ||
        "Harvard Business Review";

    const publishedTime = metaContent(doc, [
        'meta[property="article:published_time"]',
        'meta[name="article:published_time"]',
        'meta[itemprop="datePublished"]',
    ]);

    const coverImage = metaContent(doc, [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
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
        url: originalUrl,
    };
}

/**
 * Try a direct `fetch` first; CORS will usually block it on archive.* and
 * we silently fall through to the same-origin `/api/proxy` path.
 */
async function fetchHtmlWithFallback(
    snapshotUrl: string,
    signal: AbortSignal,
): Promise<string | null> {
    try {
        const res = await fetch(snapshotUrl, {
            mode: "cors",
            credentials: "omit",
            redirect: "follow",
            signal,
        });
        if (res.ok) {
            const text = await res.text();
            if (text && text.length > 1000) return text;
        }
    } catch {
        // Likely a CORS / network error — fall through to the proxy.
    }

    try {
        const proxied = `/api/proxy?url=${encodeURIComponent(snapshotUrl)}`;
        const res = await fetch(proxied, {
            credentials: "same-origin",
            signal,
        });
        if (!res.ok) return null;
        const text = await res.text();
        if (!text || text.length < 1000) return null;
        return text;
    } catch {
        return null;
    }
}

export async function fetchHbrArticleInBrowser(
    articleUrl: string,
    signal: AbortSignal,
): Promise<ClientArticle | null> {
    for (const build of ARCHIVE_HOSTS) {
        if (signal.aborted) return null;
        const snapshotUrl = build(articleUrl);
        const html = await fetchHtmlWithFallback(snapshotUrl, signal);
        if (!html) continue;
        const article = extractFromHtml(html, articleUrl);
        if (article) return article;
    }
    return null;
}
