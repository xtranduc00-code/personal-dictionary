/**
 * Chess section design tokens.
 *
 * The chess section has one accent family: green. Every primary action,
 * selected state, soft surface, focus ring, and brand highlight derives
 * from these constants. Tailwind's `emerald-*` palette is the closest
 * built-in match to the brand `#769656` and is used for soft surfaces
 * (backgrounds, borders, text) via Tailwind utility classes — see the
 * sweep below. The exact hex constants here are for inline `style` cases
 * where a specific value matters (button bg, board square accent, etc.).
 *
 * Mapping from semantic role → value:
 *
 *   primary           → #769656   (chess.com-style brand green)
 *   primary-hover     → #5d8a4e   (slightly darker)
 *   primary-active    → #4d7c3f   (pressed)
 *   primary-soft-bg   → rgba(118,150,86,0.12)
 *   primary-soft-bdr  → rgba(118,150,86,0.35)
 *
 *   board-light       → #EEEED2   (board light squares)
 *   board-dark        → #4a7c3f   (board dark squares — slightly darker than primary for contrast)
 *
 *   page-bg-dark      → #1e1e1e   (chess page bg in dark mode)
 *   panel-bg-dark     → #262421   (chess panel bg in dark mode)
 *
 * For Tailwind utility classes, use the emerald-* family for the soft
 * accents (selected list rows, soft pills, focus rings, helper text).
 * Reserve `text-emerald-600 / bg-emerald-50 / border-emerald-200` etc.
 * for chess UI; do not mix with other accent hues like violet/purple.
 */

export const CHESS_PRIMARY = "#769656";
export const CHESS_PRIMARY_HOVER = "#5d8a4e";
export const CHESS_PRIMARY_ACTIVE = "#4d7c3f";

export const CHESS_PRIMARY_SOFT_BG = "rgba(118,150,86,0.12)";
export const CHESS_PRIMARY_SOFT_BORDER = "rgba(118,150,86,0.35)";

export const CHESS_BOARD_LIGHT = "#EEEED2";
export const CHESS_BOARD_DARK = "#4a7c3f";

export const CHESS_PAGE_BG_DARK = "#1e1e1e";
export const CHESS_PANEL_BG_DARK = "#262421";

// ─── Design system tokens ────────────────────────────────────────────────────
//
// Semantic Tailwind class bundles used by the chess section so every page
// renders the same way. Import these instead of hand-rolling button/card/label
// classes in each component — when you want to change the brand, edit here.

/** Section-label eyebrow ("PUZZLE", "OPENING", "SCORE", etc.). */
export const CHESS_LABEL_CLS =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500";

/** Page title inside a sidebar ("Italian Game", "Puzzle #00mJY"). */
export const CHESS_SIDEBAR_TITLE_CLS =
  "text-lg font-black tracking-tight leading-tight text-zinc-900 dark:text-zinc-50";

/** Body text inside a sidebar card. */
export const CHESS_BODY_CLS =
  "text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200";

/** Mono body (FEN, move lists, etc.). */
export const CHESS_MONO_CLS =
  "font-mono text-[13px] leading-5 tabular-nums text-zinc-700 dark:text-zinc-200";

/** Primary action button — solid chess-green. */
export const CHESS_BTN_PRIMARY_CLS =
  "flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400";

/** Secondary action button — bordered neutral. */
export const CHESS_BTN_SECONDARY_CLS =
  "flex items-center justify-center gap-2 rounded-lg border border-zinc-300/70 bg-zinc-100/80 px-3 py-2.5 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-200/80 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700";

/** Ghost (tertiary) button — transparent with border. */
export const CHESS_BTN_GHOST_CLS =
  "flex items-center justify-center gap-2 rounded-lg border border-zinc-300/70 bg-transparent px-3 py-2.5 text-[13px] font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";
