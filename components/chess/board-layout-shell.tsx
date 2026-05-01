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
  /** Optional tab labels for small screens. */
  leftLabel?: string;
  rightLabel?: string;
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
export function BoardLayoutShell({
  left,
  right,
  leftLabel = "Controls",
  rightLabel = "Info",
  children,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mobileBoardRef = useRef<HTMLDivElement>(null);
  const [boardEdge, setBoardEdge] = useState(0);
  const [mode, setMode] = useState<"desktop" | "stacked">("desktop");
  const [tab, setTab] = useState<"left" | "right">("left");

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const getNextMode = () => (window.innerWidth >= 1024 ? "desktop" : "stacked");

    const syncMode = () => {
      const next = getNextMode();
      setMode(next);
    };

    const syncBoard = () => {
      const curMode = getNextMode();
      const boardHost = curMode === "desktop" ? stageRef.current : mobileBoardRef.current;
      if (!boardHost) return;
      const contentW = boardHost.clientWidth;
      const contentH = boardHost.clientHeight;
      if (contentW <= 0 || contentH <= 0) return;

      if (curMode === "desktop") {
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
            Math.min(
              Math.max(0, availW),
              Math.max(0, availH),
              BOARD_SHELL_BOARD_MAX,
            ),
          ),
        );
        setBoardEdge(edge);
        return;
      }

      // Stacked layout: board is above the panel; use full width of its host.
      const edge = Math.max(
        BOARD_SHELL_BOARD_MIN,
        Math.floor(Math.min(contentW - BOARD_SHELL_BOARD_PAD * 2, contentH - BOARD_SHELL_BOARD_PAD * 2)),
      );
      setBoardEdge(edge);
    };

    sync();

    // Back-compat: keep initial behavior with a single call.
    function sync() {
      syncMode();
      syncBoard();
    }

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (mobileBoardRef.current) ro.observe(mobileBoardRef.current);
    window.visualViewport?.addEventListener("resize", sync);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-hidden bg-zinc-100 dark:bg-[#1e1e1e]"
    >
      {mode === "desktop" ? (
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
      ) : (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
          <div
            ref={mobileBoardRef}
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
            style={{ padding: BOARD_SHELL_BOARD_PAD }}
          >
            {children(boardEdge)}
          </div>

          <div className="shrink-0 border-t border-zinc-200/70 bg-white dark:border-zinc-700/50 dark:bg-[#262421]">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setTab("left")}
                className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                  tab === "left"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {leftLabel}
              </button>
              <button
                type="button"
                onClick={() => setTab("right")}
                className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                  tab === "right"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {rightLabel}
              </button>
            </div>

            {/* Single scroll region to avoid nested-scroll hiding actions (Hint, Give up, etc.). */}
            <div className="h-[40vh] min-h-[180px] max-h-[420px] overflow-hidden sm:h-[36vh]">
              <div className={tab === "left" ? "block h-full" : "hidden"}>
                <div className="h-full overflow-y-auto overscroll-y-contain">{left}</div>
              </div>
              <div className={tab === "right" ? "block h-full" : "hidden"}>
                <div className="h-full overflow-y-auto overscroll-y-contain p-4">{right}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
