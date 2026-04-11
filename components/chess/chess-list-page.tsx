"use client";

import type { ReactNode } from "react";

/**
 * Shared wrapper for chess **list / browse** pages — chess home, puzzle library,
 * endgame lessons list, opening trainer list, etc.
 *
 * Rule (matches the project-wide chess page sizing convention — same value as
 * `BOARD_SHELL_COMBO_MAX` so list pages and board pages share one max-width):
 *   - max-width: 1200px
 *   - margin: 0 auto (centered)
 *   - horizontal padding: 40px
 *   - vertical scroll inside the page
 */
export const CHESS_LIST_PAGE_MAX = 1200;

export function ChessListPage({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className={`mx-auto flex w-full min-w-0 flex-1 flex-col ${className}`.trim()}
          style={{ maxWidth: CHESS_LIST_PAGE_MAX, paddingLeft: 40, paddingRight: 40 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
