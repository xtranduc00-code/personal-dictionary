"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteWordFromStorage,
  getSavedWordsFromStorage,
  getSensesFromRow,
  setSavedStatusById,
  updateTagsById,
} from "@/lib/library-storage";
import { WordRow } from "@/lib/types";
import { Star, Volume2, X } from "lucide-react";

const partOfSpeechLabel: Record<string, string> = {
  n: "Noun",
  v: "Verb",
  adj: "Adjective",
  adv: "Adverb",
  prep: "Preposition",
  pron: "Pronoun",
  conj: "Conjunction",
  det: "Determiner",
  interj: "Interjection",
  phrase: "Phrase",
  other: "Other",
};

function speakWord(word: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export default function LibraryPage() {
  const [savedWords, setSavedWords] = useState<WordRow[]>([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<
    "all" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
  >("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [addingTagId, setAddingTagId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");

  async function refreshWords() {
    const saved = await getSavedWordsFromStorage();
    setSavedWords(saved);
  }

  useEffect(() => {
    void refreshWords();
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    savedWords.forEach((w) => (w.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [savedWords]);

  const filteredWords = useMemo(() => {
    return savedWords.filter((word) => {
      const bySearch =
        !search ||
        word.word.toLowerCase().includes(search.toLowerCase()) ||
        word.meaning.toLowerCase().includes(search.toLowerCase()) ||
        (word.senses ?? []).some((s) => s.meaning.toLowerCase().includes(search.toLowerCase()));
      const byLevel = levelFilter === "all" || word.level === levelFilter;
      const byTag =
        !tagFilter || (word.tags ?? []).some((t) => t.toLowerCase() === tagFilter.toLowerCase());
      return bySearch && byLevel && byTag;
    });
  }, [savedWords, search, levelFilter, tagFilter]);

  async function onDelete(id: string) {
    await deleteWordFromStorage(id);
    await refreshWords();
  }

  async function onToggleSave(word: WordRow) {
    await setSavedStatusById(word.id, !word.is_saved);
    await refreshWords();
  }

  async function onAddTag(id: string, tag: string) {
    const word = filteredWords.find((w) => w.id === id);
    if (!word || !tag.trim()) return;
    const next = [...(word.tags ?? []), tag.trim()];
    await updateTagsById(id, next);
    setNewTagInput("");
    setAddingTagId(null);
    await refreshWords();
  }

  async function onRemoveTag(id: string, tag: string) {
    const word = filteredWords.find((w) => w.id === id);
    if (!word) return;
    const next = (word.tags ?? []).filter((t) => t !== tag);
    await updateTagsById(id, next);
    await refreshWords();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Library
        </h1>
        <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
          Words you saved. View lookup history in the History section in the sidebar.
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          My Words ({savedWords.length})
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_140px_140px]">
          <input
            placeholder="Search in library..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-700"
          />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}
            className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-300 dark:focus:ring-zinc-700"
          >
            <option value="all">All levels</option>
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
            <option value="C2">C2</option>
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-300 dark:focus:ring-zinc-700"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-5 space-y-4">
        {filteredWords.length === 0 && (
          <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-base text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No words found.
          </p>
        )}
        {filteredWords.map((word) => {
          const senses = getSensesFromRow(word);
          return (
            <article
              key={word.id}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <Link
                    href={`/?word=${encodeURIComponent(word.word)}`}
                    className="inline-block text-2xl font-semibold tracking-tight text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                  >
                    {word.word}
                  </Link>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(word.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => onRemoveTag(word.id, tag)}
                          className="rounded-full p-0.5 hover:bg-emerald-200 dark:hover:bg-emerald-800"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {addingTagId === word.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onAddTag(word.id, newTagInput);
                            if (e.key === "Escape") setAddingTagId(null);
                          }}
                          placeholder="Tag..."
                          className="w-24 rounded-full border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => onAddTag(word.id, newTagInput)}
                          className="text-sm font-medium text-zinc-600 dark:text-zinc-400"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingTagId(null)}
                          className="text-sm text-zinc-500"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingTagId(word.id)}
                        className="rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500"
                      >
                        + Tag
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => speakWord(word.word)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Volume2 className="h-4 w-4" />
                    Listen
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleSave(word)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Star className={`h-4 w-4 ${word.is_saved ? "fill-current" : ""}`} />
                    {word.is_saved ? "Saved" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(word.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {senses.map((sense, idx) => (
                <div key={`${sense.partOfSpeech}-${idx}`} className="mt-4">
                  {idx > 0 && <div className="my-4 h-px bg-zinc-200 dark:bg-zinc-800" />}
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {sense.level}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {partOfSpeechLabel[sense.partOfSpeech] ?? sense.partOfSpeech}
                    </span>
                    {sense.ipaUs && sense.ipaUs !== "N/A" && (
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        IPA (US): {sense.ipaUs}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {sense.meaning}
                  </p>
                  {(sense.synonyms.length > 0 ||
                    sense.antonyms.length > 0 ||
                    sense.examples.length > 0) && (
                    <div className="mt-3 space-y-2">
                      {sense.synonyms.length > 0 && (
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            Synonyms:
                          </span>{" "}
                          {sense.synonyms.join(", ")}
                        </p>
                      )}
                      {sense.antonyms.length > 0 && (
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            Antonyms:
                          </span>{" "}
                          {sense.antonyms.join(", ")}
                        </p>
                      )}
                      {sense.examples.length > 0 && (
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                          <p className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            Examples
                          </p>
                          <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                            {sense.examples.map((ex) => (
                              <li key={ex}>{ex}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </article>
          );
        })}
        </div>
      </section>
    </div>
  );
}
