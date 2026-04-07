"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MessageCircle, Volume2 } from "lucide-react";
import {
  AddFlashcardModal,
  HighlightableSegment,
  HighlightsContext,
  HighlightToolbar,
  getSelectionHighlightInfo,
  useHighlights,
  type Highlight,
} from "@/components/ielts";
import { useI18n } from "@/components/i18n-provider";
import { Tooltip } from "@/components/ui/Tooltip";
import { EngooInstructionBanner } from "@/components/engoo/engoo-ui-tokens";
import { EngooReadingTutorPanel } from "@/components/engoo/engoo-reading-tutor-panel";
import { storeEngooCallContext } from "@/lib/engoo-call-context";
import type { EngooArticlePayload } from "@/lib/engoo-types";
import {
  formatEngooPhoneticForDisplay,
  parseEngooUnderscoreItalic,
  stripEngooPrnPlaceholders,
} from "@/lib/engoo-format-text";

function EngooHighlightPlain({
  id,
  raw,
  className = "",
  as,
}: {
  id: string;
  raw: string;
  className?: string;
  as?: "span" | "strong";
}) {
  const { plain, italicRanges } = parseEngooUnderscoreItalic(raw);
  return (
    <HighlightableSegment
      id={id}
      as={as}
      className={className}
      italicRanges={italicRanges.length ? italicRanges : undefined}
    >
      {plain}
    </HighlightableSegment>
  );
}
function speakEnglish(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

let lastEngooVocabAudio: HTMLAudioElement | null = null;

function playEngooAssetAudio(url: string) {
  if (typeof window === "undefined" || !url) return;
  try {
    lastEngooVocabAudio?.pause();
    const a = new Audio(url);
    lastEngooVocabAudio = a;
    a.addEventListener("ended", () => {
      if (lastEngooVocabAudio === a) lastEngooVocabAudio = null;
    });
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

function boldHeadwordNodes(text: string, headword: string): ReactNode {
  const w = headword.trim();
  if (!w || !text) return text;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = /\s/.test(w)
    ? new RegExp(`(${escaped})`, "gi")
    : new RegExp(`\\b(${escaped})\\b`, "gi");
  const bits = text.split(re);
  if (bits.length === 1) return text;
  return bits.map((bit, i) =>
    bit !== "" && bit.toLowerCase() === w.toLowerCase() ? (
      <strong key={i} className="font-bold text-inherit">
        {bit}
      </strong>
    ) : (
      <Fragment key={i}>{bit}</Fragment>
    ),
  );
}

function VocabExampleSegment({
  id,
  sentence,
  headword,
  className = "",
}: {
  id: string;
  sentence: string;
  headword: string;
  className?: string;
}) {
  const { t } = useI18n();
  const { highlights, removeHighlight } = useHighlights();
  const segmentHighlights = useMemo(
    () =>
      highlights
        .filter((h) => h.segmentId === id)
        .sort((a, b) => a.start - b.start),
    [highlights, id],
  );

  if (!segmentHighlights.length) {
    return (
      <span data-segment-id={id} className={className}>
        {boldHeadwordNodes(sentence, headword)}
      </span>
    );
  }

  const parts: ReactNode[] = [];
  let pos = 0;
  for (const h of segmentHighlights) {
    const start = Math.max(pos, h.start);
    const end = h.end;
    if (start < end) {
      if (start > pos) {
        parts.push(
          <Fragment key={`pre-${h.id}-${start}`}>
            {boldHeadwordNodes(sentence.slice(pos, start), headword)}
          </Fragment>,
        );
      }
      parts.push(
        <Tooltip key={h.id} content={t("clickToRemoveHighlight")}>
          <mark
            className="cursor-pointer rounded bg-amber-200/90 px-0.5 text-inherit transition hover:bg-amber-300/90 dark:bg-amber-500/30 dark:hover:bg-amber-500/40"
            onClick={(e) => {
              e.preventDefault();
              removeHighlight(h.id);
            }}
          >
            {boldHeadwordNodes(sentence.slice(start, end), headword)}
          </mark>
        </Tooltip>,
      );
      pos = end;
    }
  }
  if (pos < sentence.length) {
    parts.push(
      <Fragment key={`tail-${pos}`}>
        {boldHeadwordNodes(sentence.slice(pos), headword)}
      </Fragment>,
    );
  }
  return (
    <span data-segment-id={id} className={className}>
      {parts}
    </span>
  );
}

type ToolbarState = {
  x: number;
  y: number;
  segmentId: string;
  start: number;
  end: number;
  highlightId?: string;
  selectedText: string;
};

/** Tight vertical rhythm between exercises (reading flow, not landing sections). */
const EXERCISE_SECTION_GAP =
  "mb-10 scroll-mt-6 border-t border-zinc-100/90 pt-6 first:border-t-0 first:pt-0 dark:border-zinc-800/70";

/** Right padding so flow text never sits under the absolute vocab thumbnail (offset + size + ring + gap). */
const VOCAB_THUMB_GUTTER_CLASS = "pr-[5.25rem] sm:pr-[6rem]";

function ExerciseHeading({
  exerciseNum,
  title,
  subtitle,
}: {
  exerciseNum: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700/85 dark:text-emerald-400/90">
        Exercise {exerciseNum}
      </p>
      <h2 className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[2rem]">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

function SoftQuestionList({
  items,
  exerciseNum,
  idPrefix,
}: {
  items: string[];
  exerciseNum: number;
  idPrefix?: string;
}) {
  const pref = idPrefix ?? `ex-${exerciseNum}`;
  if (!items.length) return null;
  return (
    <ul className="mt-3 list-none space-y-2 p-0">
      {items.map((q, i) => (
        <li
          key={`${pref}-${i}`}
          className="rounded-2xl bg-white px-5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-zinc-900/[0.05] transition hover:ring-emerald-500/15 dark:bg-zinc-900/40 dark:ring-white/[0.06] dark:hover:ring-emerald-500/20 sm:px-6 sm:py-4"
        >
          <div className="flex gap-3 sm:gap-5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold tabular-nums text-emerald-900 shadow-sm dark:bg-emerald-950/70 dark:text-emerald-200"
              aria-hidden
            >
              {i + 1}
            </span>
            <p className="min-w-0 flex-1 pt-0.5 text-[16px] font-normal leading-7 text-zinc-700 dark:text-zinc-300">
              <EngooHighlightPlain
                id={`${pref}-${i}`}
                raw={q}
                className="leading-7"
              />
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DiscussionSpeakingSection({
  discussion,
  further,
}: {
  discussion: string[];
  further: string[];
}) {
  const [tab, setTab] = useState<"main" | "further">("main");
  const hasD = discussion.length > 0;
  const hasF = further.length > 0;
  if (!hasD && !hasF) return null;

  if (hasD && !hasF) {
    return (
      <section className={EXERCISE_SECTION_GAP}>
        <ExerciseHeading exerciseNum={4} title="Discussion" />
        <SoftQuestionList items={discussion} exerciseNum={4} idPrefix="disc" />
      </section>
    );
  }

  if (!hasD && hasF) {
    return (
      <section className={EXERCISE_SECTION_GAP}>
        <ExerciseHeading
          exerciseNum={4}
          title="Further discussion"
          subtitle="Go deeper with follow-up prompts."
        />
        <SoftQuestionList items={further} exerciseNum={5} idPrefix="further" />
      </section>
    );
  }

  return (
    <section className={EXERCISE_SECTION_GAP}>
      <ExerciseHeading exerciseNum={4} title="Discussion" />
      <div
        className="mt-3 flex gap-1 rounded-2xl bg-zinc-100/90 p-1.5 dark:bg-zinc-800/80"
        role="tablist"
        aria-label="Discussion sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "main"}
          onClick={() => setTab("main")}
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            tab === "main"
              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-white/10"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <MessageCircle className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          Discussion
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "further"}
          onClick={() => setTab("further")}
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            tab === "further"
              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-white/10"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          Further discussion
        </button>
      </div>
      <SoftQuestionList
        items={tab === "main" ? discussion : further}
        exerciseNum={4}
        idPrefix={tab === "main" ? "disc" : "further"}
      />
    </section>
  );
}

function dedupeVocabulary(items: EngooArticlePayload["vocabulary"]) {
  const seen = new Set<string>();
  const out: EngooArticlePayload["vocabulary"] = [];
  for (const v of items) {
    const k = v.word.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function EngooLessonBody({
  data,
  paragraphs,
}: {
  data: EngooArticlePayload;
  paragraphs: string[];
}) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);
  const [flashcardInitialWord, setFlashcardInitialWord] = useState("");
  const selectableRootRef = useRef<HTMLDivElement>(null);

  const addHighlight = useCallback(
    (segmentId: string, start: number, end: number) => {
      if (start >= end) return;
      setHighlights((prev) => [
        ...prev,
        { id: crypto.randomUUID(), segmentId, start, end },
      ]);
    },
    [],
  );

  const removeHighlight = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const highlightsValue = useMemo(
    () => ({ highlights, addHighlight, removeHighlight }),
    [highlights, addHighlight, removeHighlight],
  );

  const vocabRows = useMemo(
    () => dedupeVocabulary(data.vocabulary),
    [data.vocabulary],
  );

  const articleParagraphsTimed = data.articleParagraphsTimed ?? [];
  const useArticleKaraoke = Boolean(data.audio && articleParagraphsTimed.length);
  const articleTimedHasTitleBlock = useMemo(
    () => articleParagraphsTimed.some((b) => b.isTitle),
    [articleParagraphsTimed],
  );
  const flatArticleTimed = useMemo(
    () => articleParagraphsTimed.flatMap((b) => b.sentences),
    [articleParagraphsTimed],
  );

  const articleAudioRef = useRef<HTMLAudioElement>(null);
  const articleSentenceScrollRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const prevActiveArticleSentence = useRef(-1);
  const [activeArticleSentence, setActiveArticleSentence] = useState(-1);

  const onArticleAudioTimeUpdate = useCallback(() => {
    const el = articleAudioRef.current;
    if (!el || !flatArticleTimed.length) return;
    const t = el.currentTime;
    let found = -1;
    for (let i = 0; i < flatArticleTimed.length; i++) {
      const s = flatArticleTimed[i];
      const endPad = i === flatArticleTimed.length - 1 ? 0.08 : 0;
      if (t >= s.startTime && t < s.endTime + endPad) {
        found = s.index;
        break;
      }
    }
    setActiveArticleSentence(found);
  }, [flatArticleTimed]);

  useEffect(() => {
    prevActiveArticleSentence.current = -1;
    articleSentenceScrollRefs.current = [];
    setActiveArticleSentence(-1);
  }, [data.masterId]);

  useEffect(() => {
    if (!useArticleKaraoke) return;
    if (activeArticleSentence < 0) return;
    if (activeArticleSentence === prevActiveArticleSentence.current) return;
    prevActiveArticleSentence.current = activeArticleSentence;
    const wrap = articleSentenceScrollRefs.current[activeArticleSentence];
    wrap?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeArticleSentence, useArticleKaraoke]);

  const getSelectionSegmentInfo = useCallback(() => {
    return getSelectionHighlightInfo(window.getSelection(), highlights);
  }, [highlights]);

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setToolbar(null);
        return;
      }
      const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const root = selectableRootRef.current;
      if (
        !root ||
        !range ||
        (!root.contains(range.startContainer) &&
          !root.contains(range.endContainer))
      ) {
        setToolbar(null);
        return;
      }
      const info = getSelectionSegmentInfo();
      if (!info) {
        setToolbar(null);
        return;
      }
      setToolbar({
        x: info.x,
        y: info.y,
        segmentId: info.segmentId,
        start: info.start,
        end: info.end,
        highlightId: info.highlightId,
        selectedText: sel.toString(),
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [getSelectionSegmentInfo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolbar(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleHighlightClick = useCallback(() => {
    if (!toolbar) return;
    addHighlight(toolbar.segmentId, toolbar.start, toolbar.end);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }, [toolbar, addHighlight]);

  const handleUnhighlightClick = useCallback(() => {
    if (!toolbar?.highlightId) return;
    removeHighlight(toolbar.highlightId);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }, [toolbar, removeHighlight]);

  const handleFlashcardClick = useCallback((word: string) => {
    setFlashcardInitialWord(word);
    setShowFlashcardModal(true);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }, []);

  return (
    <>
      <HighlightsContext.Provider value={highlightsValue}>
        <div ref={selectableRootRef}>
          <section className={EXERCISE_SECTION_GAP}>
            <ExerciseHeading exerciseNum={1} title="Vocabulary" />

            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              {vocabRows.map((v, idx) => {
                const wordPlain = stripEngooPrnPlaceholders(v.word);
                const defPlain = stripEngooPrnPlaceholders(v.definition);
                const exPlain = stripEngooPrnPlaceholders(v.exampleSentence);
                const phoneDisplay = formatEngooPhoneticForDisplay(v.phonetic);
                return (
                  <div
                    key={`${v.word}-${idx}`}
                    className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] ring-1 ring-zinc-900/[0.04] transition hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.1)] hover:ring-emerald-500/12 dark:bg-zinc-900/35 dark:ring-white/[0.06] dark:hover:ring-emerald-500/20 sm:p-6"
                  >
                    {v.imageUrl ? (
                      <div className="absolute right-5 top-5 z-[1] h-14 w-14 overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:ring-white/10 sm:right-6 sm:top-6 sm:h-16 sm:w-16">
                        <Image
                          src={v.imageUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                          unoptimized
                        />
                      </div>
                    ) : null}
                    <div
                      className={v.imageUrl ? VOCAB_THUMB_GUTTER_CLASS : ""}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <HighlightableSegment
                          id={`vocab-head-${idx}`}
                          className="text-xl font-extrabold tracking-tight text-zinc-600 dark:text-zinc-400"
                        >
                          {wordPlain}
                        </HighlightableSegment>
                        <button
                          type="button"
                          aria-label={`Play pronunciation of ${wordPlain}`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300"
                          onClick={() =>
                            v.audioUrl
                              ? playEngooAssetAudio(v.audioUrl)
                              : speakEnglish(wordPlain)
                          }
                        >
                          <Volume2 className="h-[18px] w-[18px]" strokeWidth={2} />
                        </button>
                        {phoneDisplay ? (
                          <HighlightableSegment
                            id={`vocab-phone-${idx}`}
                            as="span"
                            className="text-[15px] font-bold tabular-nums text-amber-600 dark:text-amber-400"
                          >
                            {phoneDisplay}
                          </HighlightableSegment>
                        ) : null}
                        <span className="inline-flex shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold capitalize tracking-wide text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                          {v.partOfSpeech}
                        </span>
                      </div>
                      <div className="mt-2 space-y-2">
                        <p className="text-[15px] leading-6 text-zinc-700 dark:text-zinc-300">
                          <HighlightableSegment
                            id={`vocab-def-${idx}`}
                            as="span"
                            className="font-normal"
                          >
                            {defPlain}
                          </HighlightableSegment>
                        </p>
                        <p className="flex flex-wrap items-center gap-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
                          <VocabExampleSegment
                            id={`vocab-ex-${idx}`}
                            sentence={exPlain}
                            headword={wordPlain}
                            className="italic"
                          />
                          <button
                            type="button"
                            aria-label="Speak example sentence"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                            onClick={() => speakEnglish(exPlain)}
                          >
                            <Volume2 className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={EXERCISE_SECTION_GAP}>
            <ExerciseHeading exerciseNum={2} title="Article" />
            {data.audio ? (
              <div className="mt-2 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50/90 via-zinc-50/40 to-white p-4 shadow-[0_2px_12px_-4px_rgba(16,185,129,0.15)] ring-1 ring-emerald-900/10 dark:from-emerald-950/30 dark:via-zinc-900 dark:to-zinc-900 dark:ring-emerald-800/25 sm:p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 text-emerald-700 shadow-sm ring-1 ring-emerald-900/10 dark:bg-zinc-800 dark:text-emerald-300 dark:ring-white/10">
                    <Volume2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-800/90 dark:text-emerald-300/90">
                      Listen
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Full article audio
                    </p>
                  </div>
                </div>
                <audio
                  ref={articleAudioRef}
                  controls
                  className="h-11 w-full accent-emerald-600 dark:accent-emerald-500"
                  src={data.audio}
                  onTimeUpdate={onArticleAudioTimeUpdate}
                  onSeeking={onArticleAudioTimeUpdate}
                  onPlay={onArticleAudioTimeUpdate}
                  onEnded={() => {
                    setActiveArticleSentence(-1);
                    prevActiveArticleSentence.current = -1;
                  }}
                >
                  <track kind="captions" />
                </audio>
              </div>
            ) : null}
            <div className="mt-4 w-full min-w-0 overflow-hidden rounded-2xl bg-white px-4 py-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] ring-1 ring-zinc-900/[0.04] dark:bg-zinc-900/30 dark:ring-white/[0.06] sm:px-6 sm:py-6">
              <article className="w-full min-w-0 space-y-5">
                {useArticleKaraoke
                  ? (
                      <>
                        {!articleTimedHasTitleBlock ? (
                          <h3 className="text-[1.65rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                            <EngooHighlightPlain
                              id="article-title"
                              raw={data.title}
                            />
                          </h3>
                        ) : null}
                        {articleParagraphsTimed.map((block, pi) => {
                          if (block.isTitle) {
                            const first = block.sentences[0];
                            return (
                              <h3
                                key={`title-${pi}`}
                                ref={(el) => {
                                  if (first)
                                    articleSentenceScrollRefs.current[
                                      first.index
                                    ] = el;
                                }}
                                className="text-[1.65rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl"
                              >
                                {block.sentences.map((s, si) => (
                                  <Fragment key={s.index}>
                                    {si > 0 ? " " : null}
                                    {s.text ? (
                                      <span className="inline">
                                        <EngooHighlightPlain
                                          id={`article-s-${s.index}`}
                                          raw={s.text}
                                          className={`inline rounded-[3px] px-0.5 transition-colors duration-200 ${
                                            activeArticleSentence === s.index
                                              ? "bg-[#fff9c4] font-medium text-black dark:bg-amber-200/50 dark:text-zinc-950"
                                              : ""
                                          }`}
                                        />
                                      </span>
                                    ) : null}
                                  </Fragment>
                                ))}
                              </h3>
                            );
                          }
                          return (
                            <div
                              key={pi}
                              className="text-[17px] font-normal leading-7 text-zinc-700 dark:text-zinc-300"
                            >
                              {block.sentences.map((s, si) => (
                                <Fragment key={s.index}>
                                  {si > 0 ? " " : null}
                                  {s.text ? (
                                    <span
                                      ref={(el) => {
                                        articleSentenceScrollRefs.current[
                                          s.index
                                        ] = el;
                                      }}
                                      className="inline"
                                    >
                                      <EngooHighlightPlain
                                        id={`article-s-${s.index}`}
                                        raw={s.text}
                                        className={`inline rounded-[3px] px-0.5 transition-colors duration-200 ${
                                          activeArticleSentence === s.index
                                            ? "bg-[#fff9c4] font-medium text-black dark:bg-amber-200/50 dark:text-zinc-950"
                                            : ""
                                        }`}
                                      />
                                    </span>
                                  ) : null}
                                </Fragment>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    )
                  : (
                      <>
                        <h3 className="text-[1.65rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                          <EngooHighlightPlain id="article-title" raw={data.title} />
                        </h3>
                        {paragraphs.map((p, i) => (
                          <EngooHighlightPlain
                            key={i}
                            id={`article-p-${i}`}
                            raw={p}
                            className="block text-[17px] font-normal leading-7 text-zinc-700 dark:text-zinc-300"
                          />
                        ))}
                      </>
                    )}
              </article>
            </div>
          </section>

          <ExerciseListSection exerciseNum={3} title="Questions" items={data.questions} />
          <DiscussionSpeakingSection
            discussion={data.discussion}
            further={data.furtherDiscussion}
          />
        </div>
      </HighlightsContext.Provider>

      {toolbar ? (
        <HighlightToolbar
          x={toolbar.x}
          y={toolbar.y}
          hasHighlightId={Boolean(toolbar.highlightId)}
          selectedText={toolbar.selectedText}
          onHighlight={handleHighlightClick}
          onUnhighlight={handleUnhighlightClick}
          onFlashcard={handleFlashcardClick}
        />
      ) : null}

      {showFlashcardModal ? (
        <AddFlashcardModal
          initialWord={flashcardInitialWord}
          onClose={() => setShowFlashcardModal(false)}
        />
      ) : null}
    </>
  );
}

export function EngooLessonClient({ masterId }: { masterId: string }) {
  const [data, setData] = useState<EngooArticlePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tutorOpen, setTutorOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/engoo/lesson?masterId=${encodeURIComponent(masterId)}`,
      );
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setError(j.error ?? "Could not load lesson.");
        setData(null);
        return;
      }
      const payload = (await res.json()) as EngooArticlePayload;
      setData(payload);
      storeEngooCallContext(masterId, payload);
    } catch {
      setError("Network error.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [masterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReadingTutor = useCallback(() => {
    if (data) storeEngooCallContext(masterId, data);
    setTutorOpen(true);
  }, [data, masterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500 dark:text-zinc-400">
        Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">
          {error ?? "Not found."}
        </p>
        <Link href="/news" className="mt-4 inline-block text-sm underline">
          Back to Daily News
        </Link>
      </div>
    );
  }

  const paragraphs =
    data.articleParagraphs.length > 0
      ? data.articleParagraphs
      : data.article
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean);

  return (
    <div
      className={`relative w-full bg-zinc-100/90 font-sans text-[#111827] transition-[padding] duration-200 dark:bg-zinc-950 dark:text-zinc-100 ${
        tutorOpen
          ? "pb-[58vh] md:pb-6 md:pr-[440px]"
          : "pb-20"
      }`}
    >
      <header className="mx-auto mb-3 max-w-6xl overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex items-center px-5 py-3">
          <Link
            href="/news"
            className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            ← Daily News
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-1 sm:px-0">
        <div className="rounded-3xl border border-zinc-200/70 bg-white px-3 py-6 shadow-[0_4px_32px_-8px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-900/85 sm:px-5 sm:py-8">
          <EngooLessonBody data={data} paragraphs={paragraphs} />
        </div>
      </main>

      {!tutorOpen ? (
        <button
          type="button"
          onClick={openReadingTutor}
          className="fixed bottom-6 right-5 z-[80] flex items-center gap-2 rounded-full bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] md:bottom-8 md:right-8"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </span>
          Start Call
        </button>
      ) : null}

      <EngooReadingTutorPanel
        open={tutorOpen}
        onClose={() => setTutorOpen(false)}
        masterId={masterId}
        payload={data}
      />
    </div>
  );
}

function ExerciseListSection({
  exerciseNum,
  title,
  instruction,
  items,
}: {
  exerciseNum: number;
  title: string;
  instruction?: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <section className={EXERCISE_SECTION_GAP}>
      <ExerciseHeading exerciseNum={exerciseNum} title={title} />
      {instruction ? (
        <div className="mt-3">
          <EngooInstructionBanner className="rounded-2xl border-0 ring-1 ring-emerald-900/10">
            {instruction}
          </EngooInstructionBanner>
        </div>
      ) : null}
      <SoftQuestionList items={items} exerciseNum={exerciseNum} />
    </section>
  );
}
