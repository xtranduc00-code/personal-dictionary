"use client";

import { useEffect, useRef, useState } from "react";
import {
  getHistoryWordsFromStorage,
  getWordFromStorage,
  getWordEntryFromStorage,
  setSavedStatusByWord,
  upsertSearchedWord,
  getSavedWordsFromStorage,
} from "@/lib/library-storage";
import { DictionaryEntry, DictionarySense, WordRow } from "@/lib/types";
import { ArrowLeftRight, Copy, Languages, Mic, MicOff, Star, Volume2 } from "lucide-react";

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

function renderInlineOrFallback(items: string[]) {
  if (items.length === 0) {
    return <span className="text-zinc-500 dark:text-zinc-400">N/A</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

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

function speakTranslate(text: string, lang: "vi-VN" | "en-US") {
  if (typeof window === "undefined" || !text.trim() || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = lang;
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function SenseBlock({ sense }: { sense: DictionarySense }) {
  return (
    <div className="space-y-4 py-4 first:pt-0">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          {sense.level}
        </span>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {partOfSpeechLabel[sense.partOfSpeech] ?? sense.partOfSpeech}
        </span>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          IPA (US): {sense.ipaUs}
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Meaning
        </p>
        <p className="mt-2 text-lg leading-8 text-zinc-900 dark:text-zinc-100">
          {sense.meaning}
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Synonyms
        </p>
        <div className="mt-1">{renderInlineOrFallback(sense.synonyms)}</div>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Antonyms
        </p>
        <div className="mt-1">{renderInlineOrFallback(sense.antonyms)}</div>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Example
        </p>
        <ul className="mt-2 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100">
          {(sense.examples.length > 0 ? sense.examples : ["N/A"]).map((example) => (
            <li key={example} className="text-sm leading-relaxed">
              {example}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DictionaryEntry | null>(null);
  const [resultSaved, setResultSaved] = useState(false);
  const [historyWords, setHistoryWords] = useState<WordRow[]>([]);
  const [savedWords, setSavedWords] = useState<WordRow[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [translateInput, setTranslateInput] = useState("");
  const [translateResult, setTranslateResult] = useState("");
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [translateDirection, setTranslateDirection] = useState<"vi-en" | "en-vi">("en-vi");
  const [translateListening, setTranslateListening] = useState(false);
  const [translateCopyFeedback, setTranslateCopyFeedback] = useState(false);
  const [translateVoiceError, setTranslateVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const translateListeningRef = useRef(false);
  translateListeningRef.current = translateListening;
  const translateVoiceSessionRef = useRef("");
  const translateLastResultLengthRef = useRef(0);
  const translateInterimRef = useRef("");
  const [translateVoiceTick, setTranslateVoiceTick] = useState(0);

  async function refreshLists() {
    const [history, saved] = await Promise.all([
      getHistoryWordsFromStorage(),
      getSavedWordsFromStorage(),
    ]);
    setHistoryWords(history);
    setSavedWords(saved);
  }

  async function loadWordIntoResult(word: string) {
    const entry = await getWordEntryFromStorage(word);
    const row = await getWordFromStorage(word);
    if (!entry || !row) return;
    setResult(entry);
    setResultSaved(row.is_saved);
  }

  useEffect(() => {
    void refreshLists();
    const selectedWord = new URLSearchParams(window.location.search).get("word");
    if (!selectedWord) return;
    setQuery(selectedWord);
    void loadWordIntoResult(selectedWord);
    setError(null);
    setStatusMessage(`Loaded "${selectedWord}" from Library.`);
  }, []);

  useEffect(() => {
    const trimmed = translateInput.trim();
    if (!trimmed) {
      setTranslateResult("");
      setTranslateError(null);
      return;
    }
    const t = setTimeout(async () => {
      setTranslateLoading(true);
      setTranslateError(null);
      try {
        const [sourceLang, targetLang] =
          translateDirection === "vi-en"
            ? ["Vietnamese", "English"]
            : ["English", "Vietnamese"];
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, sourceLang, targetLang }),
        });
        const data = await res.json();
        if (!res.ok) {
          setTranslateError((data as { error?: string }).error ?? "Translation failed.");
          setTranslateResult("");
          return;
        }
        setTranslateResult((data as { translation: string }).translation ?? "");
      } catch {
        setTranslateError("Cannot translate right now.");
        setTranslateResult("");
      } finally {
        setTranslateLoading(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [translateInput, translateDirection]);

  const [translateInterim, setTranslateInterim] = useState("");

  useEffect(() => {
    translateInterimRef.current = translateInterim;
  }, [translateInterim]);

  useEffect(() => {
    if (!translateListening) return;
    setTranslateVoiceError(null);
    translateVoiceSessionRef.current = "";
    translateLastResultLengthRef.current = 0;
    setTranslateInterim("");
    translateInterimRef.current = "";
    const Win = typeof window !== "undefined" ? (window as Window & { SpeechRecognition?: new () => { start: () => void; stop: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: (e: unknown) => void; onend: () => void; onerror: (e: unknown) => void }; webkitSpeechRecognition?: new () => { start: () => void; stop: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: (e: unknown) => void; onend: () => void; onerror: (e: unknown) => void } }) : undefined;
    const SpeechRecognition = Win?.webkitSpeechRecognition ?? Win?.SpeechRecognition;
    if (!SpeechRecognition) {
      setTranslateVoiceError("Browser does not support voice input. Use Chrome or Edge.");
      setTranslateListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = translateDirection === "vi-en" ? "vi-VN" : "en-US";
    recognition.onresult = (e: unknown) => {
      try {
        const ev = e as { results: { length: number; [i: number]: { isFinal?: boolean; 0?: { transcript?: string }; item?: (j: number) => { transcript?: string } } } };
        const results = ev.results;
        if (!results?.length) return;
        let full = "";
        let interim = "";
        for (let i = 0; i < results.length; i++) {
          const item = results[i];
          const isFinal = !!item?.isFinal;
          const alt = (item as { 0?: { transcript?: string } })[0] ?? (item as { item?(j: number): { transcript?: string } })?.item?.(0);
          const t = (alt?.transcript ?? "").trim();
          if (!t) continue;
          if (isFinal) full += (full ? " " : "") + t;
          else interim = t;
        }
        const fromResults = full + (interim ? (full ? " " : "") + interim : "");
        if (results.length < translateLastResultLengthRef.current && fromResults) {
          translateVoiceSessionRef.current += (translateVoiceSessionRef.current ? " " : "") + fromResults;
        } else if (fromResults) {
          translateVoiceSessionRef.current = full + (interim ? " " + interim : "");
        }
        translateLastResultLengthRef.current = results.length;
        setTranslateInterim(interim);
        setTranslateVoiceTick((n) => n + 1);
      } catch (_) {
        /* ignore */
      }
    };
    recognition.onend = () => {
      if (translateListeningRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          setTranslateListening(false);
        }
      } else {
        const rest = (translateVoiceSessionRef.current + (translateInterimRef.current ? " " + translateInterimRef.current : "")).trim();
        if (rest) {
          setTranslateInput((prev) => (prev ? `${prev} ${rest}` : rest));
        }
        translateVoiceSessionRef.current = "";
        translateLastResultLengthRef.current = 0;
        setTranslateInterim("");
        translateInterimRef.current = "";
      }
    };
    recognition.onerror = (e: unknown) => {
      const err = e as { error?: string };
      const code = err?.error ?? "unknown";
      if (code === "no-speech" || code === "aborted") return;
      if (code === "not-allowed") setTranslateVoiceError("Microphone permission required.");
      else if (code === "network") setTranslateVoiceError("Network error. Try again.");
      else setTranslateVoiceError("Voice input error. Try Chrome or Edge.");
      setTranslateListening(false);
    };
    recognitionRef.current = recognition;
    const startRecognition = async () => {
      try {
        await navigator.mediaDevices?.getUserMedia?.({ audio: true });
      } catch {
        setTranslateVoiceError("Microphone permission required.");
        setTranslateListening(false);
        return;
      }
      try {
        recognition.start();
      } catch {
        setTranslateVoiceError("Could not start voice input.");
        setTranslateListening(false);
      }
    };
    void startRecognition();
    return () => {
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
  }, [translateListening, translateDirection]);

  function toggleTranslateVoice() {
    if (translateListening) {
      recognitionRef.current?.stop();
      setTranslateListening(false);
    } else {
      setTranslateError(null);
      setTranslateVoiceError(null);
      setTranslateListening(true);
    }
  }

  const translateDisplayValue =
    translateInput +
    (translateVoiceSessionRef.current ? " " + translateVoiceSessionRef.current : "") +
    (translateInterim ? " " + translateInterim : "");

  function copyTranslateResult() {
    if (!translateResult.trim()) return;
    void navigator.clipboard.writeText(translateResult).then(() => {
      setTranslateCopyFeedback(true);
      setTimeout(() => setTranslateCopyFeedback(false), 1500);
    });
  }

  function swapTranslateDirection() {
    setTranslateDirection((prev) => (prev === "vi-en" ? "en-vi" : "vi-en"));
    setTranslateInput(translateResult);
    setTranslateResult(translateInput);
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const word = query.trim();
    if (!word) return;

    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/define", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ word }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Search failed.");
        return;
      }

      const parsed = data as DictionaryEntry;
      if (!parsed.senses?.length) {
        setError("No definition returned.");
        return;
      }
      setResult(parsed);
      const upserted = await upsertSearchedWord(parsed);
      setResultSaved(upserted.is_saved);
      setStatusMessage(`Saved "${parsed.word}" to Library.`);
      await refreshLists();
      setQuery("");
    } catch {
      setError("Cannot load word definition right now.");
    } finally {
      setLoading(false);
    }
  }

  async function onToggleSave() {
    if (!result) return;
    const nextSaved = !resultSaved;
    const updated = await setSavedStatusByWord(result.word, nextSaved);
    if (!updated) return;

    setResultSaved(updated.is_saved);
    setStatusMessage(
      updated.is_saved
        ? `"${updated.word}" added to My Words.`
        : `"${updated.word}" removed from My Words.`,
    );
    await refreshLists();
  }

  function copyDefinition() {
    if (!result?.senses?.length) return;
    const lines: string[] = [result.word];
    result.senses.forEach((s) => {
      lines.push("");
      lines.push(`${partOfSpeechLabel[s.partOfSpeech] ?? s.partOfSpeech} (${s.level}) — ${s.ipaUs}`);
      lines.push(s.meaning);
      if (s.synonyms.length) lines.push(`Synonyms: ${s.synonyms.join(", ")}`);
      if (s.antonyms.length) lines.push(`Antonyms: ${s.antonyms.join(", ")}`);
      if (s.examples.length) lines.push(`Examples:\n${s.examples.map((e) => `- ${e}`).join("\n")}`);
    });
    navigator.clipboard.writeText(lines.join("\n"));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          KFC All-in-One
        </h1>

        <form onSubmit={onSearch} className="mt-5 flex gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type an English word..."
            className="h-12 flex-1 rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-700 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-600"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="h-12 min-w-[5.5rem] shrink-0 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "..." : "Search"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {statusMessage && (
          <p className="mt-3 text-sm text-emerald-700">{statusMessage}</p>
        )}
      </section>

      {result && result.senses.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {result.word}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => speakWord(result.word)}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Volume2 className="h-4 w-4" />
              Listen
            </button>
            <button
              type="button"
              onClick={copyDefinition}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Copy className="h-4 w-4" />
              {copyFeedback ? "Copied!" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onToggleSave}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Star className={`h-4 w-4 ${resultSaved ? "fill-current" : ""}`} />
              {resultSaved ? "Saved" : "Save"}
            </button>
          </div>
          <div className="my-5 h-px bg-zinc-200 dark:bg-zinc-800" />

          {result.senses.map((sense, idx) => (
            <div key={`${sense.partOfSpeech}-${idx}`}>
              <SenseBlock sense={sense} />
              {idx < result.senses.length - 1 && (
                <div className="my-4 h-px bg-zinc-200 dark:bg-zinc-800" />
              )}
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Languages className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Translate
          </h2>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Type Vietnamese or English — auto translate as you type (like Google Translate).
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {translateDirection === "vi-en" ? "Vietnamese → English" : "English → Vietnamese"}
          </span>
          <button
            type="button"
            onClick={swapTranslateDirection}
            title="Swap translation direction"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-start">
          <div className="flex min-h-0 flex-col">
            <label className="shrink-0 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {translateDirection === "vi-en" ? "Vietnamese" : "English"}
            </label>
            <textarea
              value={translateListening ? translateDisplayValue : translateInput}
              onChange={(e) => {
                const v = e.target.value;
                setTranslateInput(v);
                if (translateListening) {
                  translateVoiceSessionRef.current = "";
                  setTranslateInterim("");
                }
              }}
              placeholder={
                translateDirection === "vi-en"
                  ? "Type Vietnamese text..."
                  : "Type English text..."
              }
              rows={5}
              className="mt-1.5 min-h-[10rem] w-full resize-y rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-700 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTranslateVoice}
                title={translateListening ? "Stop recording" : "Voice input"}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
                  translateListening
                    ? "border-red-500 bg-red-500 text-white shadow-lg shadow-red-500/30 dark:border-red-500 dark:bg-red-500 dark:text-white"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                <Mic className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  speakTranslate(
                    translateInput,
                    translateDirection === "vi-en" ? "vi-VN" : "en-US",
                  )
                }
                disabled={!translateInput.trim()}
                title="Listen"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              {translateVoiceError && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {translateVoiceError}
                </span>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <label className="shrink-0 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {translateDirection === "vi-en" ? "English" : "Vietnamese"}
            </label>
            <div className="mt-1.5 min-h-[10rem] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100">
              {translateLoading && !translateResult && (
                <span className="text-zinc-500 dark:text-zinc-400">Translating...</span>
              )}
              {translateError && (
                <span className="text-sm text-red-600 dark:text-red-400">{translateError}</span>
              )}
              {!translateLoading && translateResult && (
                <p className="whitespace-pre-wrap text-base">{translateResult}</p>
              )}
              {!translateLoading && !translateResult && !translateError && translateInput.trim() && (
                <span className="text-zinc-500 dark:text-zinc-400">Waiting...</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  speakTranslate(
                    translateResult,
                    translateDirection === "vi-en" ? "en-US" : "vi-VN",
                  )
                }
                disabled={!translateResult.trim()}
                title="Listen to translation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={copyTranslateResult}
                disabled={!translateResult.trim()}
                title="Copy translation"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <Copy className="h-4 w-4 shrink-0" />
                <span className="text-sm">
                  {translateCopyFeedback ? "Copied!" : "Copy"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          History
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {historyWords.length === 0 && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              No history yet.
            </span>
          )}
          {historyWords.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setQuery(item.word);
                void loadWordIntoResult(item.word);
                setStatusMessage(`Loaded "${item.word}" from History.`);
              }}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {item.word}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          My Words
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {savedWords.length === 0 && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              No saved words yet.
            </span>
          )}
          {savedWords.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setQuery(item.word);
                void loadWordIntoResult(item.word);
                setStatusMessage(`Loaded "${item.word}" from My Words.`);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              {item.word}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
