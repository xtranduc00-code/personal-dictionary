// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Chess, WHITE } from "chess.js";

import type { StateTreeNode } from "../types/StateTreeNode";
import {
  type EngineLine,
  getLineGroupSibling,
  getTopEngineLine,
} from "../types/EngineLine";
import type {
  ExtractedCurrentNode,
  ExtractedPreviousNode,
} from "../types/ExtractedNode";
import { adaptPieceColour } from "../constants/PieceColour";
import { getSubjectiveEvaluation } from "../chess-utils";

type PieceMovement = { from: string; to: string; promotion?: string };

function safeMove(fen: string, move: string | PieceMovement) {
  try {
    return new Chess(fen).move(move as never);
  } catch {
    return undefined;
  }
}

function extractSecondTopMove(node: StateTreeNode, topLine: EngineLine) {
  const secondTopLine = getLineGroupSibling(node.state.engineLines, topLine, 2);
  const secondTopMoveSan = secondTopLine?.moves.at(0)?.san;

  const secondTopMove = secondTopMoveSan
    ? safeMove(node.state.fen, secondTopMoveSan)
    : undefined;

  const secondSubjectiveEvaluation =
    secondTopLine?.evaluation &&
    secondTopMove &&
    getSubjectiveEvaluation(
      secondTopLine.evaluation,
      adaptPieceColour(secondTopMove.color),
    );

  return { secondTopLine, secondTopMove, secondSubjectiveEvaluation };
}

export function extractPreviousStateTreeNode(
  node: StateTreeNode,
): ExtractedPreviousNode | null {
  const topLine = getTopEngineLine(node.state.engineLines);
  if (!topLine) return null;

  const topMoveSan = topLine.moves.at(0)?.san;
  if (!topMoveSan) return null;

  const topMove = safeMove(node.state.fen, topMoveSan);
  if (!topMove) return null;

  const playedMove =
    node.parent &&
    node.state.move &&
    safeMove(node.parent.state.fen, node.state.move.san);

  const subjectiveEvaluation = getSubjectiveEvaluation(
    topLine.evaluation,
    adaptPieceColour(playedMove?.color || WHITE),
  );

  return {
    board: new Chess(node.state.fen),
    state: node.state,
    topLine,
    topMove,
    ...extractSecondTopMove(node, topLine),
    evaluation: topLine.evaluation,
    subjectiveEvaluation,
    playedMove,
  };
}

export function extractCurrentStateTreeNode(
  node: StateTreeNode,
): ExtractedCurrentNode | null {
  if (!node.parent) return null;

  const topLine = getTopEngineLine(node.state.engineLines);
  if (!topLine) return null;

  const topMoveSan = topLine.moves.at(0)?.san;

  const topMove = topMoveSan
    ? safeMove(node.state.fen, topMoveSan)
    : undefined;

  const playedMoveSan = node.state.move?.san;
  if (!playedMoveSan) return null;

  const playedMove = safeMove(node.parent.state.fen, playedMoveSan);
  if (!playedMove) return null;

  const subjectiveEvaluation = getSubjectiveEvaluation(
    topLine.evaluation,
    adaptPieceColour(playedMove?.color || WHITE),
  );

  return {
    board: new Chess(node.state.fen),
    state: node.state,
    topLine,
    topMove,
    ...extractSecondTopMove(node, topLine),
    evaluation: topLine.evaluation,
    subjectiveEvaluation,
    playedMove,
  };
}
