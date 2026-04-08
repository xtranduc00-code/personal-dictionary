"use client";

import { useLayoutEffect, useState } from "react";
import type { ChessboardOptions } from "react-chessboard";
import { KenChessboard, KenChessboardSkeleton } from "@/components/chess/ken-chessboard";

// All board modes now use sidebar-left + board-right layout with no top header bar.

export function computeChessBoardSize(): number {
  if (typeof window === "undefined") return 400;
  // Play game: board + player rows (2×40) + gaps + padding
  const fromHeight = window.innerHeight - 40 * 2 - 48 - 24;
  const fromWidth = window.innerWidth >= 1024
    ? window.innerWidth - 320 - 32
    : window.innerWidth - 24;
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth, 560)));
}

/**
 * Puzzle solve: info sidebar on LEFT (~224px), board fills the rest on the right.
 */
export function computePuzzleSolveChessBoardSize(): number {
  if (typeof window === "undefined") return 400;
  const sidebarW = window.innerWidth < 640 ? 192 : 224;
  const fromHeight = window.innerHeight - 48;
  const fromWidth = window.innerWidth - sidebarW - 24;
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth, 560)));
}

/** Puzzle Rush: left sidebar ~180px, board fills rest. */
export function computeRushChessBoardSize(): number {
  if (typeof window === "undefined") return 400;
  const sidebarW = window.innerWidth < 640 ? 128 : 180;
  const fromHeight = window.innerHeight - 48;
  const fromWidth = window.innerWidth - sidebarW - 24;
  return Math.max(220, Math.floor(Math.min(fromHeight, fromWidth, 560)));
}

/**
 * Endgame trainer: left sidebar ~200px, board fills rest.
 */
export function computeEndgameChessBoardSize(): number {
  if (typeof window === "undefined") return 440;
  const sidebarW = window.innerWidth < 640 ? 160 : 200;
  const fromHeight = window.innerHeight - 48;
  const fromWidth = window.innerWidth - sidebarW - 24;
  return Math.max(300, Math.floor(Math.min(fromHeight, fromWidth, 560)));
}

/**
 * Opening trainer practice: left sidebar ~192px, board fills rest.
 */
export function computeOpeningChessBoardSize(): number {
  if (typeof window === "undefined") return 360;
  const sidebarW = window.innerWidth < 640 ? 160 : 192;
  const fromHeight = window.innerHeight - 48;
  const fromWidth = window.innerWidth - sidebarW - 24;
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth, 540)));
}

/** Kept for backward compat — same as opening. */
export function computeOpeningExploreChessBoardSize(): number {
  return computeOpeningChessBoardSize();
}

// Legacy constants — kept for components that still reference them.
export const HEADER_HEIGHT = 0;
export const PLAYER_ROW_HEIGHT = 40;
export const PADDING = 24;

export type ChessBoardSizePreset =
  | "default"
  | "rush"
  | "endgame"
  | "opening"
  | "openingExplore"
  | "puzzleSolve";

export function computeBoardSizeForPreset(preset: ChessBoardSizePreset): number {
  if (preset === "rush") return computeRushChessBoardSize();
  if (preset === "endgame") return computeEndgameChessBoardSize();
  if (preset === "openingExplore") return computeOpeningExploreChessBoardSize();
  if (preset === "opening") return computeOpeningChessBoardSize();
  if (preset === "puzzleSolve") return computePuzzleSolveChessBoardSize();
  return computeChessBoardSize();
}

/** Viewport-based size only; ignores parent/sibling layout. */
export function useChessBoardSize(preset: ChessBoardSizePreset = "default"): number {
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const sync = () => setSize(computeBoardSizeForPreset(preset));
    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [preset]);
  return size;
}

type ChessBoardWrapperProps = {
  options: ChessboardOptions;
  /** Applied to the fixed-size outer box (e.g. rounded-xl, rings). */
  className?: string;
  fixedEdgeNotation?: boolean;
  /** Preset-specific viewport budget (still square, window resize only). */
  sizePreset?: ChessBoardSizePreset;
  /** Square edge length; caps preset when the board must fit a narrow column. */
  forcedBoardWidth?: number;
};

/**
 * Single shared board shell: size from viewport formula only (mount + window resize).
 */
export function ChessBoardWrapper({
  options,
  className,
  fixedEdgeNotation = true,
  sizePreset = "default",
  forcedBoardWidth,
}: ChessBoardWrapperProps) {
  const presetSize = useChessBoardSize(sizePreset);
  const boardSize =
    typeof forcedBoardWidth === "number" && forcedBoardWidth > 0
      ? Math.floor(forcedBoardWidth)
      : presetSize;

  if (boardSize <= 0) {
    return <KenChessboardSkeleton className={className ?? "rounded-xl"} />;
  }

  const optionsWithBoardWidth = {
    ...options,
    boardWidth: boardSize,
  } as ChessboardOptions;

  return (
    <div
      className={className}
      style={{ width: boardSize, height: boardSize, maxWidth: "100%", maxHeight: "100%" }}
    >
      <KenChessboard
        className="h-full w-full"
        fixedEdgeNotation={fixedEdgeNotation}
        options={optionsWithBoardWidth}
      />
    </div>
  );
}
