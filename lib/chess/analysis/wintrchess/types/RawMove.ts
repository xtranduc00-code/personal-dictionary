// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Square, PieceSymbol, Color, Move } from "chess.js";

export interface RawMove {
  piece: PieceSymbol;
  color: Color;
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export function toRawMove(move: Move): RawMove {
  return {
    piece: move.piece,
    color: move.color,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
  };
}
