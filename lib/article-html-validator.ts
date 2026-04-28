/**
 * Cross-source article HTML validator. Counts semantic tag occurrences in
 * extracted reader HTML and emits warnings when the structure looks suspect
 * (e.g. lots of paragraphs but no headings/figures/lists — a smell that the
 * extract layer flattened structured content into a sea of <p>).
 *
 * Used by the HBR + Guardian fetch pipelines to surface regressions in real
 * traffic. Keep the warning shape stable so log greps in Netlify keep working:
 *
 *   [article-extract] source=hbr url=... headings=4 paragraphs=23 figures=1 lists=0
 *   [article-extract] WARN source=hbr url=... 0 headings, 18 paragraphs — possible miss
 */

export type ArticleHtmlMetrics = {
    paragraphs: number;
    headings: { h1: number; h2: number; h3: number; h4: number };
    headingsTotal: number;
    figures: number;
    blockquotes: number;
    lists: number;
    tables: number;
    pre: number;
};

const TAG_COUNTERS: Array<[string, RegExp]> = [
    ["paragraphs", /<p\b/gi],
    ["h1", /<h1\b/gi],
    ["h2", /<h2\b/gi],
    ["h3", /<h3\b/gi],
    ["h4", /<h4\b/gi],
    ["figures", /<figure\b/gi],
    ["blockquotes", /<blockquote\b/gi],
    ["uls", /<ul\b/gi],
    ["ols", /<ol\b/gi],
    ["tables", /<table\b/gi],
    ["pre", /<pre\b/gi],
];

function count(html: string, re: RegExp): number {
    return (html.match(re) ?? []).length;
}

export function measureArticleHtml(html: string): ArticleHtmlMetrics {
    const get = (key: string) => {
        const entry = TAG_COUNTERS.find(([k]) => k === key);
        return entry ? count(html, entry[1]) : 0;
    };
    const h1 = get("h1");
    const h2 = get("h2");
    const h3 = get("h3");
    const h4 = get("h4");
    return {
        paragraphs: get("paragraphs"),
        headings: { h1, h2, h3, h4 },
        headingsTotal: h1 + h2 + h3 + h4,
        figures: get("figures"),
        blockquotes: get("blockquotes"),
        lists: get("uls") + get("ols"),
        tables: get("tables"),
        pre: get("pre"),
    };
}

/** Heuristic: long article with > 5 <p> but no heading/figure/list/table. */
export function isOnlyParagraphs(m: ArticleHtmlMetrics): boolean {
    return (
        m.paragraphs > 5 &&
        m.headingsTotal === 0 &&
        m.figures === 0 &&
        m.lists === 0 &&
        m.tables === 0 &&
        m.blockquotes === 0
    );
}

export function logArticleExtract(opts: {
    source: string;
    url: string;
    metrics: ArticleHtmlMetrics;
    extra?: Record<string, unknown>;
}): void {
    const { source, url, metrics, extra } = opts;
    try {
        const base = {
            source,
            url,
            paragraphs: metrics.paragraphs,
            headings: metrics.headingsTotal,
            h2: metrics.headings.h2,
            h3: metrics.headings.h3,
            figures: metrics.figures,
            lists: metrics.lists,
            tables: metrics.tables,
            blockquotes: metrics.blockquotes,
            ...(extra ?? {}),
        };
        console.log("[article-extract]", JSON.stringify(base));
        if (isOnlyParagraphs(metrics)) {
            console.warn(
                "[article-extract] WARN",
                JSON.stringify({
                    source,
                    url,
                    reason: "only-paragraphs",
                    paragraphs: metrics.paragraphs,
                    headingsTotal: metrics.headingsTotal,
                }),
            );
        }
    } catch {
        /* logging never throws */
    }
}
