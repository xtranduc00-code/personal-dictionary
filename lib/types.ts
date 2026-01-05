export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type PartOfSpeech =
  | "n"
  | "v"
  | "adj"
  | "adv"
  | "prep"
  | "pron"
  | "conj"
  | "det"
  | "interj"
  | "phrase"
  | "other";

/** One sense = one part of speech (e.g. "play" as verb, "play" as noun). */
export type DictionarySense = {
  partOfSpeech: PartOfSpeech;
  level: CEFRLevel;
  ipaUs: string;
  meaning: string;
  synonyms: string[];
  antonyms: string[];
  examples: string[];
};

/** API/search result: one word, one or more senses. */
export type DictionaryEntry = {
  word: string;
  /** When multiple parts of speech (e.g. play v + n), use senses; otherwise single sense. */
  senses: DictionarySense[];
};

export type WordRow = {
  id: string;
  word: string;
  normalized_word: string;
  ipa_us?: string;
  is_saved: boolean;
  part_of_speech: PartOfSpeech;
  level: CEFRLevel;
  meaning: string;
  synonyms: string[];
  antonyms: string[];
  examples: string[];
  note?: string | null;
  tags?: string[];
  /** Multiple parts of speech for the same word (e.g. play v, play n). */
  senses?: DictionarySense[];
  created_at: string;
  updated_at: string;
};
