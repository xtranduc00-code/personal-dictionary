export type EngooArticleTimedSentence = {
  /** Index across the whole article (ordered paragraphs, then sentences). */
  index: number;
  text: string;
  startTime: number;
  endTime: number;
};

export type EngooArticleTimedParagraph = {
  sentences: EngooArticleTimedSentence[];
  /** Spoken article title at start of combined audio (before body sentences). */
  isTitle?: boolean;
};

export type EngooVocabularyItem = {
  word: string;
  partOfSpeech: string;
  phonetic: string;
  definition: string;
  exampleSentence: string;
  imageUrl?: string | null;
  /** Per-word pronunciation audio from Engoo. */
  audioUrl?: string | null;
};

export type EngooArticlePayload = {
  masterId: string;
  title: string;
  level: number;
  levelLabel: string;
  category: string;
  thumbnailUrl: string;
  audio: string | null;
  vocabulary: EngooVocabularyItem[];
  /** Full article as double-newline-separated paragraphs (for instructions / legacy). */
  article: string;
  articleParagraphs: string[];
  /** Per-sentence timing from combined article audio; empty if unavailable. */
  articleParagraphsTimed: EngooArticleTimedParagraph[];
  questions: string[];
  discussion: string[];
  furtherDiscussion: string[];
  /** When set, replaces “Engoo Daily News article” in the realtime tutor preamble (e.g. Guardian reader). */
  readingTutorLessonDescription?: string;
};

export type EngooListCard = {
  masterId: string;
  headerId: string;
  title: string;
  thumbnailUrl: string;
  /** Null when API omits `content_level` (e.g. older headers); hide level badge in UI. */
  level: number | null;
  /** Empty when `level` is null. */
  levelLabel: string;
  category: string;
  featured: boolean;
  firstPublishedAt: string;
  isNew: boolean;
};

export type EngooListApiResponse = {
  items: EngooListCard[];
  /** Pass as `cursor` query param for the next page (`older_than` on Engoo). */
  nextCursor: string | null;
};
