// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Chess, Square, PieceSymbol, Color } from "chess.js";

import type { RawMove } from "./RawMove";

export interface BoardPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

export function getBoardPieces(board: Chess): BoardPiece[] {
  return board
    .board()
    .reduce((acc, val) => acc.concat(val))
    .filter((piece): piece is BoardPiece => !!piece);
}

export function toBoardPiece(move: RawMove): BoardPiece {
  return { ...move, type: move.piece, square: move.from };
}
