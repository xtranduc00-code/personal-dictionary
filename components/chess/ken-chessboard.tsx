"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import type { ChessboardOptions } from "react-chessboard";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => <KenChessboardSkeleton />,
  },
);

const DEFAULT_BOARD_STYLE: CSSProperties = {
  borderRadius: "12px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

/** Shown while the react-chessboard chunk loads (keep layout square). */
export function KenChessboardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        "aspect-square w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700"
      }
      aria-hidden
    />
  );
}

type Props = {
  options: ChessboardOptions;
  /** Optional wrapper class (e.g. h-full when parent constrains size). */
  className?: string;
  /**
   * When true, hide built-in square notation and draw a–h along the bottom always left→right
   * (react-chessboard mirrors file letters for `boardOrientation="black"`; this matches standard diagrams).
   */
  fixedEdgeNotation?: boolean;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/**
 * Shared dynamically loaded chessboard: avoids SSR, merges Ken default board chrome.
 */
/** Notation gutter sizes for the fixedEdgeNotation layout. */
const RANK_GUTTER = 16;  // left gutter (sm:w-4 = 16px)
const FILE_GUTTER = 24;  // bottom gutter (h-6 = 24px)

export function KenChessboard({ options, className, fixedEdgeNotation = true }: Props) {
  const { boardStyle, showNotation, boardOrientation = "white", ...rest } = options;

  // boardWidth is passed through options but not in the TS type (react-chessboard v5).
  const rawBoardWidth = (options as Record<string, unknown>).boardWidth as number | undefined;

  // When using edge notation, shrink the boardWidth so the rendered board
  // fits within the inset area (parent width minus the rank gutter).
  const effectiveBoardWidth = fixedEdgeNotation && typeof rawBoardWidth === "number"
    ? rawBoardWidth - RANK_GUTTER
    : rawBoardWidth;

  const merged = {
    ...rest,
    boardOrientation,
    boardWidth: effectiveBoardWidth,
    showNotation: fixedEdgeNotation ? false : (showNotation ?? true),
    boardStyle: { ...DEFAULT_BOARD_STYLE, ...boardStyle },
  } as ChessboardOptions;

  const ranks =
    boardOrientation === "white"
      ? (["8", "7", "6", "5", "4", "3", "2", "1"] as const)
      : (["1", "2", "3", "4", "5", "6", "7", "8"] as const);

  const board = (
    <div className="h-full w-full min-h-0 min-w-0">
      <Chessboard options={merged} />
    </div>
  );

  if (!fixedEdgeNotation) {
    return <div className={className ?? "w-full"}>{board}</div>;
  }

  // Outer wrapper is aspect-square at parent's width.
  // Board grid is inset: left by RANK_GUTTER, bottom by FILE_GUTTER.
  // The boardWidth sent to react-chessboard already accounts for the left gutter.
  return (
    <div className={`relative w-full max-w-full min-h-0 min-w-0 ${className ?? ""}`.trim()}
      style={{ aspectRatio: "1 / 1" }}
    >
      <div className="absolute left-4 right-0 top-0" style={{ bottom: `${FILE_GUTTER}px` }}>{board}</div>
      <div
        className="pointer-events-none absolute top-0 left-0 flex w-4 flex-col justify-around py-0.5 text-center text-[9px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 sm:text-[10px]"
        style={{ bottom: `${FILE_GUTTER}px` }}
        aria-hidden
      >
        {ranks.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div
        className="pointer-events-none absolute bottom-0 left-4 right-0 flex items-center justify-between px-0.5 text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 sm:text-[10px]"
        style={{ height: `${FILE_GUTTER}px` }}
        aria-hidden
      >
        {FILES.map((f) => (
          <span key={f} className="min-w-0 flex-1 text-center">
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
