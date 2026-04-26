// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { WHITE } from "chess.js";

import type {
  ExtractedCurrentNode,
  ExtractedPreviousNode,
} from "../types/ExtractedNode";
import { Classification } from "../constants/Classification";
import { adaptPieceColour } from "../constants/PieceColour";
import { getExpectedPointsLoss } from "../expectedPoints";

export function pointLossClassify(
  previous: ExtractedPreviousNode,
  current: ExtractedCurrentNode,
) {
  const previousSubjectiveValue =
    previous.evaluation.value * (current.playedMove.color == WHITE ? 1 : -1);

  const subjectiveValue = current.subjectiveEvaluation.value;

  if (
    previous.evaluation.type == "mate" &&
    current.evaluation.type == "mate"
  ) {
    if (previousSubjectiveValue > 0 && subjectiveValue < 0) {
      return subjectiveValue < -3
        ? Classification.MISTAKE
        : Classification.BLUNDER;
    }

    const mateLoss =
      (current.evaluation.value - previous.evaluation.value) *
      (current.playedMove.color == WHITE ? 1 : -1);

    if (mateLoss < 0 || (mateLoss == 0 && subjectiveValue < 0)) {
      return Classification.BEST;
    } else if (mateLoss < 2) {
      return Classification.EXCELLENT;
    } else if (mateLoss < 7) {
      return Classification.OKAY;
    } else {
      return Classification.INACCURACY;
    }
  }

  if (
    previous.evaluation.type == "mate" &&
    current.evaluation.type == "centipawn"
  ) {
    if (subjectiveValue >= 800) return Classification.EXCELLENT;
    if (subjectiveValue >= 400) return Classification.OKAY;
    if (subjectiveValue >= 200) return Classification.INACCURACY;
    if (subjectiveValue >= 0) return Classification.MISTAKE;
    return Classification.BLUNDER;
  }

  if (
    previous.evaluation.type == "centipawn" &&
    current.evaluation.type == "mate"
  ) {
    if (subjectiveValue > 0) return Classification.BEST;
    if (subjectiveValue >= -2) return Classification.BLUNDER;
    if (subjectiveValue >= -5) return Classification.MISTAKE;
    return Classification.INACCURACY;
  }

  const pointLoss = getExpectedPointsLoss(
    previous.evaluation,
    current.evaluation,
    adaptPieceColour(current.playedMove.color),
  );

  if (pointLoss < 0.01) return Classification.BEST;
  if (pointLoss < 0.045) return Classification.EXCELLENT;
  if (pointLoss < 0.08) return Classification.OKAY;
  if (pointLoss < 0.12) return Classification.INACCURACY;
  if (pointLoss < 0.22) return Classification.MISTAKE;
  return Classification.BLUNDER;
}
