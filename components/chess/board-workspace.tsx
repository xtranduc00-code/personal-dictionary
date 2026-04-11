"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import {
  CHESS_LABEL_CLS,
  CHESS_SIDEBAR_TITLE_CLS,
  CHESS_BTN_PRIMARY_CLS,
  CHESS_BTN_SECONDARY_CLS,
  CHESS_BTN_GHOST_CLS,
} from "./chess-theme";

/**
 * Board Workspace primitives.
 *
 * The chess section has many pages built around the same 3-column shell:
 *   [left sidebar]  [center board]  [right sidebar]
 *
 * `BoardLayoutShell` already provides the outer 3-column container.
 * The pieces in this file standardize the *contents* of those sidebars so
 * every page using the layout shares one rhythm, one hierarchy, and one
 * feedback palette.
 *
 *   <BoardLayoutShell
 *     left={
 *       <BoardSidebar>
 *         <SidebarHeader back={onBack} title="Puzzle #00sd6" />
 *         <SidebarObjective playerColor="white" />
 *         <SidebarMetaRow>{badges}</SidebarMetaRow>
 *         <SidebarSection label="Progress">…</SidebarSection>
 *         <FeedbackPanel variant="hint">…</FeedbackPanel>
 *         <SidebarActions>…</SidebarActions>
 *       </BoardSidebar>
 *     }
 *     right={…}
 *   >
 *     {(boardEdge) => <ChessBoardWrapper forcedBoardWidth={boardEdge} … />}
 *   </BoardLayoutShell>
 *
 * Vertical rhythm: every section auto-spaces with `space-y-4` from the
 * BoardSidebar wrapper. Consumers don't need to manage their own gaps.
 */

// ─── BoardSidebar — root wrapper ────────────────────────────────────────────
//
// Standard padding (16px), vertical scroll, and a flex column with consistent
// section spacing. Use it as the direct child of `BoardLayoutShell.left`
// (or `.right`).
export function BoardSidebar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

// ─── SidebarHeader — back button + title row ────────────────────────────────
//
// Sits at the top of the sidebar. Title is small + muted-uppercase since the
// dominant heading on these pages is the playable objective, not the title.
export function SidebarHeader({
  back,
  title,
}: {
  back?: () => void;
  title?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {back ? (
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-1 rounded-md text-[11px] font-medium text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden /> Back
        </button>
      ) : null}
      {title ? (
        <span className="ml-auto truncate text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {title}
        </span>
      ) : null}
    </div>
  );
}

// ─── SidebarObjective — the dominant heading on board pages ─────────────────
//
// "Find best move for White/Black" or any other page-specific objective.
// Uses a soft pill background tinted by the player color so the heading also
// communicates whose turn it is at a glance.
export function SidebarObjective({
  playerColor,
  children,
}: {
  playerColor?: "white" | "black";
  children?: ReactNode;
}) {
  if (children == null && playerColor == null) return null;

  const isBlack = playerColor === "black";
  return (
    <div
      className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
        isBlack
          ? "bg-zinc-900/[0.08] text-zinc-900 dark:bg-zinc-100/10 dark:text-zinc-100"
          : "border border-zinc-300 bg-white text-zinc-800 dark:border-zinc-600 dark:bg-zinc-100/90 dark:text-zinc-900"
      }`}
    >
      {playerColor ? (
        <span
          aria-hidden
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            isBlack
              ? "bg-zinc-900 ring-1 ring-zinc-700"
              : "bg-white ring-1 ring-zinc-400"
          }`}
        />
      ) : null}
      {children ??
        `Find best move for ${isBlack ? "Black" : "White"}`}
    </div>
  );
}

// ─── SidebarMetaRow — small pill metadata ───────────────────────────────────
//
// Difficulty tag, rating, themes — secondary info that should never compete
// with the objective heading.
export function SidebarMetaRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center gap-1.5 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

// ─── SidebarSection — labeled content block ─────────────────────────────────
//
// One labeled section in the sidebar. The label uses the standard tracked
// uppercase muted style; children are the section body.
export function SidebarSection({
  label,
  children,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`shrink-0 ${className}`.trim()}>
      {label ? (
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
          {label}
        </p>
      ) : null}
      <div className={label ? "mt-2" : ""}>{children}</div>
    </div>
  );
}

// ─── FeedbackPanel — instructional state messaging ──────────────────────────
//
// Variants are intentionally NOT mapped onto destructive colors. A puzzle
// "wrong move" is a coaching event, not a system error — it uses amber, not
// red. Genuine errors (network failure, etc.) can use the rare `error` variant
// which is the only one that uses the harsh red palette.
//
//   info     → neutral zinc, used for tips / context
//   hint     → soft amber, used for "Show hint" content
//   success  → soft emerald, used for "Solved!" / correct
//   warning  → softer amber/orange, used for "Not the best move" coaching
//   error    → red, reserved for real failures
type FeedbackVariant = "info" | "hint" | "success" | "warning" | "error";

const FEEDBACK_VARIANT_CLASSES: Record<FeedbackVariant, string> = {
  info: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300",
  hint: "border-amber-200/80 bg-amber-50/70 text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/25 dark:text-amber-300",
  success:
    "border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/35 dark:text-emerald-300",
  warning:
    // Softer than the previous `bg-red-50 text-red-800` — feels like coaching,
    // not a destructive error.
    "border-amber-200/80 bg-amber-50/70 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200",
  error:
    "border-red-200/90 bg-red-50/90 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
};

