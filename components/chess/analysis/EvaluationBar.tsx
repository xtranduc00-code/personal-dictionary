"use client";

import type { Evaluation } from "@/lib/chess/analysis/wintrchess/types/Evaluation";
import { stringifyEvaluation } from "@/lib/chess/analysis/wintrchess/chess-utils";

/**
 * Vertical eval bar — white at the bottom by default. Centipawn → percentage
 * via the same logistic used in expectedPoints; mate is shown as a full bar.
 */
export function EvaluationBar({
  evaluation,
  flipped = false,
  height,
}: {
  evaluation: Evaluation | null;
  flipped?: boolean;
  /** Match the board size for visual alignment. */
  height: number;
}) {
  const whitePercent = (() => {
    if (!evaluation) return 50;
    if (evaluation.type == "mate") {
      if (evaluation.value == 0) return 50;
      return evaluation.value > 0 ? 100 : 0;
    }
    const clamped = Math.max(-1500, Math.min(1500, evaluation.value));
    return 100 / (1 + Math.exp(-0.0035 * clamped));
  })();

  const blackPercent = 100 - whitePercent;

  // Show the eval number on the side that has the advantage. Suppress
  // entirely when the position is dead even (0.0 cp) — printing "0.0"
  // twice or even once on a balanced position is noise. When flipped,
  // colour orientation swaps; the placement logic still anchors to the
  // advantaged side.
  const isAdvantaged = (() => {
    if (!evaluation) return false;
    if (evaluation.type === "mate") return true;
    return Math.abs(evaluation.value) >= 5; // <5 cp is "even" for display
  })();
  const text = isAdvantaged && evaluation ? stringifyEvaluation(evaluation, false, 1) : null;

  // When flipped, white at the top.
  const topPercent = flipped ? whitePercent : blackPercent;
  const topIsWhite = flipped;

  // Position the label on the advantaged side: white winning → bottom by
  // default (white is at the bottom of an unflipped bar); black winning
  // → top. flipped inverts this.
  const labelOnTop = (() => {
    if (!evaluation) return false;
    const whiteWinning = evaluation.type === "mate"
      ? evaluation.value > 0
      : evaluation.value > 0;
    return flipped ? whiteWinning : !whiteWinning;
  })();

  return (
    <div
      className="relative flex w-7 shrink-0 flex-col overflow-hidden rounded-md ring-1 ring-zinc-200 dark:ring-zinc-700"
      style={{ height }}
    >
      <div
        className={topIsWhite ? "bg-zinc-100" : "bg-zinc-900"}
        style={{ height: `${topPercent}%`, transition: "height 200ms ease" }}
      />
      <div
        className={topIsWhite ? "bg-zinc-900" : "bg-zinc-100"}
        style={{ flex: 1 }}
      />

      {text ? (
        <div
          className={`pointer-events-none absolute inset-x-0 text-center text-[10px] font-bold tabular-nums ${
            labelOnTop ? "top-1 text-zinc-200" : "bottom-1 text-zinc-700"
          }`}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
}
