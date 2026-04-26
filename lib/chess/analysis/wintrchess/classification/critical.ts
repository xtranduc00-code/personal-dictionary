// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import type {
  ExtractedCurrentNode,
  ExtractedPreviousNode,
} from "../types/ExtractedNode";
import { flipPieceColour, adaptPieceColour } from "../constants/PieceColour";
import { getCaptureSquare } from "../chess-utils";
import { getExpectedPointsLoss } from "../expectedPoints";
import { isMoveCriticalCandidate } from "../utils/criticalMove";
import { isPieceSafe } from "../utils/pieceSafety";

export function considerCriticalClassification(
  previous: ExtractedPreviousNode,
  current: ExtractedCurrentNode,
) {
  if (!isMoveCriticalCandidate(previous, current)) return false;

  if (
    current.subjectiveEvaluation.type == "mate" &&
    current.subjectiveEvaluation.value > 0
  )
    return false;

  if (current.playedMove.captured) {
    const capturedPieceSafety = isPieceSafe(previous.board, {
      color: flipPieceColour(current.playedMove.color),
      square: getCaptureSquare(current.playedMove),
      type: current.playedMove.captured,
    });

    if (!capturedPieceSafety) return false;
  }

  if (!previous.secondTopLine?.evaluation) return false;

  const secondTopMovePointLoss = getExpectedPointsLoss(
    previous.evaluation,
    previous.secondTopLine.evaluation,
    adaptPieceColour(current.playedMove.color),
  );

  return secondTopMovePointLoss >= 0.1;
}
