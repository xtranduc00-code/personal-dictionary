"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  LayoutGrid,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { getListeningAudioUrls, getListeningTest } from "@/lib/listening-data";
import {
  getPartContent,
  getChooseTwoBlocksForPart,
} from "@/lib/listening-part-content";
import {
  normalizeListeningAnswer,
  rawScoreToBand,
  saveListeningResultToHistory,
} from "@/lib/listening-utils";
import { TOTAL_PARTS } from "./constants";
import { getSelectionHighlightInfo, useFullscreen } from "@/components/ielts";
import {
  AudioPlayer,
  HighlightToolbar,
  HighlightsContext,
  Part1Content,
  TranscriptWithHighlights,
  type Highlight,
} from "./components";
const Part2Content = dynamic(
  () =>
    import("./components/Part2Content").then((m) => ({
      default: m.Part2Content,
    })),
  { ssr: false },
);
const Part3Content = dynamic(
  () =>
    import("./components/Part3Content").then((m) => ({
      default: m.Part3Content,
    })),
  { ssr: false },
);
const Part4Content = dynamic(
  () =>
    import("./components/Part4Content").then((m) => ({
      default: m.Part4Content,
    })),
  { ssr: false },
);
import { ScrollToAnswerContext } from "./components/ScrollToAnswerContext";
import { getListeningTranscriptHtml } from "@/lib/listening-transcripts";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { ExamTimer } from "@/components/exam-countdown";
import { Tooltip } from "@/components/ui/Tooltip";
const PART_LABEL_KEYS: Record<number, TranslationKey> = {
  1: "part1Label",
  2: "part2Label",
  3: "part3Label",
  4: "part4Label",
};
const AddFlashcardModal = dynamic(
  () => import("./components").then((m) => m.AddFlashcardModal),
  { ssr: false },
);
const ResultModal = dynamic(
  () => import("./components").then((m) => m.ResultModal),
  { ssr: false },
);
export default function ListeningTestPage() {
  const { t } = useI18n();
  const params = useParams<{
    setId: string;
    testId: string;
  }>();
  const data = useMemo(
    () => getListeningTest(params.setId, params.testId),
    [params.setId, params.testId],
  );
  const set = data?.set;
  const correctAnswers = data?.correctAnswers;
  const [currentPart, setCurrentPart] = useState(1);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [toolbar, setToolbar] = useState<{
    show: boolean;
    x: number;
    y: number;
    segmentId: string;
    start: number;
    end: number;
    highlightId?: string;
    selectedText: string;
    selectedTextWords?: string;
    inTranscript?: boolean;
  } | null>(null);
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);
  const [flashcardInitialWord, setFlashcardInitialWord] = useState("");
  const [showQuestionBoard, setShowQuestionBoard] = useState(false);
  const [pendingScrollToQuestion, setPendingScrollToQuestion] = useState<
    number | null
  >(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Index into getListeningAudioUrls (R2 first, then Engnovate fallbacks). */
  const [audioTryIndex, setAudioTryIndex] = useState(0);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [transcriptPct, setTranscriptPct] = useState(42);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const questionsPanelRef = useRef<HTMLDivElement | null>(null);
  const transcriptHtml = useMemo(
    () =>
      set && data
        ? getListeningTranscriptHtml(set.id, data.id, currentPart)
        : undefined,
    [set, data, currentPart],
  );
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
  const getSelectionSegmentInfo = useCallback(() => {
    return getSelectionHighlightInfo(window.getSelection(), highlights, {
      transcriptRoot: transcriptRef.current ?? undefined,
    });
  }, [highlights]);
  useEffect(() => {
    const onMouseUp = () => {
      if (submitted) {
        setToolbar(null);
        return;
      }
      if (!contentRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setToolbar(null);
        return;
      }
      const info = getSelectionSegmentInfo();
      const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const inContent =
        range &&
        (contentRef.current?.contains(range.startContainer) ||
          contentRef.current?.contains(range.endContainer));
      const inTranscript =
        range &&
        (transcriptRef.current?.contains(range.startContainer) ||
          transcriptRef.current?.contains(range.endContainer));
      if (!info || (!inContent && !inTranscript)) {
        setToolbar(null);
        return;
      }
      const segmentEl =
        contentRef.current?.querySelector<HTMLElement>(
          `[data-segment-id="${info.segmentId}"]`,
        ) ??
        transcriptRef.current?.querySelector<HTMLElement>(
          `[data-segment-id="${info.segmentId}"]`,
        );
      const selectedTextWords = segmentEl
        ? (segmentEl.textContent ?? "").slice(info.start, info.end).trim()
        : sel.toString();
      setToolbar({
        show: true,
        x: info.x,
        y: info.y,
        segmentId: info.segmentId,
        start: info.start,
        end: info.end,
        highlightId: info.highlightId,
        selectedText: sel.toString(),
        selectedTextWords: selectedTextWords || sel.toString(),
        inTranscript: !!inTranscript,
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [getSelectionSegmentInfo, submitted]);
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setTranscriptPct(Math.max(20, Math.min(75, pct)));
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
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
  const closeResultModal = useCallback(() => {
    setShowResultModal(false);
  }, []);
  const highlightsValue = useMemo(
    () => ({ highlights, addHighlight, removeHighlight }),
    [highlights, addHighlight, removeHighlight],
  );
  const audioUrls = useMemo(
    () => (data && set ? getListeningAudioUrls(set, data, currentPart) : []),
    [data, set, currentPart],
  );
  useEffect(() => {
    setAudioTryIndex(0);
  }, [audioUrls, currentPart]);
  const computeCorrectCount = useCallback(
    (ans: Record<number, string>) => {
      if (!correctAnswers) return 0;
      return Object.keys(correctAnswers)
        .map(Number)
        .filter((qNum) => {
          const userAnswer = normalizeListeningAnswer(ans[qNum] ?? "");
          const expected = correctAnswers[qNum];
          if (Array.isArray(expected)) {
            return expected.some(
              (item) => normalizeListeningAnswer(String(item)) === userAnswer,
            );
          }
          return normalizeListeningAnswer(String(expected)) === userAnswer;
        }).length;
    },
    [correctAnswers],
  );
  const handleSubmit = useCallback(() => {
    setHighlights([]);
    setToolbar(null);
    setSubmitted(true);
    setCurrentPart(1);
    setShowResultModal(true);
    if (correctAnswers && data) {
      const totalCount = Object.keys(correctAnswers).length;
      const correctCount = computeCorrectCount(answers);
      const band = rawScoreToBand(correctCount);
      saveListeningResultToHistory({
        setId: data.set.id,
        testId: data.id,
        setLabel: data.set.examLabel,
        testLabel: data.label,
        correctCount,
        totalCount,
        band,
        date: new Date().toISOString(),
      });
    }
  }, [correctAnswers, data, answers, computeCorrectCount]);
  const isCorrect = useCallback(
    (qNum: number): boolean | null => {
      if (!submitted || !correctAnswers || correctAnswers[qNum] === undefined)
        return null;
      const userAnswer = normalizeListeningAnswer(answers[qNum] ?? "");
      const expected = correctAnswers[qNum];
      if (Array.isArray(expected)) {
        return expected.some(
          (item) => normalizeListeningAnswer(String(item)) === userAnswer,
        );
      }
      return normalizeListeningAnswer(String(expected)) === userAnswer;
    },
    [submitted, correctAnswers, answers],
  );
  const updateAnswer = useCallback((qNum: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [qNum]: value }));
  }, []);
  const getChooseTwoSelection = useCallback(
    (primaryQ: number, secondaryQ?: number) => {
      if (secondaryQ !== undefined) {
        return [answers[primaryQ] ?? "", answers[secondaryQ] ?? ""]
          .filter(Boolean)
          .map((s) => s.trim().toUpperCase());
      }
      return (answers[primaryQ] ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 2);
    },
    [answers],
  );
  const toggleChooseTwo = useCallback(
    (primaryQ: number, secondaryQ: number, letter: string) => {
      const selected = getChooseTwoSelection(primaryQ, secondaryQ);
      const L = letter.toUpperCase();
      const next = selected.includes(L)
        ? selected.filter((x) => x !== L)
        : selected.length >= 2
          ? [...selected.slice(1), L]
          : [...selected, L];
      const sorted = [...next].sort();
      setAnswers((prev) => ({
        ...prev,
        [primaryQ]: sorted[0] ?? "",
        [secondaryQ]: sorted[1] ?? "",
      }));
    },
    [getChooseTwoSelection],
  );
  const correctCount = correctAnswers
    ? Object.keys(correctAnswers).filter((q) => isCorrect(Number(q)) === true)
        .length
    : 0;
  const resultText = correctAnswers
    ? t("resultCorrect")
        .replace("{count}", String(correctCount))
        .replace("{total}", String(Object.keys(correctAnswers).length))
    : t("submittedNoKey");
  const getCorrectAnswerText = useCallback(
    (qNum: number): string | null => {
      if (!correctAnswers) return null;
      const expected = correctAnswers[qNum];
      if (expected === undefined) return null;
      if (Array.isArray(expected)) return expected.join(" / ");
      return expected;
    },
    [correctAnswers],
  );
  const scrollToAnswer = useCallback((qNum: number) => {
    if (!transcriptRef.current) return;
    const el = transcriptRef.current.querySelector<HTMLElement>(
      `[id^="ielts-listening-explanation-number-${qNum}-"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const scrollToQuestion = useCallback((qNum: number) => {
    const container = questionsPanelRef.current ?? contentRef.current;
    const el = container?.querySelector<HTMLElement>(
      `[data-question-number="${qNum}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  useEffect(() => {
    if (pendingScrollToQuestion == null) return;
    const raf = requestAnimationFrame(() => {
      const container = questionsPanelRef.current ?? contentRef.current;
      const el = container?.querySelector<HTMLElement>(
        `[data-question-number="${pendingScrollToQuestion}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScrollToQuestion(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollToQuestion]);
  if (!data) return notFound();
  const partContent = useMemo(
    () => getPartContent(data.set.id, data.id),
    [data.set.id, data.id],
  );
  const partQuestionButtons = useMemo(() => {
    const start = (currentPart - 1) * 10 + 1;
    const end = currentPart * 10;
    const chooseTwoBlocks = getChooseTwoBlocksForPart(
      partContent,
      currentPart as 2 | 3,
    );
    const pairFirstSet = new Set(chooseTwoBlocks?.map((b) => b.qNums[0]) ?? []);
    const pairSecondSet = new Set(
      chooseTwoBlocks?.flatMap((b) =>
        b.qNums.length >= 2 ? [b.qNums[1]] : [],
      ) ?? [],
    );
    const items: Array<
      | {
          type: "single";
          qNum: number;
        }
      | {
          type: "pair";
          qNums: [number, number];
        }
    > = [];
    for (let qNum = start; qNum <= end; qNum++) {
      if (pairFirstSet.has(qNum)) {
        const block = chooseTwoBlocks?.find((b) => b.qNums[0] === qNum);
        if (block && block.qNums.length >= 2) {
          items.push({
            type: "pair",
            qNums: [block.qNums[0], block.qNums[1]] as [number, number],
          });
        } else {
          items.push({ type: "single", qNum });
        }
      } else if (!pairSecondSet.has(qNum)) {
        items.push({ type: "single", qNum });
      }
    }
    return items;
  }, [currentPart, partContent]);
  const transcriptBadgeHelpers = useMemo(() => {
    const chooseTwoBlocks = getChooseTwoBlocksForPart(
      partContent,
      currentPart as 2 | 3,
    );
    const pairLabelByQNum: Record<number, string> = {};
    const primaryByQNum: Record<number, number> = {};
    chooseTwoBlocks?.forEach((b) => {
      if (b.qNums.length >= 2) {
        const [a, b2] = b.qNums;
        const label = `${a}–${b2}`;
        pairLabelByQNum[a] = pairLabelByQNum[b2] = label;
        primaryByQNum[a] = primaryByQNum[b2] = a;
      }
    });
    return {
      getBadgeLabel: (qNum: number) => pairLabelByQNum[qNum] ?? String(qNum),
      getBadgeCorrect: (qNum: number): boolean | null => {
        const primary = primaryByQNum[qNum];
        if (primary == null) return isCorrect(qNum);
        const block = chooseTwoBlocks?.find((b) => b.qNums[0] === primary);
        if (!block || block.qNums.length < 2) return isCorrect(qNum);
        const c1 = isCorrect(block.qNums[0]);
        const c2 = isCorrect(block.qNums[1]);
        if (c1 === null || c2 === null) return null;
        return c1 && c2;
      },
    };
  }, [currentPart, partContent, isCorrect]);
  const currentPartJsx = useMemo(() => {
    const segmentIdPrefix = `part-${currentPart}`;
    const partProps = {
      answers,
      updateAnswer,
      isCorrect,
      submitted,
      segmentIdPrefix,
      getCorrectAnswerText,
    };
    switch (currentPart) {
      case 1:
        return <Part1Content {...partProps} content={partContent.part1} />;
      case 2:
        return (
          <Part2Content
            {...partProps}
            getChooseTwoSelection={getChooseTwoSelection}
            toggleChooseTwo={toggleChooseTwo}
            content={partContent.part2}
          />
        );
      case 3:
        return (
          <Part3Content
            {...partProps}
            getChooseTwoSelection={getChooseTwoSelection}
            toggleChooseTwo={toggleChooseTwo}
            content={partContent.part3}
          />
        );
      case 4:
        return <Part4Content {...partProps} content={partContent.part4} />;
      default:
        return null;
    }
  }, [
    currentPart,
    partContent,
    answers,
    updateAnswer,
    isCorrect,
    submitted,
    getCorrectAnswerText,
    getChooseTwoSelection,
    toggleChooseTwo,
  ]);
  return (
    <div className="ielts-exam mx-auto max-w-6xl space-y-4">
      <nav className="flex items-center justify-between rounded-b-lg border-b border-zinc-200 bg-zinc-100 px-5 py-3 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-zinc-700 text-zinc-100 dark:bg-zinc-600">
            <Headphones className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-100">
              {t("ieltsListeningTest")}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {data.set.examLabel} – {data.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExamTimer totalMinutes={40} />
          <Tooltip content={t("ariaToggleFullscreen")}>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              aria-label={t("ariaToggleFullscreen")}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </Tooltip>
          <Tooltip content={t("ariaBackToTestList")}>
            <Link
              href="/listening"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
              aria-label={t("ariaBackToTestList")}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{t("testList")}</span>
            </Link>
          </Tooltip>
        </div>
      </nav>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-6 py-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Tooltip content={t("questionBoard")}>
                <button
                  type="button"
                  onClick={() => setShowQuestionBoard(true)}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-zinc-300 bg-white text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label={t("questionBoard")}
                >
                  <LayoutGrid className="h-5 w-5" />
                </button>
              </Tooltip>
              <Tooltip content={t("ariaPreviousPart")}>
                <button
                  type="button"
                  aria-label={t("ariaPreviousPart")}
                  disabled={currentPart === 1}
                  onClick={() => setCurrentPart((p) => Math.max(1, p - 1))}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-zinc-300 bg-white text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </Tooltip>
              <span className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
                {t("partLabel").replace("{n}", String(currentPart))}
              </span>
              <span className="font-semibold">
                {t(PART_LABEL_KEYS[currentPart])}
              </span>
              <Tooltip content={t("ariaNextPart")}>
                <button
                  type="button"
                  aria-label={t("ariaNextPart")}
                  disabled={currentPart === TOTAL_PARTS}
                  onClick={() =>
                    setCurrentPart((p) => Math.min(TOTAL_PARTS, p + 1))
                  }
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-zinc-300 bg-white text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          </div>
          {audioUrls.length > 0 ? (
            audioTryIndex < audioUrls.length ? (
              <AudioPlayer
                key={`${currentPart}-${audioTryIndex}-${audioUrls[audioTryIndex]}`}
                src={audioUrls[audioTryIndex]}
                onError={() => setAudioTryIndex((i) => i + 1)}
              />
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400">{t("noAudio")}</p>
            )
          ) : (
            <p className="text-zinc-500 dark:text-zinc-400">{t("noAudio")}</p>
          )}
        </header>

        <div
          ref={contentRef}
          className="relative border-t border-zinc-100 px-6 py-6 text-base text-zinc-800 dark:border-zinc-800 dark:text-zinc-100"
        >
          <HighlightsContext.Provider value={highlightsValue}>
            <ScrollToAnswerContext.Provider
              value={submitted && transcriptHtml ? scrollToAnswer : null}
            >
              {submitted && transcriptHtml ? (
                <div
                  ref={splitContainerRef}
                  className="flex h-[70vh] overflow-hidden"
                >
                  <div
                    className="flex flex-col overflow-hidden"
                    style={{ width: `${transcriptPct}%` }}
                  >
                    <div className="mb-2 shrink-0 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Transcript
                    </div>
                    <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
                      {partQuestionButtons.map((item) => {
                        const qNum =
                          item.type === "single" ? item.qNum : item.qNums[0];
                        const correct =
                          item.type === "single"
                            ? isCorrect(item.qNum)
                            : isCorrect(item.qNums[0]);
                        const label =
                          item.type === "single"
                            ? String(item.qNum)
                            : `${item.qNums[0]}–${item.qNums[1]}`;
                        const base =
                          "flex h-7 min-w-7 items-center justify-center rounded-md border px-1 text-xs font-semibold cursor-pointer transition-colors hover:opacity-90";
                        const color =
                          correct === true
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : correct === false
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
                        return (
                          <Tooltip
                            key={label}
                            content={t(
                              "scrollToQuestionInTranscriptTooltip",
                            ).replace("{n}", label)}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (!transcriptRef.current) return;
                                const el =
                                  transcriptRef.current.querySelector<HTMLElement>(
                                    `[id^="ielts-listening-explanation-number-${qNum}-"]`,
                                  );
                                el?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                              }}
                              className={`${base} ${color}`}
                            >
                              {label}
                            </button>
                          </Tooltip>
                        );
                      })}
                    </div>
                    <TranscriptWithHighlights
                      ref={transcriptRef}
                      transcriptHtml={transcriptHtml}
                      segmentId={`transcript-${currentPart}`}
                      highlights={highlights}
                      removeHighlight={removeHighlight}
                      answers={answers}
                      correctAnswers={correctAnswers}
                      isCorrect={isCorrect}
                      getCorrectAnswerText={getCorrectAnswerText}
                      getBadgeLabel={transcriptBadgeHelpers.getBadgeLabel}
                      getBadgeCorrect={transcriptBadgeHelpers.getBadgeCorrect}
                    />
                  </div>

                  <div
                    onMouseDown={(e) => {
                      isDraggingRef.current = true;
                      e.preventDefault();
                    }}
                    className="group relative mx-1 flex shrink-0 cursor-col-resize flex-col items-center justify-center"
                    style={{ width: 12 }}
                  >
                    <div className="h-full w-px bg-zinc-200 group-hover:bg-zinc-300 dark:bg-zinc-700 dark:group-hover:bg-zinc-600" />
                    <div className="absolute flex h-8 w-4 items-center justify-center rounded border border-zinc-300 bg-white shadow-sm group-hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:group-hover:bg-zinc-700">
                      <svg
                        viewBox="0 0 8 16"
                        fill="currentColor"
                        className="h-4 w-2 text-zinc-400"
                      >
                        <circle cx="2" cy="4" r="1" />
                        <circle cx="6" cy="4" r="1" />
                        <circle cx="2" cy="8" r="1" />
                        <circle cx="6" cy="8" r="1" />
                        <circle cx="2" cy="12" r="1" />
                        <circle cx="6" cy="12" r="1" />
                      </svg>
                    </div>
                  </div>

                  <div
                    ref={questionsPanelRef}
                    className="flex-1 overflow-y-auto pl-3"
                  >
                    <div className="space-y-4">
                      <div className="mb-5">
                        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                          SECTION {currentPart}
                        </p>
                      </div>
                      {currentPartJsx}
                    </div>
                  </div>
                </div>
              ) : (
                <div ref={questionsPanelRef} className="space-y-4">
                  <div className="mb-5">
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      SECTION {currentPart}
                    </p>
                  </div>
                  {currentPartJsx}
                </div>
              )}
            </ScrollToAnswerContext.Provider>
            {toolbar?.show && (
              <HighlightToolbar
                x={toolbar.x}
                y={toolbar.y}
                hasHighlightId={!!toolbar.highlightId}
                selectedText={toolbar.selectedText}
                flashcardText={
                  toolbar.selectedTextWords ?? toolbar.selectedText
                }
                onHighlight={handleHighlightClick}
                onUnhighlight={handleUnhighlightClick}
                onFlashcard={handleFlashcardClick}
                showHighlightButtons={!submitted}
              />
            )}
          </HighlightsContext.Provider>
        </div>

        <footer className="flex flex-col gap-3 border-t border-zinc-200 px-6 py-5 dark:border-zinc-800">
          {!submitted ? (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                {partQuestionButtons.map((item) => {
                  const qNum =
                    item.type === "single" ? item.qNum : item.qNums[0];
                  const answered =
                    item.type === "single"
                      ? (answers[item.qNum] ?? "").trim() !== ""
                      : item.qNums.some(
                          (n) => (answers[n] ?? "").trim() !== "",
                        );
                  const label =
                    item.type === "single"
                      ? String(item.qNum)
                      : `${item.qNums[0]}–${item.qNums[1]}`;
                  return (
                    <Tooltip
                      key={label}
                      content={t("scrollToQuestionTooltip").replace(
                        "{n}",
                        label,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => scrollToQuestion(qNum)}
                        className={`inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border px-1.5 text-sm font-medium transition-colors hover:opacity-90 ${
                          answered
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-200"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                        aria-label={`Question ${label}`}
                      >
                        {label}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                {[1, 2, 3, 4].map((section) => {
                  const start = (section - 1) * 10 + 1;
                  const done = Array.from(
                    { length: 10 },
                    (_, i) => start + i,
                  ).filter((q) => (answers[q] ?? "").trim() !== "").length;
                  const isCurrent = currentPart === section;
                  return (
                    <Tooltip
                      key={section}
                      content={t("goToSectionTooltip").replace(
                        "{n}",
                        String(section),
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setCurrentPart(section)}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:opacity-90 ${
                          isCurrent
                            ? "border-red-500 bg-red-50 text-red-800 dark:border-red-600 dark:bg-red-950/50 dark:text-red-200"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        }`}
                        aria-label={t("sectionLabel").replace(
                          "{n}",
                          String(section),
                        )}
                        aria-current={isCurrent ? "true" : undefined}
                      >
                        <span className="font-medium">
                          {t("sectionLabel").replace("{n}", String(section))}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          |
                        </span>
                        <span>
                          {t("doneCount")
                            .replace("{done}", String(done))
                            .replace("{total}", "10")}
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}
                <Tooltip content={t("submit")}>
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    className="cursor-pointer rounded-xl bg-zinc-900 px-6 py-3 text-base font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {t("submit")}
                  </button>
                </Tooltip>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-base text-zinc-600 dark:text-zinc-400">
                {resultText}
              </p>
              <div className="flex flex-wrap gap-2">
                <Tooltip content={t("retake")}>
                  <button
                    type="button"
                    onClick={() => {
                      setAnswers({});
                      setSubmitted(false);
                      setShowResultModal(false);
                      setCurrentPart(1);
                      setHighlights([]);
                      setTranscriptPct(42);
                    }}
                    className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    ↺ {t("retake")}
                  </button>
                </Tooltip>
                <Tooltip content={t("resultDetails")}>
                  <button
                    type="button"
                    onClick={() => setShowResultModal(true)}
                    className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {t("resultDetails")}
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </footer>
      </section>

      {showQuestionBoard && (
        <div
          className="fixed inset-0 z-40 flex cursor-pointer items-end justify-center bg-black/30 sm:items-center"
          onClick={() => setShowQuestionBoard(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="question-board-title"
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white shadow-xl dark:bg-zinc-900 sm:max-h-[85vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                <h2
                  id="question-board-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  {t("questionBoard")}
                </h2>
              </div>
              <Tooltip content={t("ariaClose")}>
                <button
                  type="button"
                  onClick={() => setShowQuestionBoard(false)}
                  className="cursor-pointer rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  aria-label={t("ariaClose")}
                >
                  <X className="h-5 w-5" />
                </button>
              </Tooltip>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 sm:max-h-[calc(85vh-8rem)]">
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 40 }, (_, i) => {
                  const qNum = i + 1;
                  const answered = (answers[qNum] ?? "").trim() !== "";
                  const section = Math.ceil(qNum / 10);
                  return (
                    <Tooltip
                      key={qNum}
                      content={t("scrollToQuestionTooltip").replace(
                        "{n}",
                        String(qNum),
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentPart(section);
                          setShowQuestionBoard(false);
                          setPendingScrollToQuestion(qNum);
                        }}
                        className={`flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition ${
                          answered
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-200"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {qNum}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-confirm-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2
              id="submit-confirm-title"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {t("submitConfirmTitle")}
            </h2>
            <p className="mt-2 text-[13px] text-zinc-600 dark:text-zinc-400">
              {t("submitConfirmBody")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Tooltip content={t("cancel")}>
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {t("cancel")}
                </button>
              </Tooltip>
              <Tooltip content={t("submit")}>
                <button
                  type="button"
                  onClick={() => {
                    setShowSubmitConfirm(false);
                    handleSubmit();
                  }}
                  className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {t("submit")}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      {showResultModal && (
        <ResultModal
          onClose={closeResultModal}
          correctAnswers={correctAnswers}
          answers={answers}
          isCorrect={isCorrect}
        />
      )}

      {showFlashcardModal && (
        <AddFlashcardModal
          initialWord={flashcardInitialWord}
          onClose={() => setShowFlashcardModal(false)}
        />
      )}
    </div>
  );
}
