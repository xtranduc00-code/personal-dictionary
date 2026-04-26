// Deterministic, no-LLM coach. One short insight sentence — no echoing of
// data already shown by Engine Best / Eval bar / Classification badge.

import { Classification } from "../wintrchess/constants/Classification";
import type { MoveCoachInput, MoveCoachOutput } from "./types";

const STATIC_LINES: Partial<Record<Classification, string>> = {
  [Classification.BRILLIANT]:
    "Brilliant — sacrificing material was the strongest continuation.",
  [Classification.CRITICAL]: "Only move that holds the advantage.",
  [Classification.BEST]: "Top engine choice.",
  [Classification.EXCELLENT]: "Strong — close to the engine's pick.",
  [Classification.FORCED]: "Only legal reply.",
};

export function templateCoach(input: MoveCoachInput): MoveCoachOutput {
  const cls = input.classification;

  // Theory: name the opening, that's the only insight worth surfacing.
  if (cls === Classification.THEORY) {
    return {
      text: input.opening ? `Book move — ${input.opening}.` : "Book move.",
      source: "template",
    };
  }

  // Static one-liners for the high-confidence cases.
  if (cls && STATIC_LINES[cls]) {
    return { text: STATIC_LINES[cls]!, source: "template" };
  }

  // Inaccuracy / mistake / blunder / risky / okay → name the engine pick if
  // we have one, else fall back to a label.
  const better = input.bestSan && input.bestSan !== input.playedSan ? input.bestSan : null;
  if (cls === Classification.BLUNDER) {
    return { text: better ? `Blunder — ${better} was much stronger.` : "Blunder.", source: "template" };
  }
  if (cls === Classification.MISTAKE) {
    return { text: better ? `Mistake — engine preferred ${better}.` : "Mistake.", source: "template" };
  }
  if (cls === Classification.INACCURACY) {
    return { text: better ? `Inaccuracy — ${better} was sharper.` : "Inaccuracy.", source: "template" };
  }
  if (cls === Classification.RISKY) {
    return { text: better ? `Risky — ${better} was safer.` : "Risky.", source: "template" };
  }
  if (cls === Classification.OKAY) {
    return { text: better ? `Engine preferred ${better}.` : "Reasonable move.", source: "template" };
  }

  // Unclassified or no useful insight.
  return { text: better ? `Engine preferred ${better}.` : "", source: "template" };
}
