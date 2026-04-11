"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// ─── Layout constants ────────────────────────────────────────────────────────
//
// All chess board pages (puzzle solve, puzzle rush, endgame trainer, opening
// trainer, etc.) share the same outer chrome — left aside, board, right aside,
// flush against each other inside a centered shell. Constants and the sizing
// hook live here so a single change updates every page.

// Unified sidebar widths. LEFT === RIGHT so every chess page is visually
// symmetrical — no more "wide left + narrow right" asymmetry. Changing the
// value here updates every page that uses BoardLayoutShell.
export const BOARD_SHELL_LEFT_W = 260;
export const BOARD_SHELL_RIGHT_W = 260;
/** Inner padding around the board on all four sides — gives breathing room. */
export const BOARD_SHELL_BOARD_PAD = 20;
/** Max combined shell width — matches the project-wide chess "board page" rule. */
export const BOARD_SHELL_COMBO_MAX = 1200;
export const BOARD_SHELL_BOARD_MAX =
  BOARD_SHELL_COMBO_MAX -
  BOARD_SHELL_LEFT_W -
  BOARD_SHELL_RIGHT_W -
  BOARD_SHELL_BOARD_PAD * 2; // 640
export const BOARD_SHELL_BOARD_MIN = 280;

type Props = {
  /** Left aside content. The aside is 280px wide; consumer manages padding. */
  left: ReactNode;
  /** Right aside content. The aside is 200px wide; consumer manages 16px padding. */
  right: ReactNode;
  /**
   * Render-prop receiving the computed square `boardEdge`. Pass it to your
   * `<ChessBoardWrapper forcedBoardWidth={edge}>` so the board fills the row.
   */
  children: (boardEdge: number) => ReactNode;
};

/**
 * Shared 3-column shell for chess board pages: [left aside | board | right aside].
 *
 * - Centered on the page (excludes the app sidebar via `min-w-0` parent flex)
 * - White / dark-zinc asides flush against the board (no gap, no individual borders)
 * - Single rounded outer card with shadow + ring
 * - Row height = boardEdge so all three columns share the same height
 * - boardEdge measured from the stage container (parent main column), not window
 */
export function BoardLayoutShell({ left, right, children }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [boardEdge, setBoardEdge] = useState(0);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => {
      const contentW = el.clientWidth;
      const contentH = el.clientHeight;
      if (contentW <= 0 || contentH <= 0) return;
      // Subtract the side panels and the board's surrounding padding so the
      // square board never touches the column edges.
      const availW =
        contentW -
        BOARD_SHELL_LEFT_W -
        BOARD_SHELL_RIGHT_W -
        BOARD_SHELL_BOARD_PAD * 2;
      const availH = contentH - BOARD_SHELL_BOARD_PAD * 2;
      const edge = Math.max(
        BOARD_SHELL_BOARD_MIN,
        Math.floor(
          Math.min(Math.max(0, availW), Math.max(0, availH), BOARD_SHELL_BOARD_MAX),
        ),
      );
      setBoardEdge(edge);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-hidden bg-zinc-100 dark:bg-[#1e1e1e]"
    >
      <div
        className="flex max-h-full shrink-0 flex-row overflow-hidden rounded-lg shadow-xl ring-1 ring-black/10 dark:shadow-2xl dark:ring-white/5"
        style={{
          width:
            boardEdge > 0
              ? BOARD_SHELL_LEFT_W +
                boardEdge +
                BOARD_SHELL_BOARD_PAD * 2 +
                BOARD_SHELL_RIGHT_W
              : undefined,
          height: boardEdge > 0 ? boardEdge + BOARD_SHELL_BOARD_PAD * 2 : undefined,
          maxWidth: `min(100%, ${BOARD_SHELL_COMBO_MAX}px)`,
        }}
      >
        <aside
          className="flex min-h-0 shrink-0 flex-col overflow-hidden bg-white dark:bg-[#262421]"
          style={{ width: BOARD_SHELL_LEFT_W }}
        >
          {left}
        </aside>

        <div
          className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center"
          style={{ padding: BOARD_SHELL_BOARD_PAD }}
        >
          {children(boardEdge)}
        </div>

        <aside
          className="flex min-h-0 shrink-0 flex-col overflow-hidden bg-white dark:bg-[#262421]"
          style={{
            width: BOARD_SHELL_RIGHT_W,
            minWidth: BOARD_SHELL_RIGHT_W,
            padding: 16,
          }}
        >
          {right}
        </aside>
      </div>
    </div>
  );
}
