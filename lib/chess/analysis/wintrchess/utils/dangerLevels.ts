// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Chess, Move, QUEEN } from "chess.js";
import { differenceWith, isEqual } from "lodash-es";

import type { BoardPiece } from "../types/BoardPiece";
import type { RawMove } from "../types/RawMove";
import { pieceValues } from "../constants/pieces";
import { PieceColour, adaptPieceColour } from "../constants/PieceColour";
import { parseSanMove } from "../chess-utils";
import { getUnsafePieces } from "./pieceSafety";
import { getAttackingMoves } from "./attackers";

function relativeUnsafePieceAttacks(
  actionBoard: Chess,
  threatenedPiece: BoardPiece,
  colour: PieceColour,
  playedMove?: Move,
) {
  return getUnsafePieces(actionBoard, colour, playedMove)
    .filter(
      (unsafePiece) =>
        unsafePiece.square != threatenedPiece.square &&
        pieceValues[unsafePiece.type] >= pieceValues[threatenedPiece.type],
    )
    .map((unsafePiece) => getAttackingMoves(actionBoard, unsafePiece, false))
    .reduce((acc, val) => acc.concat(val), []);
}

export function moveCreatesGreaterThreat(
  board: Chess,
  threatenedPiece: BoardPiece,
  actingMove: RawMove,
) {
  const actionBoard = new Chess(board.fen());

  const previousRelativeAttacks = relativeUnsafePieceAttacks(
    actionBoard,
    threatenedPiece,
    adaptPieceColour(actingMove.color),
  );

  let bakedMove: Move;
  try {
    bakedMove = actionBoard.move(actingMove as never);
  } catch {
    return false;
  }

  const relativeAttacks = relativeUnsafePieceAttacks(
    actionBoard,
    threatenedPiece,
    adaptPieceColour(actingMove.color),
    bakedMove,
  );

  const newRelativeAttacks = differenceWith(
    relativeAttacks,
    previousRelativeAttacks,
    isEqual,
  );

  if (newRelativeAttacks.length > 0) return true;

  const lowValueCheckmatePin =
    pieceValues[threatenedPiece.type] < pieceValues[QUEEN] &&
    actionBoard.moves().some((move) => parseSanMove(move).checkmate);

  return lowValueCheckmatePin;
}

export function moveLeavesGreaterThreat(
  board: Chess,
  threatenedPiece: BoardPiece,
  actingMove: RawMove,
) {
  const actionBoard = new Chess(board.fen());

  try {
    actionBoard.move(actingMove as never);
  } catch {
    return false;
  }

  const relativeAttacks = relativeUnsafePieceAttacks(
    actionBoard,
    threatenedPiece,
    adaptPieceColour(actingMove.color),
  );

  if (relativeAttacks.length > 0) return true;

  const lowValueCheckmatePin =
    pieceValues[threatenedPiece.type] < pieceValues[QUEEN] &&
    actionBoard.moves().some((move) => parseSanMove(move).checkmate);

  return lowValueCheckmatePin;
}

export function hasDangerLevels(
  board: Chess,
  threatenedPiece: BoardPiece,
  actingMoves: RawMove[],
  equalityStrategy: "creates" | "leaves" = "leaves",
) {
  return actingMoves.every((actingMove) =>
    equalityStrategy == "creates"
      ? moveCreatesGreaterThreat(board, threatenedPiece, actingMove)
      : moveLeavesGreaterThreat(board, threatenedPiece, actingMove),
  );
}
