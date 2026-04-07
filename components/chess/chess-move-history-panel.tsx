"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { Move } from "chess.js";
import { Chess } from "chess.js";

export type MoveHistoryUserSide = "white" | "black" | "spectator";

type PgnToken = {
  key: string;
  before: string;
  san: string;
  plyIndex: number;
};

/** Build PGN-style tokens: `1. e4 e5  2. Nf3` including `1... e5` when black moves first. */
export function historyToPgnTokens(history: Move[]): PgnToken[] {
  const out: PgnToken[] = [];
  let i = 0;
  let fullMove = 1;
  while (i < history.length) {
    const m = history[i];
    if (!m) break;
    if (m.color === "w") {
      out.push({
        key: `ply-${i}-${m.san}`,
        before: `${fullMove}.`,
        san: m.san,
        plyIndex: i,
      });
      i++;
      const m2 = history[i];
      if (m2 && m2.color === "b") {
        out.push({
          key: `ply-${i}-${m2.san}`,
          before: "",
          san: m2.san,
          plyIndex: i,
        });
        i++;
      }
      fullMove++;
    } else {
      out.push({
        key: `ply-${i}-${m.san}`,
        before: `${fullMove}...`,
        san: m.san,
        plyIndex: i,
      });
      i++;
      fullMove++;
    }
  }
  return out;
}

function plyIsUserSide(m: Move, userSide: MoveHistoryUserSide): boolean {
  if (userSide === "spectator") return m.color === "w";
  const u = userSide === "white" ? "w" : "b";
  return m.color === u;
}

export function historyFromPgn(pgn: string): Move[] {
  const c = new Chess();
  const raw = pgn.trim();
  if (!raw) return [];
  try {
    c.loadPgn(raw);
  } catch {
    return [];
  }
  return c.history({ verbose: true }) as Move[];
}

export function ChessMoveHistoryPanel({
  historyVerbose,
  userSide,
  className = "",
  emptyLabel = "No moves yet.",
  fillHeight = false,
}: {
  historyVerbose: Move[];
  userSide: MoveHistoryUserSide;
  className?: string;
  /** Shown when there are no moves (puzzle start / new game). */
  emptyLabel?: string;
  /** When true, panel grows in a flex parent and the move list scrolls inside remaining space. */
  fillHeight?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => historyToPgnTokens(historyVerbose), [historyVerbose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [historyVerbose.length]);

  const lastPly = historyVerbose.length - 1;

  const scrollClass = fillHeight
    ? "min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed"
    : "max-h-40 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed";

  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 ${
        fillHeight ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""
      } ${className}`.trim()}
    >
      <p className="shrink-0 border-b border-zinc-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800">
        Moves
      </p>
      {tokens.length === 0 ? (
        <p className={`shrink-0 px-3 py-2 text-xs text-zinc-400 ${fillHeight ? "min-h-0" : ""}`}>{emptyLabel}</p>
      ) : (
        <div className={scrollClass}>
          {tokens.map((t) => {
            const m = historyVerbose[t.plyIndex];
            const userMove = plyIsUserSide(m, userSide);
            const current = t.plyIndex === lastPly;
            return (
              <span key={t.key}>
                {t.before ? (
                  <span className="mr-0.5 text-zinc-400 tabular-nums">{t.before}</span>
                ) : (
                  <span className="mr-1"> </span>
                )}
                <span
                  className={`inline ${
                    userMove
                      ? "text-zinc-800 dark:text-zinc-200"
                      : "text-zinc-400 dark:text-zinc-500"
                  } ${current ? "font-bold text-zinc-950 dark:text-zinc-50" : ""}`}
                >
                  {t.san}
                </span>{" "}
              </span>
            );
          })}
          <div ref={bottomRef} className="h-px" aria-hidden />
        </div>
      )}
    </div>
  );
}
