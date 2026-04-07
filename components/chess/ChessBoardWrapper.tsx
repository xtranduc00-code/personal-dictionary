"use client";

import { useLayoutEffect, useState } from "react";
import type { ChessboardOptions } from "react-chessboard";
import { KenChessboard, KenChessboardSkeleton } from "@/components/chess/ken-chessboard";

/** Workspace “Room / Puzzle …” bar — must match chess-workspace header row. */
export const HEADER_HEIGHT = 56;
/** Single control strip (timers, player row, etc.) reserved below header. */
export const PLAYER_ROW_HEIGHT = 48;
/** Combined outer padding (page / shell) budget for sizing. */
export const PADDING = 32;

export function computeChessBoardSize(): number {
  if (typeof window === "undefined") return 400;
  // Reserve space for header, player rows (top+bottom), clocks, and padding
  const fromHeight = window.innerHeight - HEADER_HEIGHT - PLAYER_ROW_HEIGHT * 2 - PADDING - 24;
  // On large screens, subtract the side panel (~300px); on small, use most of the width
  const fromWidth = window.innerWidth >= 1024
    ? window.innerWidth - 320 - 48
    : window.innerWidth - 32;
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth, 560)));
}

/**
 * Puzzle solve (library): 2-col layout — board left, info panel right (~22rem).
 * Board should feel balanced, not dominate.
 */
export function computePuzzleSolveChessBoardSize(): number {
  if (typeof window === "undefined") return 380;
  const reserved = HEADER_HEIGHT + PADDING + 56; // header + padding + board chrome
  const fromHeight = window.innerHeight - reserved;
  // Subtract side panel (~22rem = 352px) + gaps/padding
  const sidePanel = 360;
  const availW = window.innerWidth >= 1024
    ? window.innerWidth - sidePanel - 64
    : window.innerWidth - 32;
  const fromWidth = Math.min(availW, 480);
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth)));
}

/** Puzzle Rush: single-column layout — workspace header + HUD + YOUR MOVE chip + board + bottom pad. */
export function computeRushChessBoardSize(): number {
  if (typeof window === "undefined") return 400;
  // Reserve: workspace header(56) + HUD bar(~110) + YOUR MOVE chip(~48) + bottom(32) + padding(24)
  const reserved = 56 + 110 + 48 + 32 + 24;
  const fromHeight = window.innerHeight - reserved;
  const fromWidth = window.innerWidth - 48;
  return Math.max(220, Math.floor(Math.min(fromHeight, fromWidth, 480)));
}

/** Endgame trainer: large central board; reserves toolbar, objective strip, stats, announce chip. */
const ENDGAME_TOP_RESERVE = 60;
const ENDGAME_BELOW_BOARD_RESERVE = 48;
const ENDGAME_PAGE_PADDING = 24;
/** Endgame lesson: 2-col layout — sidebar is ~320px on large screens. */
const ENDGAME_SIDEBAR = 320;

export function computeEndgameChessBoardSize(): number {
  if (typeof window === "undefined") return 440;
  const fromHeight =
    window.innerHeight -
    HEADER_HEIGHT -
    ENDGAME_TOP_RESERVE -
    ENDGAME_BELOW_BOARD_RESERVE -
    ENDGAME_PAGE_PADDING;
  // On large screens, subtract sidebar from available width
  const availW = window.innerWidth >= 1024
    ? window.innerWidth - ENDGAME_SIDEBAR - 64
    : window.innerWidth - 32;
  const fromWidth = Math.min(availW, 520);
  return Math.max(300, Math.floor(Math.min(fromHeight, fromWidth)));
}

/** Opening trainer (practice): room for feedback, stats, and move list below the board. */
const OPENING_TAB_ROW = 52;
const OPENING_BELOW_BOARD = 108;
const OPENING_PAGE_PADDING = 32;
const OPENING_WIDTH_FRACTION = 0.58;

export function computeOpeningChessBoardSize(): number {
  if (typeof window === "undefined") return 360;
  const fromHeight =
    window.innerHeight -
    HEADER_HEIGHT -
    PLAYER_ROW_HEIGHT -
    PADDING -
    OPENING_TAB_ROW -
    OPENING_BELOW_BOARD -
    OPENING_PAGE_PADDING;
  const fromWidth = window.innerWidth * OPENING_WIDTH_FRACTION;
  return Math.max(200, Math.floor(Math.min(fromHeight, fromWidth)));
}

/** Explore layout: board sits beside a ~380px sidebar — width must subtract sidebar. */
const OPENING_EXPLORE_BELOW_BOARD = 72;
const OPENING_EXPLORE_SIDEBAR = 380;

export function computeOpeningExploreChessBoardSize(): number {
  if (typeof window === "undefined") return 380;
  const fromHeight =
    window.innerHeight -
    HEADER_HEIGHT -
    PLAYER_ROW_HEIGHT -
    PADDING -
    OPENING_TAB_ROW -
    OPENING_EXPLORE_BELOW_BOARD -
    OPENING_PAGE_PADDING;
  // On large screens, subtract the sidebar width from the viewport
  const availW = window.innerWidth >= 1024
    ? window.innerWidth - OPENING_EXPLORE_SIDEBAR - 64
    : window.innerWidth - 48;
  const fromWidth = Math.min(availW, 560);
  return Math.max(280, Math.floor(Math.min(fromHeight, fromWidth)));
}

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
 * react-chessboard v5 has no typed `boardWidth`; we pass it through for forward-compat and set a fixed pixel box.
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
      style={{ width: boardSize, height: boardSize, maxWidth: "100%" }}
    >
      <KenChessboard
        className="h-full w-full"
        fixedEdgeNotation={fixedEdgeNotation}
        options={optionsWithBoardWidth}
      />
    </div>
  );
}
