/**
 * HBR articles are a Next.js app that ship the full article payload inside a
 * <script id="__NEXT_DATA__"> JSON blob. Parsing that is cleaner and more
 * reliable than running Readability over the rendered HTML — we get the raw
 * text, structured metadata, and the canonical hero image with zero guessing.
 */

import * as cheerio from "cheerio";
import { sanitizeHbrArticleHtml } from "@/lib/sanitize-html-app";
import { cleanHbrArticleHtml } from "@/lib/hbr-content-cleaner";
import {
    logArticleExtract,
    measureArticleHtml,
} from "@/lib/article-html-validator";

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
    /** HBR editorial summary block (sanitized HTML) — renders as its own section above the body. */
    summary: string | null;
    siteName: string;
    publishedTime: string | null;
    readingTime: number;
    coverImage: string | null;
    url: string;
    category: string | null;
};

// HBR's CMS sometimes double-encodes ("Pok&amp;eacute;mon" instead of
// "Pok&eacute;mon") and uses Latin-1 named entities (&eacute;, &ouml;, ...) the
// original short table didn't cover — the title rendered literally as
// "Pok&amp;eacute;mon" in the reader. Looping until the string stops changing
// handles double encoding; the table covers the named accented characters HBR
// uses in titles, bylines, and body.
const NAMED_ENTITIES: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
    ndash: "–", mdash: "—", hellip: "…",
    middot: "·", bull: "•", copy: "©", reg: "®",
    trade: "™", deg: "°", laquo: "«", raquo: "»",
    iexcl: "¡", iquest: "¿",
    eacute: "é", aacute: "á", iacute: "í", oacute: "ó",
    uacute: "ú", yacute: "ý",
    egrave: "è", agrave: "à", igrave: "ì", ograve: "ò",
    ugrave: "ù",
    ecirc: "ê", acirc: "â", icirc: "î", ocirc: "ô",
    ucirc: "û",
    euml: "ë", auml: "ä", iuml: "ï", ouml: "ö",
    uuml: "ü", yuml: "ÿ",
    ntilde: "ñ", atilde: "ã", otilde: "õ",
    Eacute: "É", Aacute: "Á", Iacute: "Í", Oacute: "Ó",
    Uacute: "Ú",
    Egrave: "È", Agrave: "À", Ecirc: "Ê", Acirc: "Â",
    Ocirc: "Ô",
    Euml: "Ë", Auml: "Ä", Ouml: "Ö", Uuml: "Ü",
    Ntilde: "Ñ",
    ccedil: "ç", Ccedil: "Ç",
    szlig: "ß", oslash: "ø", Oslash: "Ø", aring: "å",
    Aring: "Å",
    aelig: "æ", AElig: "Æ", oelig: "œ", OElig: "Œ",
};

function decodeEntitiesOnce(s: string): string {
    return s
        .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name: string) =>
            NAMED_ENTITIES[name] ?? m,
        )
        .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
            String.fromCharCode(parseInt(n, 16)),
        );
}

