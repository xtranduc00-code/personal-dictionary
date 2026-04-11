"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import type {
  ChessboardOptions,
  PieceRenderObject,
  SquareHandlerArgs,
} from "react-chessboard";
import { defaultPieces } from "react-chessboard";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => <KenChessboardSkeleton />,
  },
);

// ─── Theme ────────────────────────────────────────────────────────────────────
//
// Modern chess.com-style board: cream / green squares, framed with a thin dark
// border, CBurnett pieces (the same SVG set Lichess ships) lifted with a small
// drop-shadow so they read as physical pieces on the board.

const LIGHT_SQUARE_COLOR = "#EEEED2"; // classic cream
const DARK_SQUARE_COLOR = "#769656"; // chess.com green

const PIECE_DROP_SHADOW = "drop-shadow(1px 2px 3px rgba(0,0,0,0.4))";

// Hover overlays applied while a square is being targeted with the mouse.
const HOVER_DARK_SQUARE = "rgba(20, 85, 30, 0.5)";
const HOVER_LIGHT_SQUARE = "rgba(20, 85, 0, 0.3)";

const KEN_BOARD_STYLE: CSSProperties = {
  borderRadius: "4px",
  border: "2px solid #1f1f1f",
  boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
  overflow: "hidden",
};

const KEN_LIGHT_SQUARE_STYLE: CSSProperties = {
  backgroundColor: LIGHT_SQUARE_COLOR,
};
const KEN_DARK_SQUARE_STYLE: CSSProperties = {
  backgroundColor: DARK_SQUARE_COLOR,
};

// react-chessboard renders coordinate labels in the corner of each edge square
// — style them so they sit semi-transparent inside the board (chess.com look).
const KEN_DARK_NOTATION: CSSProperties = {
  color: "rgba(238, 238, 210, 0.78)",
  fontWeight: 600,
  fontSize: "10px",
};
const KEN_LIGHT_NOTATION: CSSProperties = {
  color: "rgba(118, 150, 86, 0.85)",
  fontWeight: 600,
  fontSize: "10px",
};

/** CBurnett SVG pieces (react-chessboard default set) wrapped with a drop-shadow. */
const SHADOWED_PIECES: PieceRenderObject = Object.fromEntries(
  Object.entries(defaultPieces as PieceRenderObject).map(([key, render]) => [
    key,
    (props?: { fill?: string; square?: string; svgStyle?: CSSProperties }) =>
      render({
        ...(props ?? {}),
        svgStyle: {
          ...(props?.svgStyle ?? {}),
          filter: PIECE_DROP_SHADOW,
        },
      }),
  ]),
) as PieceRenderObject;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Standard 8×8 chess board: a1 is dark. */
function isLightSquare(sq: string | null | undefined): boolean {
  if (!sq || sq.length < 2) return false;
  const file = sq.charCodeAt(0) - 97; // 'a' → 0
  const rank = parseInt(sq.slice(1), 10) - 1;
  if (Number.isNaN(rank) || file < 0 || file > 7) return false;
  return (file + rank) % 2 === 1;
}

const DEFAULT_BOARD_STYLE: CSSProperties = KEN_BOARD_STYLE;

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
   * Legacy: when true, hide built-in square notation and render rank/file
   * labels in external gutters (kept for callers that wanted file letters
   * always left→right regardless of orientation). New default uses the
   * chess.com style: notation drawn inside the corner edge squares.
   */
  fixedEdgeNotation?: boolean;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** Notation gutter sizes for the legacy fixedEdgeNotation layout. */
const RANK_GUTTER = 16; // left gutter (w-4 = 16px)
const FILE_GUTTER = 16; // bottom gutter — matches rank gutter to keep board square

