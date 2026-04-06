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
};

/**
 * Shared dynamically loaded chessboard: avoids SSR, merges Ken default board chrome.
 */
export function KenChessboard({ options, className }: Props) {
  const { boardStyle, ...rest } = options;
  const merged: ChessboardOptions = {
    ...rest,
    boardStyle: { ...DEFAULT_BOARD_STYLE, ...boardStyle },
  };
  return (
    <div className={className ?? "w-full"}>
      <Chessboard options={merged} />
    </div>
  );
}
