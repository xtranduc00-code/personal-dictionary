import type { EngooArticlePayload } from "@/lib/engoo-types";
import { htmlFragmentToArticleParagraphs } from "@/lib/guardian-engoo-tutor-payload";

function stableHash(input: string): string {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
        h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}

/** Session / tutor id for any Smart Reader article URL (ASCII-safe). */
export function smartReaderTutorMasterId(sourceUrl: string): string {
    const u = sourceUrl.trim();
    return `smart-reader-${stableHash(u)}`;
}

/**
 * Shape any Smart Reader article (HBR, generic Readability, etc.) into the
 * same Engoo payload the reading tutor + CallKen expect, so the Call-AI flow
 * works identically to the Engoo and Guardian readers.
 */
export function buildSmartReaderEngooTutorPayload(opts: {
    title: string;
    html: string;
    sourceUrl: string;
    sourceLabel: string;
    thumbnailUrl?: string | null;
}): EngooArticlePayload {
    const sourceUrl = opts.sourceUrl.trim();
    const articleParagraphs = htmlFragmentToArticleParagraphs(opts.html);
    const article = articleParagraphs.join("\n\n");
    const title = opts.title.trim() || "Article";

    return {
        masterId: smartReaderTutorMasterId(sourceUrl || title),
        title,
        level: 7,
        levelLabel: "B2",
        category: opts.sourceLabel,
        thumbnailUrl: opts.thumbnailUrl ?? "",
        audio: null,
        vocabulary: [],
        article,
        articleParagraphs,
        articleParagraphsTimed: [],
        questions: [],
        discussion: [],
        furtherDiscussion: [],
        readingTutorLessonDescription: `${opts.sourceLabel} reader-view article (same structured lesson flow as Daily News)`,
    };
}