export function FeedbackPanel({
  variant = "info",
  icon,
  title,
  children,
  className = "",
}: {
  variant?: FeedbackVariant;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] leading-snug ${FEEDBACK_VARIANT_CLASSES[variant]} ${className}`.trim()}
    >
      {title ? (
        <div className="flex items-start gap-1.5 font-semibold">
          {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
          <span>{title}</span>
        </div>
      ) : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}

// ─── SidebarActions — bottom action button group ────────────────────────────
//
// Pinned to the bottom of the sidebar via `mt-auto` so the button group always
// sits at the bottom regardless of how much content is above. Use this for
// Try again / Reset / Show solution etc.
export function SidebarActions({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mt-auto flex shrink-0 flex-col gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-700/50 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

// ─── SidebarTitle — unified eyebrow + big title ─────────────────────────────
//
// Every chess page sidebar starts with the same two-line block:
//   [ EYEBROW LABEL ]
//   Big Title
// Use this so every page gets the same typography hierarchy.
export function SidebarTitle({
  eyebrow,
  title,
  subtitle,
  eyebrowTone = "muted",
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** "muted" (default) uses zinc; "accent" uses emerald for active states. */
  eyebrowTone?: "muted" | "accent";
}) {
  const eyebrowCls =
    eyebrowTone === "accent"
      ? "text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400"
      : CHESS_LABEL_CLS;
  return (
    <div className="shrink-0">
      <p className={eyebrowCls}>{eyebrow}</p>
      <p className={`mt-1 ${CHESS_SIDEBAR_TITLE_CLS}`}>{title}</p>
      {subtitle ? (
        <p className="mt-1.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

// ─── SidebarState — "Your move / Opponent / Complete" anchor card ───────────
//
// Always-visible state panel that tells the user what they should be doing
// right now. Tone = "user" (emerald), "opponent" (neutral gray pulse), or
// "done" (emerald solid). Replaces ad-hoc "Your move" text spread across pages.
type SidebarStateTone = "user" | "opponent" | "done" | "error";
export function SidebarState({
  tone,
  label,
  value,
  children,
}: {
  tone: SidebarStateTone;
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  const wrap =
    tone === "user"
      ? "border-emerald-300/70 bg-emerald-50/70 dark:border-emerald-800/60 dark:bg-emerald-950/25"
      : tone === "done"
        ? "border-emerald-300/70 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/35"
        : tone === "error"
          ? "border-red-300/70 bg-red-50 dark:border-red-800/60 dark:bg-red-950/30"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/40";
  const valueCls =
    tone === "opponent"
      ? "mt-0.5 text-sm font-bold leading-snug text-zinc-600 dark:text-zinc-300 animate-pulse"
      : "mt-0.5 text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-50";
  return (
    <div className={`shrink-0 rounded-lg border px-3 py-2.5 ${wrap}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={valueCls}>{value}</p>
      {children ? (
        <div className="mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          {children}
        </div>
      ) : null}
    </div>
  );
}

// ─── SidebarStatGrid + SidebarStat — 2-column numeric stats ─────────────────
//
// The same "Correct / Wrong" or "Attempts / Progress" block used in puzzles
// and drills. Use SidebarStatGrid for the 2-col container and SidebarStat for
// each cell so the padding, typography, and color rules are centralized.
type SidebarStatTone = "muted" | "success" | "danger" | "accent";
const STAT_TONE_CLS: Record<SidebarStatTone, { wrap: string; label: string; value: string }> = {
  muted: {
    wrap: "border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/40",
    label: "text-zinc-500 dark:text-zinc-400",
    value: "text-zinc-700 dark:text-zinc-200",
  },
  success: {
    wrap: "bg-emerald-50 dark:bg-emerald-950/30",
    label: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-600 dark:text-emerald-400",
  },
  danger: {
    wrap: "bg-red-50 dark:bg-red-950/30",
    label: "text-red-500",
    value: "text-red-500",
  },
  accent: {
    wrap: "border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/35",
    label: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-600 dark:text-emerald-400",
  },
};
export function SidebarStatGrid({ children }: { children: ReactNode }) {
  return <div className="grid shrink-0 grid-cols-2 gap-2">{children}</div>;
}
export function SidebarStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: ReactNode;
  tone?: SidebarStatTone;
}) {
  const t = STAT_TONE_CLS[tone];
  return (
    <div className={`rounded-lg px-2 py-2 text-center ${t.wrap}`}>
      <p className={`text-[10px] font-bold uppercase ${t.label}`}>{label}</p>
      <p className={`mt-0.5 text-xl font-black tabular-nums ${t.value}`}>{value}</p>
    </div>
  );
}

// ─── SidebarDominant — the big "X / Y" progress anchor ──────────────────────
//
// Used in the right panel as the dominant visual number (Ply / Moves / Depth).
// Matches across Opening Trainer, Drill, and Puzzle so they look like one app.
export function SidebarDominant({
  label,
  value,
  unit,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
}) {
  return (
    <div className="shrink-0">
      <p className={CHESS_LABEL_CLS}>{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 font-black tabular-nums text-zinc-900 dark:text-zinc-50">
        <span className="text-4xl leading-none">{value}</span>
        {unit ? (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
}

// ─── SidebarButton — primary / secondary / ghost action button ──────────────
//
// All sidebar action buttons come through here. Changing the button style in
// chess-theme.ts updates every page that imports it.
export function SidebarButton({
  variant = "primary",
  onClick,
  disabled,
  title,
  children,
  className = "",
}: {
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const base =
    variant === "primary"
      ? CHESS_BTN_PRIMARY_CLS
      : variant === "secondary"
        ? CHESS_BTN_SECONDARY_CLS
        : CHESS_BTN_GHOST_CLS;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

// ─── SidebarBackLink — top-of-panel back button ─────────────────────────────
//
// Same back link for every page, so the link density/weight never varies.
export function SidebarBackLink({
  onClick,
  label = "Back",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 text-xs font-semibold text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}
