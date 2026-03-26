"use client";
import { useI18n } from "@/components/i18n-provider";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { Highlight } from "./HighlightContext";
const USER_HIGHLIGHT_CLASS = "user-highlight-mark";
const TRANSCRIPT_SENTENCE_WRONG = "transcript-sentence-wrong";
function findMarkForExplanationBadge(badge: HTMLElement): HTMLElement | null {
  const parent = badge.parentElement;
  if (
    parent?.tagName === "MARK" &&
    (parent.classList.contains("explanation-highlight") ||
      parent.classList.contains("transcript-answer-wrong"))
  ) {
    return parent as HTMLElement;
  }

  let el: Element | null = badge.previousElementSibling;
  while (el && el.classList.contains(USER_HIGHLIGHT_CLASS)) {
    el = el.previousElementSibling;
  }

  if (
    el instanceof HTMLElement &&
    el.tagName === "MARK" &&
    (el.classList.contains("explanation-highlight") ||
      el.classList.contains("transcript-answer-wrong"))
  ) {
    return el;
  }

  return null;
}
function applyAnswerFeedbackToTranscript(
  container: HTMLElement,
  isCorrect: (qNum: number) => boolean | null,
  getBadgeLabel?: (qNum: number) => string,
  getBadgeCorrect?: (qNum: number) => boolean | null,
): void {
  container.querySelectorAll(`p.${TRANSCRIPT_SENTENCE_WRONG}`).forEach((p) => {
    p.classList.remove(TRANSCRIPT_SENTENCE_WRONG);
  });
  const badges = [
    ...container.querySelectorAll<HTMLElement>(
      "[id^='ielts-listening-explanation-number-']",
    ),
  ];
  type Row = {
    badge: HTMLElement;
    mark: HTMLElement | null;
    correct: boolean | null;
  };
  const rows: Row[] = [];
  badges.forEach((badge) => {
    const id = badge.getAttribute("id") ?? "";
    const match = id.match(/ielts-listening-explanation-number-(\d+)-/);
    if (!match) return;
    const qNum = parseInt(match[1], 10);
    const label = getBadgeLabel ? getBadgeLabel(qNum) : String(qNum);
    const correct = getBadgeCorrect ? getBadgeCorrect(qNum) : isCorrect(qNum);
    badge.textContent = label;
    rows.push({ badge, mark: findMarkForExplanationBadge(badge), correct });
  });
  rows.forEach(({ badge, correct }) => {
    badge.classList.remove(
      "transcript-badge-wrong",
      "transcript-badge-correct",
    );
    if (correct === true) badge.classList.add("transcript-badge-correct");
    else if (correct === false) badge.classList.add("transcript-badge-wrong");
  });
  const byMark = new Map<HTMLElement, Row[]>();
  rows.forEach((row) => {
    if (!row.mark) return;
    const list = byMark.get(row.mark) ?? [];
    list.push(row);
    byMark.set(row.mark, list);
  });
  byMark.forEach((group, mark) => {
    mark.classList.remove("transcript-answer-wrong", "explanation-highlight");
    const anyFalse = group.some((r) => r.correct === false);
    if (anyFalse) mark.classList.add("transcript-answer-wrong");
    else mark.classList.add("explanation-highlight");
  });
}
function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
    });
  };
}
function createRangeForOffset(
  container: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = (node.textContent ?? "").length;
    if (startNode == null && current <= start && start < current + len) {
      startNode = node;
      startOffset = start - current;
    }
    if (endNode == null && current < end && end <= current + len) {
      endNode = node;
      endOffset = end - current;
    }
    current += len;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}
