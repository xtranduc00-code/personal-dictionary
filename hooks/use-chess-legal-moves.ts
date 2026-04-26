"use client";

import { useCallback, useRef, useState } from "react";
import type { Chess, Square } from "chess.js";

// ─── Chess.com-style legal move dot styles ───────────────────────────────────

const SELECTED_SQUARE_STYLE: React.CSSProperties = {
  background: "rgba(255, 255, 0, 0.4)",
};

const LEGAL_MOVE_DOT: React.CSSProperties = {
  background: "radial-gradient(circle, rgba(0,0,0,0.25) 25%, transparent 25%)",
  cursor: "pointer",
};

const LEGAL_CAPTURE_DOT: React.CSSProperties = {
  background: "radial-gradient(circle, transparent 51%, rgba(0,0,0,0.25) 51%)",
  cursor: "pointer",
};

// ─── Hook ────────────────────────────────────────────────────────────────────

type MoveHandler = (from: string, to: string) => boolean;

/**
 * Adds chess.com-style legal move indicators and click-to-move to any board.
 *
 * Usage:
 * ```
 * const { legalMoveStyles, handlers } = useChessLegalMoves(chessRef, handleMove);
 * // Merge legalMoveStyles into squareStyles
 * // Spread handlers into ChessBoardWrapper options
 * ```
 */
export function useChessLegalMoves(
  chessRef: React.RefObject<Chess>,
  makeMove: MoveHandler,
  /** Pass false to disable (e.g. during opponent turn) */
  enabled: boolean = true,
) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalSquares, setLegalSquares] = useState<
    Map<string, "move" | "capture">
  >(new Map());

  // Use ref to avoid stale closure issues with makeMove
  const makeMoveRef = useRef(makeMove);
  makeMoveRef.current = makeMove;

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setLegalSquares(new Map());
  }, []);

  const selectSquare = useCallback(
    (square: string) => {
      const chess = chessRef.current;
      if (!chess) return;

      const moves = chess.moves({ square: square as Square, verbose: true });
      if (moves.length === 0) {
        clearSelection();
        return;
      }

      setSelectedSquare(square);
      const map = new Map<string, "move" | "capture">();
      for (const m of moves) {
        map.set(m.to, m.captured ? "capture" : "move");
      }
      setLegalSquares(map);
    },
    [chessRef, clearSelection],
  );

  const onPieceClick = useCallback(
    ({ square }: { square: string | null }) => {
      if (!enabled || !square) return;
      const chess = chessRef.current;
      if (!chess) return;

      // If clicking the already selected square, deselect
      if (square === selectedSquare) {
        clearSelection();
        return;
      }

      // If clicking a legal target (capture own piece scenario won't happen - chess.js filters)
      if (selectedSquare && selectedSquare !== square && legalSquares.has(square)) {
        const ok = makeMoveRef.current(selectedSquare, square);
        clearSelection();
        if (ok) return;
      }

      // Select the new piece (only if it's the current player's piece)
      const piece = chess.get(square as Square);
      if (piece && piece.color === chess.turn()) {
        selectSquare(square);
      } else {
        clearSelection();
      }
    },
    [enabled, chessRef, selectedSquare, legalSquares, selectSquare, clearSelection],
  );

  const onSquareClick = useCallback(
    ({ square }: { square: string }) => {
      if (!enabled) return;
      if (!selectedSquare) return;

      if (selectedSquare !== square && legalSquares.has(square)) {
        makeMoveRef.current(selectedSquare, square);
        clearSelection();
      } else {
        // Clicked empty non-legal square → deselect
        clearSelection();
      }
    },
    [enabled, selectedSquare, legalSquares, clearSelection],
  );

  // Build squareStyles for dots
  const legalMoveStyles: Record<string, React.CSSProperties> = {};
  if (enabled && selectedSquare) {
    legalMoveStyles[selectedSquare] = SELECTED_SQUARE_STYLE;
    for (const [sq, type] of legalSquares) {
      legalMoveStyles[sq] = type === "capture" ? LEGAL_CAPTURE_DOT : LEGAL_MOVE_DOT;
    }
  }

  const handlers = {
    onPieceClick,
    onSquareClick,
  };

  return { legalMoveStyles, handlers, clearSelection, selectedSquare };
}
