import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * Strip HBR-specific UI cruft from an article's HTML body. Intended to run
 * after sanitization, before the body is sent to the reader.
 *
 * Removes:
 *   - Social share button lists (Post / Share / Save / Print / Facebook / Twitter / LinkedIn)
 *   - Bullet lists where every <li> is empty or a share label
 *   - Standalone empty <li> elements
 *   - Image-credit paragraphs ("HBR Staff/…", "Photo by…", "Illustration by…",
 *     "Getty Images") — moved into the preceding <figure> as a <figcaption>
 *     when possible, otherwise dropped
 *   - Empty <p>/<span> elements
 *   - Duplicate share-button blocks (HBR repeats them top and bottom)
 */

const SHARE_LABELS_RE =
    /^(post|share|save|print|tweet|facebook|twitter|linkedin|email|copy link|reddit|pinterest|whatsapp)$/i;

const CREDIT_RE =
    /^(?:hbr\s*staff[\/,].+|photo(?:graph)?(?:s)? by\s+.+|illustration(?:s)? by\s+.+|image(?:s)? by\s+.+|art(?:work)? by\s+.+|courtesy of\s+.+|getty images|getty\s*images?\s*\/.*|.+\/getty images|.+\/getty\s*images?|source:\s*.+|credit:\s*.+|via\s+.+)$/i;

function txt($el: cheerio.Cheerio<AnyNode>): string {
    return $el.text().replace(/\s+/g, " ").trim();
}

export function cleanHbrArticleHtml(html: string): string {
    if (!html || !html.trim()) return html;

    const $ = cheerio.load(`<div id="__hbr_root__">${html}</div>`);
    const root = $("#__hbr_root__");

    /* ── 1. Remove share-button lists ── */
    root.find("ul, ol").each((_i, el) => {
        const $list = $(el);
        const items = $list.children("li");
        if (items.length === 0) {
            $list.remove();
            return;
        }
        const allShareOrEmpty = items.toArray().every((li) => {
            const t = $(li).text().replace(/\s+/g, " ").trim();
            if (t === "") return true;
            return SHARE_LABELS_RE.test(t);
        });
        if (allShareOrEmpty) {
            $list.remove();
        }
    });

    /* ── 2. Remove standalone empty <li> ── */
    root.find("li").each((_i, el) => {
        const $li = $(el);
        if (txt($li) === "" && $li.children("img, figure, picture, video, iframe").length === 0) {
            $li.remove();
        }
    });

    /* ── 3. Image credit lines: convert to figcaption when possible, else drop ── */
    root.find("p, span").each((_i, el) => {
        const $el = $(el);
        const t = txt($el);
        if (!t || !CREDIT_RE.test(t)) return;
        // Skip credit attached to a real link or with rich children.
        if ($el.children("a, strong, em").length > 0 && t.length > 80) return;

        // Try to attach as figcaption to the nearest preceding <figure>/<picture>/<img>.
        const $prev = $el.prev("figure, picture, p:has(img), div:has(img)");
        if ($prev.length) {
            const $fig = $prev.is("figure") ? $prev : $prev.find("figure").first();
            if ($fig.length) {
                if ($fig.find("figcaption").length === 0) {
                    $fig.append(`<figcaption>${$el.html() ?? t}</figcaption>`);
                }
                $el.remove();
                return;
            }
        }
        // No nearby figure — just strip the orphan credit line.
        $el.remove();
    });

    /* ── 4. Remove empty <p>/<span> shells ── */
    root.find("p, span").each((_i, el) => {
        const $el = $(el);
        if (
            txt($el) === "" &&
            $el.children("img, figure, picture, video, iframe, br").length === 0
        ) {
            $el.remove();
        }
    });

    /* ── 5. Dedupe identical sibling chunks (HBR repeats top/bottom share area) ── */
    const seen = new Set<string>();
    root.children().each((_i, el) => {
        const html = $.html(el).replace(/\s+/g, " ").trim();
        if (!html) return;
        if (seen.has(html)) {
            $(el).remove();
            return;
        }
        seen.add(html);
    });

    return root.html() ?? html;
}