export function KenChessboard({ options, className, fixedEdgeNotation = false }: Props) {
  const {
    boardStyle,
    showNotation,
    boardOrientation = "white",
    pieces,
    darkSquareStyle,
    lightSquareStyle,
    darkSquareNotationStyle,
    lightSquareNotationStyle,
    squareStyles,
    onMouseOverSquare,
    onMouseOutSquare,
    allowDragging,
    ...rest
  } = options;

  // Skip hover-state tracking entirely on read-only boards (no drag, no parent
  // mouse handlers). Hover highlights are an interaction affordance — for static
  // thumbnails / replay views they're just per-mousemove re-render churn.
  const enableHover =
    allowDragging !== false ||
    onMouseOverSquare != null ||
    onMouseOutSquare != null;

  // Hover overlay state — merged into squareStyles below.
  const [hoverSquare, setHoverSquare] = useState<string | null>(null);

  const handleMouseOver = useCallback(
    (args: SquareHandlerArgs) => {
      if (enableHover) setHoverSquare(args.square);
      onMouseOverSquare?.(args);
    },
    [enableHover, onMouseOverSquare],
  );

  const handleMouseOut = useCallback(
    (args: SquareHandlerArgs) => {
      if (enableHover) {
        setHoverSquare((prev) => (prev === args.square ? null : prev));
      }
      onMouseOutSquare?.(args);
    },
    [enableHover, onMouseOutSquare],
  );

  // Memoize the merged styles object so identical hover state doesn't allocate
  // a new reference on every parent re-render — react-chessboard treats a new
  // squareStyles object as a full diff and re-renders all 64 squares.
  const mergedSquareStyles = useMemo<Record<string, CSSProperties> | undefined>(
    () =>
      hoverSquare
        ? {
            ...(squareStyles ?? {}),
            [hoverSquare]: {
              ...(squareStyles?.[hoverSquare] ?? {}),
              backgroundColor: isLightSquare(hoverSquare)
                ? HOVER_LIGHT_SQUARE
                : HOVER_DARK_SQUARE,
            },
          }
        : squareStyles,
    [hoverSquare, squareStyles],
  );

  // boardWidth is passed through options but not in the TS type (react-chessboard v5).
  const rawBoardWidth = (options as Record<string, unknown>).boardWidth as number | undefined;

  // When using legacy edge notation, shrink the boardWidth so the rendered board
  // fits within the inset area (parent width minus the rank gutter).
  const effectiveBoardWidth =
    fixedEdgeNotation && typeof rawBoardWidth === "number"
      ? rawBoardWidth - RANK_GUTTER
      : rawBoardWidth;

  const merged = {
    ...rest,
    boardOrientation,
    boardWidth: effectiveBoardWidth,
    showNotation: fixedEdgeNotation ? false : (showNotation ?? true),
    pieces: pieces ?? SHADOWED_PIECES,
    darkSquareStyle: { ...KEN_DARK_SQUARE_STYLE, ...darkSquareStyle },
    lightSquareStyle: { ...KEN_LIGHT_SQUARE_STYLE, ...lightSquareStyle },
    darkSquareNotationStyle: { ...KEN_DARK_NOTATION, ...darkSquareNotationStyle },
    lightSquareNotationStyle: { ...KEN_LIGHT_NOTATION, ...lightSquareNotationStyle },
    boardStyle: { ...DEFAULT_BOARD_STYLE, ...boardStyle },
    squareStyles: mergedSquareStyles,
    onMouseOverSquare: handleMouseOver,
    onMouseOutSquare: handleMouseOut,
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

  // ── Legacy layout: external rank/file gutters ────────────────────────────
  // Outer wrapper is aspect-square at parent's width.
  // Board grid is inset: left by RANK_GUTTER, bottom by FILE_GUTTER.
  // The boardWidth sent to react-chessboard already accounts for the left gutter.
  return (
    <div
      className={`relative w-full max-w-full min-h-0 min-w-0 ${className ?? ""}`.trim()}
      style={{ aspectRatio: "1 / 1" }}
    >
      <div className="absolute left-4 right-0 top-0" style={{ bottom: `${FILE_GUTTER}px` }}>
        {board}
      </div>
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
