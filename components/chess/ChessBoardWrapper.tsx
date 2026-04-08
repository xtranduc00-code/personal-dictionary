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
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth, 480)));
}

/** Puzzle solve: matches compact sidebar + gap-3/4 + max-w-6xl shell (skeleton / fallback only). */
export function computePuzzleSolveChessBoardSize(): number {
  if (typeof window === "undefined") return 400;
  const sidebarW = window.innerWidth < 640 ? 184 : window.innerWidth >= 1024 ? 224 : 208;
  const shellW = Math.min(window.innerWidth, 1152);
  const gap = 14;
  const hPad = 22;
  const fromHeight = window.innerHeight - 40;
  const fromWidth = shellW - sidebarW - gap - hPad;
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth, 560)));
}

/** Puzzle Rush: left sidebar ~180px, board fills rest. */
export function computeRushChessBoardSize(): number {
  if (typeof window === "undefined") return 400;
  const sidebarW = window.innerWidth < 640 ? 128 : 180;
  const fromHeight = window.innerHeight - 48;
  const fromWidth = window.innerWidth - sidebarW - 24;
  return Math.max(220, Math.floor(Math.min(fromHeight, fromWidth, 480)));
}

/**
 * Endgame trainer: left sidebar ~200px, board fills rest.
 */
export function computeEndgameChessBoardSize(): number {
  if (typeof window === "undefined") return 440;
  const sidebarW = window.innerWidth < 640 ? 208 : 256;
  const fromHeight = window.innerHeight - 48;
  const fromWidth = window.innerWidth - sidebarW - 24;
  return Math.max(300, Math.floor(Math.min(fromHeight, fromWidth, 480)));
}

/**
 * Opening trainer practice: left sidebar ~256px, board fills rest.
 */
export function computeOpeningChessBoardSize(): number {
  if (typeof window === "undefined") return 360;
  const sidebarW = window.innerWidth < 640 ? 208 : 256;
  const fromHeight = window.innerHeight - 48;
  const fromWidth = window.innerWidth - sidebarW - 24;
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth, 480)));
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
  /**
   * When false, size uses only `forcedBoardWidth` (>0); otherwise shows skeleton until set.
   * Use for layouts that measure the board stage (e.g. puzzle solve) instead of the window preset.
   */
  useViewportSizeFallback?: boolean;
};

/**
 * Single shared board shell: size from viewport preset and/or forced width.
 */
export function ChessBoardWrapper({
  options,
  className,
  fixedEdgeNotation = true,
  sizePreset = "default",
  forcedBoardWidth,
  useViewportSizeFallback = true,
}: ChessBoardWrapperProps) {
  const presetSize = useChessBoardSize(sizePreset);
  const boardSize =
    typeof forcedBoardWidth === "number" && forcedBoardWidth > 0
      ? Math.floor(forcedBoardWidth)
      : useViewportSizeFallback
        ? presetSize
        : 0;

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
      style={{ width: boardSize, height: boardSize, maxWidth: "100%", maxHeight: "100%", flexShrink: 1 }}
    >
      <KenChessboard
        className="h-full w-full"
        fixedEdgeNotation={fixedEdgeNotation}
        options={optionsWithBoardWidth}
      />
    </div>
  );
}
