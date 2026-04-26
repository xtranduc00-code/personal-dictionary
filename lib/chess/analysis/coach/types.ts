// Public input/output types for the coach.
//
// The coach is engine-agnostic: it never analyses chess itself. It receives
// pre-computed signals (classification, eval, played vs. best move, accuracy,
// etc.) and produces natural-language commentary.

import type { Classification } from "../wintrchess/constants/Classification";
import type { Evaluation } from "../wintrchess/types/Evaluation";

export interface MoveCoachInput {
  /** "white" | "black" of the side that just moved. */
  moveColour: "white" | "black";
  /** Standard algebraic notation, e.g. "Nxe5+". */
  playedSan: string;
  /** UCI of the played move, e.g. "e2e4". */
  playedUci: string;
  /** Engine's preferred move at the position before the played move (SAN). */
  bestSan?: string;
  /** Classification of the played move. */
  classification?: Classification;
  /** Accuracy percentage 0..100 for this move. */
  accuracy?: number;
  /** Evaluation BEFORE the played move (always from White's perspective). */
  evaluationBefore?: Evaluation;
  /** Evaluation AFTER the played move (always from White's perspective). */
  evaluationAfter?: Evaluation;
  /** Opening name detected at the resulting position, if any. */
  opening?: string;
  /** Move number (1-based, like "Move 12"). */
  moveNumber?: number;
  /** Whether the move gives check. */
  isCheck?: boolean;
  /** Whether the move is checkmate. */
  isCheckmate?: boolean;
  /** Whether the move captured a piece. */
  isCapture?: boolean;
}

export interface MoveCoachOutput {
  /** One- or two-paragraph natural-language explanation. */
  text: string;
  /** Where the explanation came from. */
  source: "template" | "openai";
}

export type CoachBackend = (
  input: MoveCoachInput,
) => Promise<MoveCoachOutput> | MoveCoachOutput;
