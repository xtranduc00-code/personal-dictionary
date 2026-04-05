import type { EngooArticlePayload } from "@/lib/engoo-types";

function stableHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** Session / tutor id for a Guardian article URL (ASCII-safe). */
export function guardianTutorMasterId(sourceUrl: string): string {
  const u = sourceUrl.trim();
  return `guardian-read-${stableHash(u)}`;
}

/** Turn reader HTML into plain paragraphs for the Engoo-shaped tutor payload. */
export function htmlFragmentToArticleParagraphs(html: string): string[] {
  const raw = html.trim();
  if (!raw) return [];

  if (typeof document === "undefined") {
    const one = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return one ? [one] : [];
  }

  const doc = new DOMParser().parseFromString(
    `<div id="g-tutor-root">${raw}</div>`,
    "text/html",
  );
  const root = doc.getElementById("g-tutor-root");
  const text = (root?.innerText ?? "").trim();
  if (!text) return [];

  const byDouble = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  if (byDouble.length > 0) return byDouble;
  return [text.replace(/\n/g, " ").replace(/\s+/g, " ").trim()].filter(Boolean);
}

/** Shape Guardian reader content like an Engoo payload so CallKen + reading tutor match Engoo. */
export function buildGuardianEngooTutorPayload(opts: {
  title: string;
  html: string;
  sourceUrl: string;
}): EngooArticlePayload {
  const sourceUrl = opts.sourceUrl.trim();
  const articleParagraphs = htmlFragmentToArticleParagraphs(opts.html);
  const article = articleParagraphs.join("\n\n");
  const title = opts.title.trim() || "Article";

  return {
    masterId: guardianTutorMasterId(sourceUrl || title),
    title,
    level: 7,
    levelLabel: "B2",
    category: "The Guardian",
    thumbnailUrl: "",
    audio: null,
    vocabulary: [],
    article,
    articleParagraphs,
    articleParagraphsTimed: [],
    questions: [],
    discussion: [],
    furtherDiscussion: [],
    readingTutorLessonDescription:
      "Guardian reader-view article (same structured lesson flow as Daily News)",
  };
}
