// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import {
  PieceSymbol,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
} from "chess.js";

export const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const pieceNames: Record<PieceSymbol, string> = {
  [PAWN]: "Pawn",
  [KNIGHT]: "Knight",
  [BISHOP]: "Bishop",
  [ROOK]: "Rook",
  [QUEEN]: "Queen",
  [KING]: "King",
};

export const pieceValues: Record<PieceSymbol, number> = {
  [PAWN]: 1,
  [KNIGHT]: 3,
  [BISHOP]: 3,
  [ROOK]: 5,
  [QUEEN]: 9,
  [KING]: Infinity,
};
