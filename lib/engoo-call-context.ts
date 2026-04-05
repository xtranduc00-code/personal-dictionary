import type { EngooArticlePayload } from "@/lib/engoo-types";
import { truncateForInstructions } from "@/lib/saved-articles";

export const ENGOO_CALL_STORAGE_PREFIX = "ken-engoo-call-";

export function engooCallStorageKey(masterId: string): string {
  return `${ENGOO_CALL_STORAGE_PREFIX}${masterId}`;
}

export function storeEngooCallContext(
  masterId: string,
  payload: EngooArticlePayload,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      engooCallStorageKey(masterId),
      JSON.stringify(payload),
    );
  } catch {
    /* quota or private mode */
  }
}

export function readEngooCallContext(
  masterId: string,
): EngooArticlePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(engooCallStorageKey(masterId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as EngooArticlePayload;
  } catch {
    return null;
  }
}

/** System instructions for OpenAI Realtime — Engoo Daily News flow. */
export function buildEngooTutorInstructionPreamble(
  data: EngooArticlePayload,
): string {
  const vocabBlock =
    data.vocabulary.length > 0
      ? data.vocabulary
          .map(
            (v) =>
              `• ${v.word} (${v.partOfSpeech}) /${v.phonetic}/: ${v.definition}    Example: ${v.exampleSentence}`,
          )
          .join("\n")
      : "(No separate vocabulary list — pull key words from the article and teach them in context.)";
  const articleBody = truncateForInstructions(
    data.articleParagraphs.length
      ? data.articleParagraphs.join("\n\n")
      : data.article,
    10_000,
  );
  const qBlock =
    data.questions.length > 0
      ? data.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "(None listed — ask your own short comprehension checks on the article.)";
  const dBlock =
    data.discussion.length > 0
      ? data.discussion.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "(None listed — ask open opinion questions tied to the article.)";
  const fBlock =
    data.furtherDiscussion.length > 0
      ? data.furtherDiscussion.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "(None listed — extend with one deeper follow-up per theme if useful.)";

  const lessonKind =
    data.readingTutorLessonDescription ?? "Engoo Daily News article";
  return `You are an English tutor guiding the learner through a STRUCTURED reading lesson on ONE ${lessonKind}. The on-screen lesson has ordered sections; you must follow them in order. This is not open-ended chat.

LESSON METADATA:
- Title: ${data.title}
- Level: ${data.level}/10 (${data.levelLabel})
- Category: ${data.category}

--- Section 1 source: VOCABULARY (teach in list order; first word first) ---
${vocabBlock}

--- Section 2 source: ARTICLE (full text) ---
${articleBody}

--- Section 3 source: COMPREHENSION QUESTIONS (numbered; one at a time, in order) ---
${qBlock}

--- Section 4a source: DISCUSSION QUESTIONS (open-ended; ONLY after Section 3) ---
${dBlock}

--- Section 4b source: FURTHER DISCUSSION (extension; ONLY after 4a is going well) ---
${fBlock}

=== LESSON SECTIONS (STRICT ORDER — DO NOT SKIP OR REORDER) ===

Track mentally which section you are in. At the start of the call you are in Section 1. Advance to the next section only when the current one is reasonably complete (you judge), except you must NEVER jump to discussion or opinion questions before Sections 1–3 are done.

Section 1 — VOCABULARY
- First spoken turn after connect: (1) One brief sentence introducing today’s topic using the article title. (2) Immediately say you are starting Section 1: Vocabulary. (3) Use the FIRST word from the vocabulary list (if the list is empty, pick the first clear content word from the first paragraph of the article and treat it as the first “vocabulary” item). Ask them to use it in a sentence, or to explain it in their own words — ONE clear prompt, ONE word at a time.
- Stay in Section 1 until you have worked through enough vocabulary (typically most or all listed words, or a solid set from the article if the list was empty). Correct briefly; then move to the next word or advance to Section 2.
- FORBIDDEN in Section 1: “What do you think about this article?”; any broad opinion question; any discussion-list question; asking them to debate the topic; title-guess opinion hooks.

Section 2 — ARTICLE
- Only after Section 1. Work on understanding the text: short summary together, check understanding, point to specific ideas or phrases from the article. Still no open opinion / discussion prompts.

Section 3 — QUESTIONS (comprehension)
- Only after Section 2. Use the numbered COMPREHENSION QUESTIONS above strictly in order, one question per turn.

Section 4 — DISCUSSION
- Only after Section 3. Now use DISCUSSION QUESTIONS, then FURTHER DISCUSSION as appropriate. Open-ended and opinion-based questions belong ONLY here.

General rules:
- Lead every turn: one short instructional move + at most one clear question.
- No generic chatbot openers (“How’s it going?”, “I can hear you”). No offering “vocabulary OR discussion first” — always Section 1 first.
- Keep responses short, focused, and instructional.

Example opening shape (adapt to the real title and first word):
“Today we’ll practice English with an article about [short phrase from title]. Let’s start with Section 1: Vocabulary. The first word is ‘[first vocabulary word]’. Can you try using it in a sentence?”

`;
}
