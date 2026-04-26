// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Chess, Move } from "chess.js";

import type { BoardState } from "./StateTreeNode";
import type { EngineLine } from "./EngineLine";
import type Evaluation from "./Evaluation";

export interface ExtractedNode {
  board: Chess;
  state: BoardState;
  topLine: EngineLine;
  evaluation: Evaluation;
  secondTopLine?: EngineLine;
  secondTopMove?: Move;
  secondSubjectiveEvaluation?: Evaluation;
}

export interface ExtractedPreviousNode extends ExtractedNode {
  topMove: Move;
  subjectiveEvaluation?: Evaluation;
  playedMove?: Move;
}

export interface ExtractedCurrentNode extends ExtractedNode {
  topMove?: Move;
  subjectiveEvaluation: Evaluation;
  playedMove: Move;
}
