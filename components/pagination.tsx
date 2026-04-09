"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Number of sibling pages shown each side of the current page. */
const SIBLINGS_DESKTOP = 1;
const SIBLINGS_MOBILE = 0;

type PageItem = number | "ellipsis";

/**
 * Build the visible page-number sequence with ellipsis gaps.
 *
 * Examples (siblings = 1):
 *   current=1,  total=10 → 1 2 … 10
 *   current=5,  total=10 → 1 … 4 5 6 … 10
 *   current=9,  total=10 → 1 … 9 10
 *   current=3,  total=5  → 1 2 3 4 5
 */
export function getPaginationItems(
  current: number,
  total: number,
  siblings: number,
): PageItem[] {
  if (total <= 1) return [1];

  // Minimum visible = first + last + current + 2*siblings + 2 ellipsis slots
  const minSlots = 5 + 2 * siblings;
  if (total <= minSlots) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const left = Math.max(2, current - siblings);
  const right = Math.min(total - 1, current + siblings);

  const items: PageItem[] = [1];

  if (left > 2) items.push("ellipsis");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("ellipsis");

  items.push(total);
  return items;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BTN_BASE =
  "inline-flex items-center justify-center rounded-lg border text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 focus-visible:ring-offset-1";

const BTN_NAV =
  `${BTN_BASE} h-9 w-9 border-zinc-200/90 bg-white text-zinc-600 shadow-sm hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:pointer-events-none disabled:opacity-25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-200 dark:hover:border-rose-800`;

const BTN_PAGE =
  `${BTN_BASE} h-9 min-w-[2.25rem] px-2 border-zinc-200/90 bg-white text-zinc-700 shadow-sm hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-200 dark:hover:border-rose-800`;

const BTN_PAGE_ACTIVE =
  `${BTN_BASE} h-9 min-w-[2.25rem] px-2 border-rose-500 bg-rose-600 text-white shadow-sm hover:bg-rose-700 dark:border-rose-400 dark:bg-rose-500 dark:text-white dark:hover:bg-rose-600`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Called when the user selects a different page. */
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const desktopItems = getPaginationItems(
    currentPage,
    totalPages,
    SIBLINGS_DESKTOP,
  );
  const mobileItems = getPaginationItems(
    currentPage,
    totalPages,
    SIBLINGS_MOBILE,
  );

  const goTo = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 flex flex-col items-center gap-4"
    >
      {/* Controls */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* First */}
        <button
          type="button"
          onClick={() => goTo(1)}
          disabled={isFirst}
          className={BTN_NAV}
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        {/* Previous */}
        <button
          type="button"
          onClick={() => goTo(currentPage - 1)}
          disabled={isFirst}
          className={BTN_NAV}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Page numbers — desktop */}
        <div className="hidden items-center gap-1 sm:flex">
          {desktopItems.map((item, idx) =>
            item === "ellipsis" ? (
              <span
                key={`e${idx}`}
                className="inline-flex h-9 w-7 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500"
                aria-hidden
              >
                &hellip;
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => goTo(item)}
                className={item === currentPage ? BTN_PAGE_ACTIVE : BTN_PAGE}
                aria-label={`Page ${item}`}
                aria-current={item === currentPage ? "page" : undefined}
              >
                {item}
              </button>
            ),
          )}
        </div>

        {/* Page numbers — mobile (fewer siblings) */}
        <div className="flex items-center gap-1 sm:hidden">
          {mobileItems.map((item, idx) =>
            item === "ellipsis" ? (
              <span
                key={`m${idx}`}
                className="inline-flex h-9 w-6 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500"
                aria-hidden
              >
                &hellip;
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => goTo(item)}
                className={item === currentPage ? BTN_PAGE_ACTIVE : BTN_PAGE}
                aria-label={`Page ${item}`}
                aria-current={item === currentPage ? "page" : undefined}
              >
                {item}
              </button>
            ),
          )}
        </div>

        {/* Next */}
        <button
          type="button"
          onClick={() => goTo(currentPage + 1)}
          disabled={isLast}
          className={BTN_NAV}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Last */}
        <button
          type="button"
          onClick={() => goTo(totalPages)}
          disabled={isLast}
          className={BTN_NAV}
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
