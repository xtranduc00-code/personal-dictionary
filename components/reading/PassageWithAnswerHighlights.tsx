"use client";
import { useMemo } from "react";
const SKIP_ANSWERS = new Set([
  "TRUE",
  "FALSE",
  "NOT GIVEN",
  "YES",
  "NO",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
]);
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function expandToSentence(
  text: string,
  start: number,
  end: number,
): {
  start: number;
  end: number;
} {
  let s = start;
  let e = end;
  const before = text.slice(0, start);
  const sentenceStarts = [
    before.lastIndexOf(". "),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
    before.lastIndexOf(".\n"),
    before.lastIndexOf("!\n"),
    before.lastIndexOf("?\n"),
    before.lastIndexOf("\n\n"),
  ].filter((i) => i >= 0);
  if (sentenceStarts.length > 0) {
    s = Math.max(...sentenceStarts) + 2;
  }
  const after = text.slice(end);
  const delimiters: Array<{
    idx: number;
    len: number;
  }> = [". ", "! ", "? ", ".\n", "!\n", "?\n"].map((d) => ({
    idx: after.indexOf(d),
    len: d.length,
  }));
  const paraBreak = after.indexOf("\n\n");
  if (paraBreak >= 0) delimiters.push({ idx: paraBreak, len: 1 });
  const sentenceEnds = delimiters
    .filter((x) => x.idx >= 0)
    .map((x) => end + x.idx + x.len);
  if (sentenceEnds.length > 0) {
    e = Math.min(...sentenceEnds);
  } else {
    e = text.length;
  }
  return { start: s, end: e };
}
function getAnswerHighlights(
  passage: string,
  correctAnswers: Record<number, string | string[]>,
  partStart: number,
  partCount: number,
  expandToFullSentence: boolean,
): Array<{
  start: number;
  end: number;
  qNums: number[];
}> {
  const rawRanges: Array<{
    start: number;
    end: number;
    qNum: number;
  }> = [];
  for (let i = 0; i < partCount; i++) {
    const qNum = partStart + i;
    const ans = correctAnswers[qNum];
    if (!ans || Array.isArray(ans)) continue;
    const s = String(ans).trim();
    if (!s || SKIP_ANSWERS.has(s)) continue;
    const esc = escapeRegex(s);
    const re = new RegExp(`\\b${esc}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(passage)) !== null) {
      const r = { start: m.index, end: m.index + m[0].length, qNum };
      const expanded = expandToFullSentence
        ? expandToSentence(passage, r.start, r.end)
        : { start: r.start, end: r.end };
      rawRanges.push({ ...expanded, qNum });
    }
  }
  rawRanges.sort((a, b) => a.start - b.start);
  const merged: Array<{
    start: number;
    end: number;
    qNums: number[];
  }> = [];
  for (const r of rawRanges) {
    if (merged.length && r.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(
        merged[merged.length - 1].end,
        r.end,
      );
      if (!merged[merged.length - 1].qNums.includes(r.qNum)) {
        merged[merged.length - 1].qNums.push(r.qNum);
      }
    } else {
      merged.push({ start: r.start, end: r.end, qNums: [r.qNum] });
    }
  }
  return merged;
}
export function PassageWithAnswerHighlights({
  content,
  correctAnswers,
  partStart,
  partCount,
  submitted,
}: {
  content: string;
  correctAnswers?: Record<number, string | string[]>;
  partStart: number;
  partCount: number;
  submitted: boolean;
}) {
  const parts = useMemo(() => {
    if (
      !submitted ||
      !correctAnswers ||
      !content ||
      Object.keys(correctAnswers).length === 0
    ) {
      return [{ text: content, highlight: false }];
    }
    const ranges = getAnswerHighlights(
      content,
      correctAnswers,
      partStart,
      partCount,
      true,
    );
    if (ranges.length === 0) {
      return [{ text: content, highlight: false }];
    }
    const result: Array<
      | {
          text: string;
          highlight: false;
        }
      | {
          text: string;
          highlight: true;
          qNums: number[];
        }
    > = [];
    let pos = 0;
    for (const r of ranges) {
      if (r.start > pos) {
        result.push({ text: content.slice(pos, r.start), highlight: false });
      }
      result.push({
        text: content.slice(r.start, r.end),
        highlight: true,
        qNums: r.qNums,
      });
      pos = r.end;
    }
    if (pos < content.length) {
      result.push({ text: content.slice(pos), highlight: false });
    }
    return result;
  }, [content, correctAnswers, partStart, partCount, submitted]);
  return (
    <>
      {parts.map((p, i) =>
        p.highlight ? (
          <span key={i} className="inline">
            <mark
              className="rounded bg-amber-200/90 px-0.5 text-inherit dark:bg-amber-500/40"
              id={
                "qNums" in p && p.qNums.length
                  ? `reading-answer-${p.qNums[0]}`
                  : undefined
              }
            >
              {p.text}
            </mark>
            {"qNums" in p && p.qNums.length > 0 && (
              <span
                className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-600 px-1 text-[10px] font-semibold text-white dark:bg-zinc-500"
                aria-hidden
              >
                {p.qNums.join(",")}
              </span>
            )}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
