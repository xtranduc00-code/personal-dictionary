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

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * `articleBody` from HBR's __NEXT_DATA__ is a single long string with
 * section titles embedded inline — no newlines, no terminator, no marker.
 * General heading detection (regex + length heuristics) is unreliable on
 * that, so we use an explicit allow-list of known HBR section titles
 * gathered from observed articles. Anything that matches becomes <h2>;
 * everything between matches is sentence-split into ~4-sentence paragraphs
 * wrapped in <p>.
 *
 * Add new titles to HBR_SECTION_TITLES as we encounter them — this is a
 * pragmatic stopgap until HBR exposes structured headings in __NEXT_DATA__.
 */
const SENTENCES_PER_PARAGRAPH = 4;

const HBR_SECTION_TITLES: string[] = [
    "The Erosion of Revenue",
    "Advertising revenue",
    "Transaction fees",
    "Subscriptions and membership fees",
    "Ecosystem services",
    "The Erosion of Competitive Advantage",
    "What Can Platforms Do?",
    "Resist",
    "Adapt",
    "Reinvent",
    "Waiting is No Longer a Good Strategy",
    "The Commitment Paradox",
    "Where Flexibility Works—and Where It Fails",
    "Boundary Conditions Matter",
    "Rethinking Corporate Advantage",
];

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function articleBodyToHtml(text: string): string {
    if (!text) return "";

    // Longest titles first so the alternation in the split regex picks the
    // most specific match (e.g. "The Erosion of Competitive Advantage" beats
    // "The Erosion of Revenue" at a position where they share a prefix).
    const sortedTitles = [...HBR_SECTION_TITLES].sort(
        (a, b) => b.length - a.length,
    );
    const titlePattern = sortedTitles.map(escapeRegex).join("|");
    const splitRegex = new RegExp(`(${titlePattern})`, "g");
    const titleSet = new Set(HBR_SECTION_TITLES);

    const parts = text.split(splitRegex);
    let html = "";

    for (const raw of parts) {
        const part = raw.trim();
        if (!part) continue;

        if (titleSet.has(part)) {
            html += `<h2>${escapeHtml(part)}</h2>`;
            continue;
        }

        const sentences = part.match(/[^.!?]+[.!?]+/g) ?? [part];
        for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARAGRAPH) {
            const para = sentences
                .slice(i, i + SENTENCES_PER_PARAGRAPH)
                .join(" ")
                .trim();
            if (para) html += `<p>${escapeHtml(para)}</p>`;
        }
    }

    return html || `<p>${escapeHtml(text)}</p>`;
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

    const rawArticleBody =
        typeof article.articleBody === "string" ? article.articleBody : "";
    const title = decodeEntities((article.title ?? "").trim());
    let textContent = decodeEntities(rawArticleBody.trim());
    if (!title || !textContent) return null;

    // HBR repeats the article title as the first line of `articleBody`, so
    // the reader would render it twice (once in <h1>, once at the top of
    // the prose). Strip the leading title if present.
    if (title && textContent.startsWith(title)) {
        textContent = textContent.slice(title.length).trimStart();
    }
    // ". . ." appears in HBR copy as a section divider — collapse to a
    // single ellipsis so it doesn't get sentence-split into 3 empty <p>s.
    textContent = textContent.replace(/\.\s\.\s\.\s?/g, "\u2026 ");

    // `article.content` is the rendered HTML (paragraphs, links, headings,
    // figures). Sanitize first, then strip HBR-specific cruft (share buttons,
    // image-credit lines, empty bullets) so the reader stays clean. When the
    // rendered HTML is suspiciously short (paywall stub: only the lede
    // paragraph survived) but `articleBody` still has the full prose, fall
    // back to wrapping the plain text in <p> tags so the reader shows the
    // whole article — losing inline figures is preferable to losing 95% of
    // the body.
    const rawHtml = typeof article.content === "string" ? article.content : "";
    const sanitized = rawHtml ? sanitizeHbrArticleHtml(rawHtml) : "";
    const cleanedHtml = sanitized ? cleanHbrArticleHtml(sanitized) : "";
    const renderedTextLength = cleanedHtml ? stripHtml(cleanedHtml).length : 0;
    const usingFallback = renderedTextLength < textContent.length * 0.5;
    const content = usingFallback
        ? articleBodyToHtml(textContent)
        : cleanedHtml;

    // Pipeline length tracker — lets us see in Netlify logs exactly where
    // the body shrinks. Drop "5–15 random char gaps" usually means the
    // upstream `articleBody` was already corrupt (paywall degraded payload),
    // because every transform below this only removes *whole elements*.
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
        try {
            const finalTextLen = stripHtml(content).length;
            console.log(
                "[hbr-extract] lengths",
                JSON.stringify({
                    url,
                    rawArticleBodyLen: rawArticleBody.length,
                    decodedTextContentLen: textContent.length,
                    rawContentHtmlLen: rawHtml.length,
                    sanitizedHtmlLen: sanitized.length,
                    cleanedHtmlLen: cleanedHtml.length,
                    cleanedTextLen: renderedTextLength,
                    finalContentHtmlLen: content.length,
                    finalContentTextLen: finalTextLen,
                    usedFallback: usingFallback,
                }),
            );
        } catch {
            /* ignore */
        }
    }
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
