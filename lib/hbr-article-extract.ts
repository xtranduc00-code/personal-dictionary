/**
 * HBR articles are a Next.js app that ship the full article payload inside a
 * <script id="__NEXT_DATA__"> JSON blob. Parsing that is cleaner and more
 * reliable than running Readability over the rendered HTML — we get the raw
 * text, structured metadata, and the canonical hero image with zero guessing.
 */

import { sanitizeHbrArticleHtml } from "@/lib/sanitize-html-app";
import { cleanHbrArticleHtml } from "@/lib/hbr-content-cleaner";

type HbrAuthor = { name?: string; bio?: string };

type HbrArticle = {
    title?: string;
    /** Plain text body (no markup). Used for reading time + textContent. */
    articleBody?: string;
    /** Rich HTML body with <p>, <h2>, <a>, <figure>, etc. */
    content?: string;
    summary?: string;
    dek?: string;
    authors?: HbrAuthor[];
    published?: string;
    primaryTopic?: string;
    hero?: {
        image?: {
            defaultSrc?: string;
            imageAltText?: string;
        };
    };
};

export type HbrExtractedArticle = {
    title: string;
    byline: string | null;
    /** HTML-safe paragraphs built from `articleBody`. */
    content: string;
    /** Plain-text body — suitable for reading time + AI enhance endpoints. */
    textContent: string;
    excerpt: string | null;
    siteName: string;
    publishedTime: string | null;
    readingTime: number;
    coverImage: string | null;
    url: string;
    category: string | null;
};

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
        .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
            String.fromCharCode(parseInt(n, 16)),
        );
}

function stripHtml(s: string): string {
    return decodeEntities(
        s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    );
}

function absolutizeHbr(href: string | undefined | null): string | null {
    if (!href) return null;
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return `https://hbr.org${trimmed}`;
    return `https://hbr.org/${trimmed.replace(/^\.?\//, "")}`;
}

function joinAuthors(authors: HbrAuthor[] | undefined): string | null {
    if (!Array.isArray(authors)) return null;
    const names = authors
        .map((a) => (typeof a?.name === "string" ? a.name.trim() : ""))
        .filter((n) => n.length > 0)
        .map(decodeEntities);
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function computeReadingTime(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}

/** True for https://hbr.org/** and https://www.hbr.org/** URLs. */
export function isHbrArticleUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return /(^|\.)hbr\.org$/i.test(u.hostname);
    } catch {
        return false;
    }
}

function extractNextData(html: string): unknown | null {
    const m = html.match(
        /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!m) return null;
    try {
        return JSON.parse(m[1]);
    } catch {
        return null;
    }
}

/**
 * Given raw HBR article HTML, pull `props.pageProps.article` out of
 * `__NEXT_DATA__` and normalize into the reader payload. Returns null if the
 * page doesn't look like an HBR article (e.g. HBR served a paywall shell,
 * login page, or their layout changed).
 */
export function extractHbrArticleFromHtml(
    html: string,
    url: string,
): HbrExtractedArticle | null {
    const data = extractNextData(html);
    if (!data || typeof data !== "object") return null;

    const article = (data as { props?: { pageProps?: { article?: HbrArticle } } })
        .props?.pageProps?.article;
    if (!article) return null;

    const title = decodeEntities((article.title ?? "").trim());
    const textContent = decodeEntities((article.articleBody ?? "").trim());
    if (!title || !textContent) return null;

    // `article.content` is the rendered HTML (paragraphs, links, headings,
    // figures). Sanitize first, then strip HBR-specific cruft (share buttons,
    // image-credit lines, empty bullets) so the reader stays clean.
    const rawHtml = typeof article.content === "string" ? article.content : "";
    const content = rawHtml
        ? cleanHbrArticleHtml(sanitizeHbrArticleHtml(rawHtml))
        : "";
    const byline = joinAuthors(article.authors);
    const excerpt =
        decodeEntities((article.dek ?? "").trim()) ||
        (article.summary ? stripHtml(article.summary).slice(0, 400) : "") ||
        null;
    const publishedTime = article.published?.trim() || null;
    const coverImage = absolutizeHbr(article.hero?.image?.defaultSrc);
    const category = article.primaryTopic?.trim() || null;

    return {
        title,
        byline,
        content,
        textContent,
        excerpt: excerpt || null,
        siteName: "Harvard Business Review",
        publishedTime,
        readingTime: computeReadingTime(textContent),
        coverImage,
        url,
        category,
    };
}
