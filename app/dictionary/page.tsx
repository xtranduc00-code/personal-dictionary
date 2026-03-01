"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getHistoryWordsFromStorage, getWordFromStorage, getWordEntryFromStorage, setSavedStatusByWord, upsertSearchedWord, getSavedWordsFromStorage, } from "@/lib/library-storage";
import { DictionaryEntry, DictionarySense, WordRow } from "@/lib/types";
import { Copy, Languages, Star, Volume2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
const POS_KEYS: Record<string, TranslationKey> = {
    n: "posNoun",
    v: "posVerb",
    adj: "posAdj",
    adv: "posAdv",
    prep: "posPrep",
    pron: "posPron",
    conj: "posConj",
    det: "posDet",
    interj: "posInterj",
    phrase: "posPhrase",
    other: "posOther",
};
function renderInlineOrFallback(items: string[], naLabel: string) {
    if (items.length === 0) {
        return <span className="text-zinc-500 dark:text-zinc-400">{naLabel}</span>;
    }
    return (<div className="flex flex-wrap gap-2">
      {items.map((item) => (<span key={item} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {item}
        </span>))}
    </div>);
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
function SenseBlock({ sense, hideTags, t, posLabel, }: {
    sense: DictionarySense;
    hideTags?: boolean;
    t: (k: TranslationKey) => string;
    posLabel: (pos: string) => string;
}) {
    return (<div className="space-y-4 py-4 first:pt-0">
      {!hideTags && (<div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            {sense.level}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {posLabel(sense.partOfSpeech)}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            IPA (US): {sense.ipaUs}
          </span>
        </div>)}
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t("meaning")}
        </p>
        <p className="mt-2 text-lg leading-8 text-zinc-900 dark:text-zinc-100">
          {sense.meaning}
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t("collocations")}
        </p>
        <div className="mt-1">{renderInlineOrFallback(sense.collocations ?? [], t("na"))}</div>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t("phrasalVerbs")}
        </p>
        <div className="mt-1">{renderInlineOrFallback(sense.phrasalVerbs ?? [], t("na"))}</div>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t("synonyms")}
        </p>
        <div className="mt-1">{renderInlineOrFallback(sense.synonyms, t("na"))}</div>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t("antonyms")}
        </p>
        <div className="mt-1">{renderInlineOrFallback(sense.antonyms, t("na"))}</div>
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t("example")}
        </p>
        <ul className="mt-2 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100">
          {(sense.examples.length > 0 ? sense.examples : [t("na")]).map((example) => (<li key={example} className="text-sm leading-relaxed">
              {example}
            </li>))}
        </ul>
      </div>
    </div>);
}
export default function Home() {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<DictionaryEntry | null>(null);
    const [resultSaved, setResultSaved] = useState(false);
    const [historyWords, setHistoryWords] = useState<WordRow[]>([]);
    const [savedWords, setSavedWords] = useState<WordRow[]>([]);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState(false);
    const posLabel = (pos: string) => t(POS_KEYS[pos] ?? "posOther");
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
        if (!entry || !row)
            return;
        setResult(entry);
        setResultSaved(row.is_saved);
    }
    useEffect(() => {
        void refreshLists();
        const selectedWord = new URLSearchParams(window.location.search).get("word");
        if (!selectedWord)
            return;
        setQuery(selectedWord);
        void loadWordIntoResult(selectedWord);
        setError(null);
        setStatusMessage(t("loadedFromLibrary").replace("{word}", selectedWord));
    }, []);
    async function onSearch(e: React.FormEvent) {
        e.preventDefault();
        const word = query.trim();
        if (!word)
            return;
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
                setError((data as {
                    error?: string;
                }).error ?? t("searchFailed"));
                return;
            }
            const parsed = data as DictionaryEntry;
            if (!parsed.senses?.length) {
                setError(t("noDefinition"));
                return;
            }
            setResult(parsed);
            const upserted = await upsertSearchedWord(parsed);
            setResultSaved(upserted.is_saved);
            setStatusMessage(t("savedToLibrary").replace("{word}", parsed.word));
            await refreshLists();
            setQuery("");
        }
        catch {
            setError(t("cannotLoadDefinition"));
        }
        finally {
            setLoading(false);
        }
    }
    async function onToggleSave() {
        if (!result)
            return;
        const nextSaved = !resultSaved;
        const updated = await setSavedStatusByWord(result.word, nextSaved);
        if (!updated)
            return;
        setResultSaved(updated.is_saved);
        setStatusMessage(updated.is_saved
            ? t("addedToMyWords").replace("{word}", updated.word)
            : t("removedFromMyWords").replace("{word}", updated.word));
        await refreshLists();
    }
    function copyDefinition() {
        if (!result?.senses?.length)
            return;
        const lines: string[] = [result.word];
        result.senses.forEach((s) => {
            lines.push("");
            lines.push(`${posLabel(s.partOfSpeech)} (${s.level}) — ${s.ipaUs}`);
            lines.push(s.meaning);
            if (s.synonyms.length)
                lines.push(`${t("synonyms")}: ${s.synonyms.join(", ")}`);
            if (s.antonyms.length)
                lines.push(`${t("antonyms")}: ${s.antonyms.join(", ")}`);
            if (s.examples.length)
                lines.push(`${t("examples")}:\n${s.examples.map((e) => `- ${e}`).join("\n")}`);
        });
        navigator.clipboard.writeText(lines.join("\n"));
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
    }
    return (<div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {t("appTitle")}
        </h1>

        <form onSubmit={onSearch} className="mt-5 flex gap-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} className="h-12 flex-1 rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-700 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-600"/>
          <button type="submit" disabled={loading || !query.trim()} className="h-12 min-w-[5.5rem] shrink-0 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            {loading ? "..." : t("searchButton")}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {statusMessage && (<p className="mt-3 text-sm text-emerald-700">{statusMessage}</p>)}
      </section>

      {result && result.senses.length > 0 && (<section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {result.word}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              {result.senses[0].level}
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {posLabel(result.senses[0].partOfSpeech)}
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              IPA (US): {result.senses[0].ipaUs}
            </span>
          </div>
          {result.wordFamily && result.wordFamily.length > 0 && (<p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{t("wordFamily")}</span>{" "}
              {result.wordFamily.join(" • ")}
            </p>)}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => speakWord(result.word)} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
              <Volume2 className="h-4 w-4"/>
              {t("listenButton")}
            </button>
            <button type="button" onClick={copyDefinition} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
              <Copy className="h-4 w-4"/>
              {copyFeedback ? t("copied") : t("copyButton")}
            </button>
            <button type="button" onClick={onToggleSave} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
              <Star className={`h-4 w-4 ${resultSaved ? "fill-current" : ""}`}/>
              {resultSaved ? t("saved") : t("saveButton")}
            </button>
          </div>
          <div className="my-5 h-px bg-zinc-200 dark:bg-zinc-800"/>

          {result.senses.map((sense, idx) => (<div key={`${sense.partOfSpeech}-${idx}`}>
              <SenseBlock sense={sense} hideTags={idx === 0} t={t} posLabel={posLabel}/>
              {idx < result.senses.length - 1 && (<div className="my-4 h-px bg-zinc-200 dark:bg-zinc-800"/>)}
            </div>))}

        </section>)}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/translate" className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 transition hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/80 dark:hover:border-zinc-600 dark:hover:bg-zinc-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-200/80 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-600">
              <Languages className="h-5 w-5"/>
            </span>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{t("translate")}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {t("translatePanelDesc")}
              </p>
            </div>
          </div>
          <span className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">→</span>
        </Link>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {t("history")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {historyWords.length === 0 && (<span className="text-sm text-zinc-500 dark:text-zinc-400">
              {t("noHistoryYet")}
            </span>)}
          {historyWords.map((item) => (<button key={item.id} type="button" onClick={() => {
                setQuery(item.word);
                void loadWordIntoResult(item.word);
                setStatusMessage(t("loadedFromHistory").replace("{word}", item.word));
            }} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
              {item.word}
            </button>))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {t("myWords")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {savedWords.length === 0 && (<span className="text-sm text-zinc-500 dark:text-zinc-400">
              {t("noSavedWordsYet")}
            </span>)}
          {savedWords.map((item) => (<button key={item.id} type="button" onClick={() => {
                setQuery(item.word);
                void loadWordIntoResult(item.word);
                setStatusMessage(t("loadedFromMyWords").replace("{word}", item.word));
            }} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
              <Star className="h-3.5 w-3.5 fill-current"/>
              {item.word}
            </button>))}
        </div>
      </section>
    </div>);
}
