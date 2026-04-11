"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared internal-page header for chess pages.
 *
 * Sits inside the same content container as the body so the header width and
 * the body width belong to one grid system. No more "long empty header strip
 * with controls pushed to opposite screen edges". Use it together with
 * `ChessListPage` (max-width 1200px) or any chess content container.
 *
 * Anatomy:
 *   ┌─ container ─────────────────────────────────┐
 *   │ ← back │ Title              │ actions      │
 *   │           subtitle (optional)               │
 *   └─────────────────────────────────────────────┘
 *
 * Defaults:
 *   - Title size: text-xl font-bold
 *   - Bottom border + py-4 vertical rhythm
 *   - Back button is optional; if `back` is a string it renders as a Link,
 *     if it's a function it renders as a button.
 *   - Actions sit on the right; the gap between title and actions collapses
 *     gracefully on small viewports.
 */
export function ChessPageHeader({
  title,
  subtitle,
  back,
  actions,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** URL string for a Link or a callback for a button. Omit to hide the back button. */
  back?: string | (() => void);
  actions?: ReactNode;
  className?: string;
}) {
  const backButton =
    typeof back === "string" ? (
      <Link
        href={back}
        className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
    ) : typeof back === "function" ? (
      <button
        type="button"
        onClick={back}
        className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
    ) : null;

  return (
    <header
      className={`flex shrink-0 items-center gap-3 border-b border-zinc-200 pb-4 pt-1 dark:border-zinc-800 ${className}`.trim()}
    >
      {backButton}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
