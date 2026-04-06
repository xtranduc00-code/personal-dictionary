import type { Chess, Move } from "chess.js";

/** Uses chess.js Move helpers so castle, en passant, and promotion are announced correctly. */

const PIECE_NAME: Record<string, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

const PROMO_NAME: Record<string, string> = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
};

function checkSuffix(chess: Chess): string {
  if (chess.isCheckmate()) return ", checkmate!";
  if (chess.isCheck()) return ", check!";
  return "";
}

/** Natural English line for a move already applied to `chessAfter`. */
export function announcementForPlayedMove(move: Move, chessAfter: Chess): string {
  const suffix = checkSuffix(chessAfter);

  if (move.isKingsideCastle()) return `Kingside castle${suffix}`;
  if (move.isQueensideCastle()) return `Queenside castle${suffix}`;
  if (move.isEnPassant()) return `Pawn takes en passant${suffix}`;
  if (move.isPromotion()) {
    const rank = PROMO_NAME[move.promotion ?? "q"] ?? "Queen";
    return `Pawn promotes to ${rank}${suffix}`;
  }

  const piece = PIECE_NAME[move.piece] ?? "Piece";
  if (move.isCapture()) {
    return `${piece} takes ${move.to}${suffix}`;
  }
  return `${piece} to ${move.to}${suffix}`;
}

/** Last move on the board (if any). */
export function announcementFromChess(chess: Chess): string {
  const hist = chess.history({ verbose: true }) as Move[];
  const m = hist[hist.length - 1];
  if (!m) return "";
  return announcementForPlayedMove(m, chess);
}
