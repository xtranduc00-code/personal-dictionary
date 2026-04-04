import type {
  EngooArticlePayload,
  EngooArticleTimedParagraph,
  EngooArticleTimedSentence,
  EngooVocabularyItem,
} from "@/lib/engoo-types";
import { engooLevelLabelFromNumber } from "@/lib/engoo-level-label";
import { parseIso8601DurationToSeconds } from "@/lib/engoo-duration";
import { stripEngooPrnPlaceholders } from "@/lib/engoo-format-text";

type RefMap = Record<string, Record<string, unknown>>;

function refGet(refs: RefMap, r: unknown): Record<string, unknown> | null {
  if (typeof r !== "string" || !refs[r]) return null;
  return refs[r];
}

function textFromMaybeTextNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const o = node as Record<string, unknown>;
  if (typeof o.text === "string") return stripEngooPrnPlaceholders(o.text);
  return "";
}

export function parseEngooLessonEnvelope(
  envelope: {
    data?: Record<string, unknown>;
    references?: RefMap;
  },
  masterId: string,
  categoryLabel: string,
): EngooArticlePayload {
  const data = envelope.data ?? {};
  const refs = envelope.references ?? {};
  const exercises = (data.exercises as unknown[]) ?? [];

  const vocabExercise = exercises[0] as Record<string, unknown> | undefined;
  const articleExercise = exercises[1] as Record<string, unknown> | undefined;
  const questionsExercise = exercises[2] as Record<string, unknown> | undefined;
  const discussionExercise = exercises[3] as Record<string, unknown> | undefined;
  const furtherExercise = exercises[4] as Record<string, unknown> | undefined;

  const vocabulary: EngooVocabularyItem[] = [];
  if (vocabExercise?.sections) {
    const sections = vocabExercise.sections as Record<string, unknown>[];
    const vocabSection = sections.find((s) => s._type === "VocabSection");
    const words = (vocabSection?.vocab_section_words as unknown[]) ?? [];
    for (const item of words) {
      const row = item as Record<string, unknown>;
      const wordRef = (row.word as { _ref?: string })?._ref;
      const wordObj = refGet(refs, wordRef);
      if (!wordObj) continue;

      const word = stripEngooPrnPlaceholders(
        typeof wordObj.word === "string" ? wordObj.word : "",
      );
      const partOfSpeech =
        typeof wordObj.part_of_speech === "string"
          ? wordObj.part_of_speech
          : "";
      const pronunciations = wordObj.pronunciations as unknown;
      const phonetic = Array.isArray(pronunciations) && pronunciations[0]
        ? String(pronunciations[0])
        : "";
      const definition = stripEngooPrnPlaceholders(
        typeof wordObj.definition === "string" ? wordObj.definition : "",
      );
      const sound = wordObj.sound as { url?: string } | undefined;
      const audioUrl = sound?.url ?? null;

      const sentences = (row.vocab_section_word_sentences as unknown[]) ?? [];
      let exampleSentence = "";
      let imageUrl: string | null = null;
      for (const vs of sentences) {
        const vsRow = vs as Record<string, unknown>;
        const wsRef = (vsRow.word_sentence as { _ref?: string })?._ref;
        const wordSentence = refGet(refs, wsRef);
        if (!wordSentence) continue;
        const sentRef = (wordSentence.sentence as { _ref?: string })?._ref;
        const sentenceObj = refGet(refs, sentRef);
        if (!sentenceObj) continue;
        const text = stripEngooPrnPlaceholders(
          typeof sentenceObj.text === "string" ? sentenceObj.text : "",
        );
        if (text && !exampleSentence) exampleSentence = text;
        const img = sentenceObj.image as { url?: string } | undefined;
        if (img?.url && !imageUrl) imageUrl = img.url;
      }

      if (word) {
        vocabulary.push({
          word,
          partOfSpeech,
          phonetic,
          definition,
          exampleSentence,
          imageUrl,
          audioUrl,
        });
      }
    }
  }

  let articleParagraphs: string[] = [];
  let articleParagraphsTimed: EngooArticleTimedParagraph[] = [];
  let articleAudio: string | null = null;
  let articleSentenceSeq = 0;
  let articleTimeCursor = 0;
  if (articleExercise?.sections) {
    const sections = articleExercise.sections as Record<string, unknown>[];
    const articleSection = sections.find((s) => s._type === "ArticleSection");
    if (articleSection) {
      const combined = articleSection.combined_audio as { url?: string } | undefined;
      articleAudio = combined?.url ?? null;

      const sectionTitleText = textFromMaybeTextNode(
        (articleSection.title_text as Record<string, unknown>) ?? {},
      ).trim();
      const titleAud = articleSection.title_audio as
        | { duration?: string }
        | undefined;
      let titleDurSec = parseIso8601DurationToSeconds(titleAud?.duration);
      if (sectionTitleText && titleDurSec <= 0) {
        const wc = sectionTitleText.split(/\s+/).filter(Boolean).length;
        titleDurSec = wc > 0 ? Math.max(0.85, wc * 0.32) : 0.85;
      }
      if (sectionTitleText && titleDurSec > 0) {
        const startT = articleTimeCursor;
        const endT = articleTimeCursor + titleDurSec;
        articleTimeCursor = endT;
        articleParagraphsTimed.push({
          isTitle: true,
          sentences: [
            {
              index: articleSentenceSeq++,
              text: sectionTitleText,
              startTime: startT,
              endTime: endT,
            },
          ],
        });
      }

      const paragraphs = (articleSection.paragraphs as unknown[]) ?? [];
      for (const p of paragraphs) {
        const prow = p as Record<string, unknown>;
        const sents = (prow.paragraph_sentences as unknown[]) ?? [];
        const paragraphText = sents
          .map((s) => {
            const srow = s as Record<string, unknown>;
            return textFromMaybeTextNode(srow.text);
          })
          .join(" ")
          .trim();
        if (!paragraphText) continue;

        const paraTimed: EngooArticleTimedSentence[] = [];
        for (const s of sents) {
          const srow = s as Record<string, unknown>;
          const text = textFromMaybeTextNode(srow.text).trim();
          const sound = srow.sound as { duration?: string } | undefined;
          let durSec = parseIso8601DurationToSeconds(sound?.duration);
          if (durSec <= 0) {
            const wc = text.split(/\s+/).filter(Boolean).length;
            durSec = wc > 0 ? Math.max(0.45, wc * 0.32) : 0.25;
          }
          const startTime = articleTimeCursor;
          const endTime = articleTimeCursor + durSec;
          articleTimeCursor = endTime;
          paraTimed.push({
            index: articleSentenceSeq++,
            text,
            startTime,
            endTime,
          });
        }
        articleParagraphs.push(paragraphText);
        if (paraTimed.length) articleParagraphsTimed.push({ sentences: paraTimed });
      }
    }
  }

  const mapQuestionSection = (ex: Record<string, unknown> | undefined): string[] => {
    if (!ex?.sections) return [];
    const sections = ex.sections as Record<string, unknown>[];
    const qsec = sections.find((s) => s._type === "QuestionSection");
    const qs = (qsec?.questions as unknown[]) ?? [];
    return qs
      .map((q) => {
        const qrow = q as Record<string, unknown>;
        return textFromMaybeTextNode(qrow.text);
      })
      .filter(Boolean);
  };

  const questions = mapQuestionSection(questionsExercise);
  const discussion = mapQuestionSection(discussionExercise);
  const furtherDiscussion = mapQuestionSection(furtherExercise);

  const level =
    typeof data.content_level === "number" ? data.content_level : 6;
  const title =
    textFromMaybeTextNode(
      (data.title_text as Record<string, unknown>) ?? {},
    ) || "Lesson";
  const thumb =
    (data.image as { url?: string } | undefined)?.url ?? "";

  return {
    masterId,
    title,
    level,
    levelLabel: engooLevelLabelFromNumber(level),
    category: categoryLabel,
    thumbnailUrl: thumb,
    audio: articleAudio,
    vocabulary,
    article: articleParagraphs.join("\n\n"),
    articleParagraphs,
    articleParagraphsTimed,
    questions,
    discussion,
    furtherDiscussion,
  };
}