function decodeEntities(s: string): string {
    if (!s || !s.includes("&")) return s;
    let prev = "";
    let curr = s;
    let iters = 0;
    while (curr !== prev && iters < 5) {
        prev = curr;
        curr = decodeEntitiesOnce(curr);
        iters += 1;
    }
    return curr;
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

const SENTENCES_PER_PARAGRAPH = 4;

/**
 * Pull all `<h2>`/`<h3>`/`<h4>` text from HBR's rich HTML body. Even when the
 * rich HTML is paywall-truncated to ~half the prose, the heading scaffolding
 * usually survives — and those headings are the most reliable way to find
 * section boundaries in `articleBody` (a single newline-free string).
 */
function extractHeadingsFromHtml(html: string): string[] {
    if (!html || !html.trim()) return [];
    try {
        const $ = cheerio.load(`<div id="__hbr_h__">${html}</div>`);
        const titles = new Set<string>();
        $("#__hbr_h__ h2, #__hbr_h__ h3, #__hbr_h__ h4").each((_, el) => {
            const t = decodeEntities(
                $(el).text().replace(/\s+/g, " ").trim(),
            );
            if (t && t.length > 0 && t.length <= 200) titles.add(t);
        });
        return Array.from(titles);
    } catch {
        return [];
    }
}

/**
 * Title-Case heading detection inside HBR's flat `articleBody` plain text.
 *
 * Why this exists: HBR's CMS doesn't always include `<h2>` markers in
 * `article.content` — articles like "The Future Is Shrouded in an AI Fog"
 * have all headings ("The Human Capital Dilemma", "Corporate Math", etc.)
 * inline as Title-Case phrases concatenated between sentences, with no
 * structured field anywhere in `__NEXT_DATA__`. hbr.org's React layer
 * parses these client-side; we replicate that on the server.
 *
 * The detector is structural (not vocabulary-based — "Principle"/"Step" lists
 * are a dead end). At every sentence boundary it asks: does the text right
 * after the boundary look like a Title-Case heading?
 *
 * Acceptance rule (tuned against AI Fog, Walkman, Tim Cook, Negotiating):
 *
 *   STRONG signal (always accept):
 *     - Cut is followed by `:` then a Cap+lower sentence start. Catches
 *       numbered headings like "Principle 1: Convenience always trumps...".
 *
 *   WEAK signal (accept only if ≥ 3 content words):
 *     - Cut ends on a Title-Case content word, lookahead is `[A-Z][a-z]`,
 *       run has ≥ 3 content words (Title-Case AND not in stopword list).
 *
 *   Trade-off: 2-word "The Solution" / "Corporate Math" / "Buy Outcomes"
 *   headings get dropped to keep "Engineer Gunpei Yokoi"-style person names
 *   from being promoted to <h2>. Conservative on purpose — better to under-
 *   detect headings (clean reading) than over-detect (jarring noise).
 *
 *   Always reject: transition-stopword starts (But/And/However/...), trailing
 *   possessives ('s), candidates outside 8–80 chars, runs < 2 words.
 */
const HEADING_LEADING_ARTICLES = new Set(["the", "a", "an", "this"]);
const HEADING_INNER_STOPWORDS = new Set([
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "with",
    "as", "by", "vs", "from", "into", "that", "this", "these", "those",
]);
const HEADING_TRANSITION_STOPWORDS = new Set([
    "but", "and", "or", "so", "yet", "now", "then", "however", "therefore",
    "indeed", "nevertheless", "meanwhile", "besides", "also", "further",
    "furthermore", "moreover", "thus", "hence", "consequently", "accordingly",
    "still", "additionally", "specifically", "similarly", "conversely",
]);

function isTitleCaseWord(w: string): boolean {
    if (!w) return false;
    return /^[A-Z][A-Za-z]*$/.test(w);
}

function isDigitOrRoman(w: string): boolean {
    if (!w) return false;
    return /^\d{1,3}$/.test(w) || /^[IVXLCDM]+$/.test(w);
}

type DetectedHeading = { start: number; end: number; text: string };

function detectInlineHeadings(text: string): DetectedHeading[] {
    if (!text) return [];
    const out: DetectedHeading[] = [];

    // Candidate sentence-start positions (incl. very start of text).
    const candidatePositions: number[] = [0];
    const boundaryRe = /[.?!][”’"']?\s+/g;
    let bm: RegExpExecArray | null;
    while ((bm = boundaryRe.exec(text)) !== null) {
        candidatePositions.push(bm.index + bm[0].length);
    }

    for (const start of candidatePositions) {
        const slice = text.slice(start, start + 200);
        const tokens: { w: string; end: number }[] = [];
        const wordRe = /\S+/g;
        let wm: RegExpExecArray | null;
        while ((wm = wordRe.exec(slice)) !== null) {
            tokens.push({ w: wm[0], end: wm.index + wm[0].length });
            if (tokens.length >= 12) break;
        }
        if (tokens.length < 2) continue;

        const stripTrailingPunct = (w: string) => w.replace(/[,;:]+$/, "");
        const firstClean = stripTrailingPunct(tokens[0].w);
        const firstLower = firstClean.toLowerCase();
        if (HEADING_TRANSITION_STOPWORDS.has(firstLower)) continue;
        if (
            !isTitleCaseWord(firstClean) &&
            !HEADING_LEADING_ARTICLES.has(firstLower)
        ) {
            continue;
        }

        // Walk the run: Title-Case, digit/Roman, OR inner stopword.
        type RunEntry = {
            end: number;
            isTitleCase: boolean;
            isContent: boolean; // Title-Case AND not stopword
            isDigit: boolean;
            endsWithColon: boolean; // raw token ended in `:` (e.g. "1:")
        };
        const run: RunEntry[] = [];
        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            const cleanW = stripTrailingPunct(tok.w);
            const lower = cleanW.toLowerCase();
            const isTC = isTitleCaseWord(cleanW);
            const isStop = HEADING_INNER_STOPWORDS.has(lower);
            const isDigit = isDigitOrRoman(cleanW);
            if (!isTC && !isStop && !isDigit) break;
            run.push({
                end: tok.end,
                isTitleCase: isTC,
                isContent: isTC && !isStop,
                isDigit,
                endsWithColon: /:$/.test(tok.w),
            });
        }
        if (run.length < 2) continue;

        let bestEnd = -1;
        let bestText = "";
        for (let cut = 1; cut < run.length; cut++) {
            const r = run[cut];
            // Cut must end at a content word OR a digit (numbered heading).
            if (!r.isContent && !r.isDigit) continue;

            // Look ahead: skip optional `:` glued to the cut token, optional
            // whitespace + `:` separator, optional opening quote, then expect Cap+low.
            // Quote handling catches Walkman's `Principle 2: "The street finds...`.
            let j = r.end;
            let isStrongColon = r.endsWithColon;
            while (j < slice.length && /\s/.test(slice[j])) j += 1;
            if (slice[j] === ":") {
                isStrongColon = true;
                j += 1;
                while (j < slice.length && /\s/.test(slice[j])) j += 1;
            }
            while (j < slice.length && /[“”‘’"']/.test(slice[j])) j += 1;
            if (j + 1 >= slice.length) continue;
            if (!/[A-Z]/.test(slice[j]) || !/[a-z]/.test(slice[j + 1])) continue;

            const candidate = slice.slice(0, r.end).trim().replace(/[,;:]$/, "");
            if (candidate.length < 8 || candidate.length > 80) continue;
            if (/['’]/.test(candidate)) continue;

            const contentCount = run
                .slice(0, cut + 1)
                .filter((x) => x.isContent).length;

            // STRONG signal: colon-after with at least 1 content/digit word.
            // WEAK signal: 3+ content words, OR 2 content words at ≥20 chars
            // (rescues "Optimizing for the Unknown"-style headings without
            //  promoting "Engineer Gunpei"/"Sara Jones" two-word person names).
            const strongOk = isStrongColon && (contentCount >= 1 || r.isDigit);
            const weakOk =
                contentCount >= 3 ||
                (contentCount >= 2 && candidate.length >= 20);
            if (!strongOk && !weakOk) continue;

            bestEnd = r.end;
            bestText = candidate;
        }

        if (bestEnd > 0) {
            out.push({ start, end: start + bestEnd, text: bestText });
        }
    }

    // Drop overlaps (e.g. consecutive matches at boundary positions inside a
    // detected heading). Keep the earliest match for each region.
    const sorted = out.sort((a, b) => a.start - b.start);
    const merged: DetectedHeading[] = [];
    for (const h of sorted) {
        const prev = merged[merged.length - 1];
        if (prev && h.start < prev.end) continue;
        merged.push(h);
    }
    return merged;
}

function splitIntoParagraphs(part: string): string {
    let html = "";
    const sentences = part.match(/[^.!?]+[.!?]+/g) ?? [part];
    for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARAGRAPH) {
        const para = sentences
            .slice(i, i + SENTENCES_PER_PARAGRAPH)
            .join(" ")
            .trim();
        if (para) html += `<p>${escapeHtml(para)}</p>`;
    }
    return html;
}

/**
 * Build semantic HTML from HBR's flat `articleBody`. Cuts the body at every
 * heading position (from `knownHeadings` extracted from rich HTML PLUS
 * Title-Case phrases detected via `detectInlineHeadings`), emitting `<h2>`
 * for each heading and sentence-grouped `<p>` for the body chunks between.
 *
 * Positional (not regex-split) so identical strings appearing inside body
 * prose don't get accidentally promoted to headings.
 */
function articleBodyToHtml(text: string, knownHeadings: string[] = []): string {
    if (!text) return "";

    type Marker = { start: number; end: number; text: string };
    const markers: Marker[] = [];

    // Headings extracted from rich HTML — match each as a substring (first
    // occurrence) so we can position them in articleBody.
    for (const h of knownHeadings) {
        const trimmed = h.trim();
        if (!trimmed) continue;
        const idx = text.indexOf(trimmed);
        if (idx < 0) continue;
        markers.push({ start: idx, end: idx + trimmed.length, text: trimmed });
    }

    // Heuristic Title-Case headings inside the plain text.
    for (const h of detectInlineHeadings(text)) {
        markers.push(h);
    }

    if (markers.length === 0) {
        return splitIntoParagraphs(text) || `<p>${escapeHtml(text)}</p>`;
    }

    // Sort by start, drop overlaps (prefer the longer marker when overlapping).
    markers.sort((a, b) => a.start - b.start || b.end - a.end);
    const finalMarkers: Marker[] = [];
    for (const m of markers) {
        const prev = finalMarkers[finalMarkers.length - 1];
        if (prev && m.start < prev.end) {
            // Overlap: keep whichever covers the most ground.
            if (m.end - m.start > prev.end - prev.start) {
                finalMarkers[finalMarkers.length - 1] = m;
            }
            continue;
        }
        finalMarkers.push(m);
    }

    let html = "";
    let cursor = 0;
    for (const m of finalMarkers) {
        if (m.start > cursor) {
            html += splitIntoParagraphs(text.slice(cursor, m.start).trim());
        }
        html += `<h2>${escapeHtml(m.text)}</h2>`;
        cursor = m.end;
    }
    if (cursor < text.length) {
        html += splitIntoParagraphs(text.slice(cursor).trim());
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
    textContent = textContent.replace(/\.\s\.\s\.\s?/g, "… ");

    // `article.content` is the rendered HTML (paragraphs, links, headings,
    // figures). Sanitize first, then strip HBR-specific cruft (share buttons,
    // image-credit lines, empty bullets) so the reader stays clean.
    //
    // Three reconstruction paths, picked by inspecting cleanedHtml:
    //
    //   1. Paywall stub (cleaned text < 50% of articleBody): rebuild from
    //      articleBody + heading detection. We lose inline figures but keep
    //      the full prose — preferable to losing 95% of the body.
    //   2. cleanedHtml has structural headings (Walkman: 5×<h2>, Negotiating:
    //      1×<h2>): use cleanedHtml as-is.
    //   3. cleanedHtml has full prose but ZERO structural headings (AI Fog,
    //      Tim Cook): rebuild from articleBody + heading detection. HBR's
    //      CMS doesn't always include <h2> in `article.content`; the same
    //      headings exist as Title-Case phrases inline in articleBody.
    const rawHtml = typeof article.content === "string" ? article.content : "";
    const sanitized = rawHtml ? sanitizeHbrArticleHtml(rawHtml) : "";
    const cleanedHtml = sanitized ? cleanHbrArticleHtml(sanitized) : "";
    const renderedTextLength = cleanedHtml ? stripHtml(cleanedHtml).length : 0;
    const richHeadings = extractHeadingsFromHtml(cleanedHtml || sanitized || rawHtml);
    const isPaywallStub = renderedTextLength < textContent.length * 0.5;
    const cleanedHasNoStructuralHeadings =
        !!cleanedHtml && richHeadings.length === 0;
    const usingFallback = isPaywallStub || cleanedHasNoStructuralHeadings;
    const content = usingFallback
        ? articleBodyToHtml(textContent, richHeadings)
        : cleanedHtml;

    // Unified extract metric log — visible in Netlify for regression hunting.
    // Length deltas (raw articleBody vs final HTML text) used to be in a
    // separate `[hbr-extract] lengths` log; folded into the single validator
    // emission so production grep stays simple. The same logger emits a WARN
    // for "only paragraphs" articles (extract layer flatten smell).
    const metrics = measureArticleHtml(content);
    logArticleExtract({
        source: "hbr",
        url,
        metrics,
        extra: {
            rawArticleBodyLen: rawArticleBody.length,
            cleanedHtmlLen: cleanedHtml.length,
            usedFallback: usingFallback,
            richHeadingCount: richHeadings.length,
            isPaywallStub,
            cleanedHasNoStructuralHeadings,
        },
    });
    const byline = joinAuthors(article.authors);
    const excerpt =
        decodeEntities((article.dek ?? "").trim()) ||
        (article.summary ? stripHtml(article.summary).slice(0, 400) : "") ||
        null;
    const summaryHtml =
        typeof article.summary === "string" && article.summary.trim()
            ? sanitizeHbrArticleHtml(article.summary)
            : null;
    const publishedTime = article.published?.trim() || null;
    const coverImage = absolutizeHbr(article.hero?.image?.defaultSrc);
    const category = article.primaryTopic?.trim() || null;

    return {
        title,
        byline,
        content,
        textContent,
        excerpt: excerpt || null,
        summary: summaryHtml && summaryHtml.trim() ? summaryHtml : null,
        siteName: "Harvard Business Review",
        publishedTime,
        readingTime: computeReadingTime(textContent),
        coverImage,
        url,
        category,
    };
}