/** Giữ nguyên &lt;mark class="explanation-highlight"&gt; từ transcript (Engnovate) — không strip để luôn hiện highlight câu hỏi. */
function stripExplanationHighlight(html: string): string {
  return html;
}
function applyHighlightsToTranscript(
  container: HTMLElement,
  originalHtml: string,
  segmentHighlights: Highlight[],
  onRemoveHighlight: (id: string) => void,
  getClickToRemoveText: () => string,
  onClickRef: {
    current: ((e: MouseEvent) => void) | null;
  },
): void {
  container.innerHTML = stripExplanationHighlight(originalHtml);
  const sorted = [...segmentHighlights].sort((a, b) => b.start - a.start);
  for (const h of sorted) {
    const range = createRangeForOffset(container, h.start, h.end);
    if (!range) continue;
    try {
      const contents = range.extractContents();
      const mark = document.createElement("mark");
      mark.className = `cursor-pointer rounded bg-amber-200/90 px-0.5 text-inherit transition hover:bg-amber-300/90 dark:bg-amber-500/30 dark:hover:bg-amber-500/40 ${USER_HIGHLIGHT_CLASS}`;
      mark.dataset.highlightId = h.id;
      mark.title = getClickToRemoveText();
      mark.appendChild(contents);
      range.insertNode(mark);
    } catch {}
  }
  const handler = (e: MouseEvent) => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) return;
    const target = (e.target as HTMLElement).closest(
      `.${USER_HIGHLIGHT_CLASS}`,
    );
    if (target instanceof HTMLElement && target.dataset.highlightId) {
      onRemoveHighlight(target.dataset.highlightId);
    }
  };
  if (onClickRef.current) {
    container.removeEventListener("click", onClickRef.current);
  }
  onClickRef.current = handler;
  container.addEventListener("click", handler);
}
export const TranscriptWithHighlights = forwardRef<
  HTMLDivElement | null,
  {
    transcriptHtml: string;
    segmentId: string;
    highlights: Highlight[];
    removeHighlight: (id: string) => void;
    answers?: Record<number, string>;
    correctAnswers?: Record<number, string | string[]>;
    isCorrect?: (qNum: number) => boolean | null;
    getCorrectAnswerText?: (qNum: number) => string | null;
    getBadgeLabel?: (qNum: number) => string;
    getBadgeCorrect?: (qNum: number) => boolean | null;
  }
>(function TranscriptWithHighlights(
  {
    transcriptHtml,
    segmentId,
    highlights,
    removeHighlight,
    answers = {},
    correctAnswers,
    isCorrect = () => null,
    getCorrectAnswerText = () => null,
    getBadgeLabel,
    getBadgeCorrect,
  },
  ref,
) {
  const { t } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onClickRef = useRef<((e: MouseEvent) => void) | null>(null);
  const removeHighlightRef = useRef(removeHighlight);
  removeHighlightRef.current = removeHighlight;
  const isCorrectRef = useRef(isCorrect);
  isCorrectRef.current = isCorrect;
  const getBadgeLabelRef = useRef(getBadgeLabel);
  getBadgeLabelRef.current = getBadgeLabel;
  const getBadgeCorrectRef = useRef(getBadgeCorrect);
  getBadgeCorrectRef.current = getBadgeCorrect;
  const segmentHighlights = useMemo(
    () =>
      highlights
        .filter((h) => h.segmentId === segmentId)
        .sort((a, b) => a.start - b.start),
    [highlights, segmentId],
  );
  const stableRemoveHighlight = useCallback((id: string) => {
    removeHighlightRef.current(id);
  }, []);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !transcriptHtml) return;
    el.innerHTML = stripExplanationHighlight(transcriptHtml);
  }, [transcriptHtml]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !transcriptHtml) return;
    applyHighlightsToTranscript(
      el,
      transcriptHtml,
      segmentHighlights,
      stableRemoveHighlight,
      () => t("clickToRemoveHighlight"),
      onClickRef,
    );
    return () => {
      if (onClickRef.current) {
        el.removeEventListener("click", onClickRef.current);
        onClickRef.current = null;
      }
    };
  }, [transcriptHtml, segmentId, segmentHighlights, stableRemoveHighlight, t]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !transcriptHtml || !correctAnswers) return;
    applyAnswerFeedbackToTranscript(
      el,
      isCorrectRef.current,
      getBadgeLabelRef.current,
      getBadgeCorrectRef.current,
    );
  }, [answers, correctAnswers, transcriptHtml]);
  return (
    <div
      ref={mergeRefs<HTMLDivElement>(ref, scrollContainerRef)}
      className="ielts-transcript flex-1 select-text cursor-text overflow-y-auto pr-3"
    >
      <div
        ref={containerRef}
        data-segment-id={segmentId}
        spellCheck={false}
        className="highlight-segment transcript-content select-text cursor-text text-sm leading-relaxed text-zinc-800 dark:text-zinc-100"
        style={{
          WebkitUserSelect: "text",
          userSelect: "text",
          WebkitTouchCallout: "default",
        }}
      />
    </div>
  );
});
