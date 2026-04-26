// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Chess, Move, PAWN, KNIGHT, ROOK, KING } from "chess.js";
import { minBy } from "lodash-es";

import {
  type BoardPiece,
  getBoardPieces,
  toBoardPiece,
} from "../types/BoardPiece";
import PieceColour, { adaptPieceColour } from "../constants/PieceColour";
import { pieceValues } from "../constants/pieces";
import { getAttackingMoves } from "./attackers";
import { getDefendingMoves } from "./defenders";

export function isPieceSafe(
  board: Chess,
  piece: BoardPiece,
  playedMove?: Move,
) {
  const directAttackers = getAttackingMoves(board, piece, false).map(
    toBoardPiece,
  );

  const attackers = getAttackingMoves(board, piece).map(toBoardPiece);
  const defenders = getDefendingMoves(board, piece).map(toBoardPiece);

  if (
    playedMove?.captured &&
    piece.type == ROOK &&
    pieceValues[playedMove.captured] == pieceValues[KNIGHT] &&
    attackers.length == 1 &&
    defenders.length > 0 &&
    pieceValues[attackers[0].type] == pieceValues[KNIGHT]
  )
    return true;

  const hasLowerValueAttacker = directAttackers.some(
    (attacker) => pieceValues[attacker.type] < pieceValues[piece.type],
  );

  if (hasLowerValueAttacker) return false;

  if (attackers.length <= defenders.length) return true;

  const lowestValueAttacker = minBy(
    directAttackers,
    (attacker) => pieceValues[attacker.type],
  );

  if (!lowestValueAttacker) return true;

  if (
    pieceValues[piece.type] < pieceValues[lowestValueAttacker.type] &&
    defenders.some(
      (defender) =>
        pieceValues[defender.type] < pieceValues[lowestValueAttacker.type],
    )
  )
    return true;

  if (defenders.some((defender) => defender.type == PAWN)) return true;

  return false;
}

export function getUnsafePieces(
  board: Chess,
  colour: PieceColour,
  playedMove?: Move,
) {
  const capturedPieceValue = playedMove?.captured
    ? pieceValues[playedMove.captured]
    : 0;

  return getBoardPieces(board).filter(
    (piece) =>
      piece?.color == adaptPieceColour(colour) &&
      piece.type != PAWN &&
      piece.type != KING &&
      pieceValues[piece.type] > capturedPieceValue &&
      !isPieceSafe(board, piece, playedMove),
  );
}
