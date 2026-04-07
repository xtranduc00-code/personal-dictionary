"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft, BookOpen, ChevronRight, Compass, Loader2, RefreshCw, RotateCcw, Star, Target,
} from "lucide-react";
import type { PieceDropHandlerArgs } from "react-chessboard";
import {
  ChessBoardWrapper,
  type ChessBoardSizePreset,
} from "@/components/chess/ChessBoardWrapper";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExplorerMove = {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
};

type ExplorerData = {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  opening?: { eco: string; name: string };
  /** Set by our API when Lichess is unreachable (distinct from legal empty moves). */
  error?: string;
};

type PracticeResult = "idle" | "correct" | "correct_alt" | "wrong";

type QuickStart = {
  id: string;
  name: string;
  subtext: string;
  playAs: "white" | "black";
  moves: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_STARTS: QuickStart[] = [
  {
    id: "italian",
    name: "Italian Game",
    subtext: "1.e4 e5 2.Nf3 Nc6 3.Bc4",
    playAs: "white",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
  },
  {
    id: "caro_kann",
    name: "Caro-Kann Defense",
    subtext: "1.e4 c6",
    playAs: "black",
    moves: ["e2e4", "c7c6"],
  },
  {
    id: "queens_gambit",
    name: "Queen's Gambit",
    subtext: "1.d4 d5 2.c4",
    playAs: "white",
    moves: ["d2d4", "d7d5", "c2c4"],
  },
  {
    id: "sicilian",
    name: "Sicilian Defense",
    subtext: "1.e4 c5",
    playAs: "black",
    moves: ["e2e4", "c7c5"],
  },
  {
    id: "london",
    name: "London System",
    subtext: "1.d4 d5 2.Bf4",
    playAs: "white",
    moves: ["d2d4", "d7d5", "c1f4"],
  },
  {
    id: "french",
    name: "French Defense",
    subtext: "1.e4 e6",
    playAs: "black",
    moves: ["e2e4", "e7e6"],
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function totalGames(d: ExplorerData | ExplorerMove): number {
  return (d.white ?? 0) + (d.draws ?? 0) + (d.black ?? 0);
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return Math.round((n / total) * 100) + "%";
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** PGN-style breadcrumb: `1.e4 e5 2.Nf3` */
function historyToBreadcrumb(sans: string[]): string {
  if (sans.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    const n = Math.floor(i / 2) + 1;
    const w = sans[i]!;
    const b = sans[i + 1];
    parts.push(b ? `${n}.${w} ${b}` : `${n}.${w}`);
  }
  return parts.join(" ");
}

function OpeningTrainerBoard({
  fen,
  boardOrientation,
  onPieceDrop,
  squareStyles,
  sizePreset = "opening",
}: {
  fen: string;
  boardOrientation: "white" | "black";
  onPieceDrop: (args: PieceDropHandlerArgs) => boolean;
  squareStyles?: Record<string, React.CSSProperties>;
  sizePreset?: ChessBoardSizePreset;
}) {
  return (
    <div className="mx-auto flex w-full max-w-full shrink-0 justify-center">
      <ChessBoardWrapper
        sizePreset={sizePreset}
        className="overflow-hidden rounded-2xl shadow-md ring-1 ring-black/[0.06] dark:ring-white/10"
        fixedEdgeNotation={false}
        options={{
          position: fen,
          boardOrientation,
          onPieceDrop,
          squareStyles,
        }}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpeningTrainer() {
  const [tab, setTab] = useState<"explore" | "practice">("explore");

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-200/90 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-4">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
            Opening trainer
          </p>
          <div
            className="mt-2.5 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-200/90 bg-zinc-100/90 p-1.5 shadow-inner dark:border-zinc-700 dark:bg-zinc-800/50 sm:gap-1.5 sm:p-1"
            role="tablist"
            aria-label="Opening trainer mode"
          >
            {(["explore", "practice"] as const).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-2.5 text-center transition sm:flex-row sm:items-center sm:justify-center sm:gap-2.5 sm:py-3 ${
                    active
                      ? "bg-white text-zinc-900 shadow-md ring-2 ring-violet-500/25 ring-offset-2 ring-offset-zinc-100 dark:bg-zinc-950 dark:text-zinc-50 dark:ring-violet-400/30 dark:ring-offset-zinc-800/50"
                      : "text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700/40 dark:hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {t === "explore" ? (
                      <Compass
                        className={`h-4 w-4 shrink-0 ${active ? "text-violet-600 dark:text-violet-400" : ""}`}
                        aria-hidden
                      />
                    ) : (
                      <Target
                        className={`h-4 w-4 shrink-0 ${active ? "text-violet-600 dark:text-violet-400" : ""}`}
                        aria-hidden
                      />
                    )}
                    <span className="text-sm font-bold tracking-tight">
                      {t === "explore" ? "Explore" : "Practice"}
                    </span>
                  </span>
                  <span
                    className={`hidden text-[11px] font-medium leading-tight sm:block ${
                      active ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {t === "explore"
                      ? "Lichess tree & statistics"
                      : "Drill popular lines"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "explore" ? <ExploreMode /> : <PracticeMode />}
      </div>
    </div>
  );
}

// ─── Explore Mode ─────────────────────────────────────────────────────────────

function ExploreMode() {
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [explorer, setExplorer] = useState<ExplorerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const fetchExplorer = useCallback(async (currentFen: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setExplorerError(null);

    async function tryFetch(): Promise<{ ok: true; data: ExplorerData } | { ok: false }> {
      const timeoutId = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(
        `/api/chess/opening?fen=${encodeURIComponent(currentFen)}`,
        { signal: ctrl.signal },
      );
      clearTimeout(timeoutId);
      let data: ExplorerData;
      try {
        data = (await res.json()) as ExplorerData;
      } catch {
        return { ok: false };
      }
      if (!res.ok || data.error) return { ok: false };
      return { ok: true, data };
    }

    try {
      let result = await tryFetch();
      if (!result.ok && !ctrl.signal.aborted) {
        await sleep(2000);
        if (!ctrl.signal.aborted) result = await tryFetch();
      }
      if (ctrl.signal.aborted) return;
      if (!result.ok) {
        setExplorer(null);
        setExplorerError("Explorer unavailable");
        return;
      }
      setExplorer(result.data);
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
      setExplorer(null);
      setExplorerError("Explorer unavailable");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExplorer(chessRef.current.fen());
  }, [fetchExplorer]);

  function playMove(uci: string) {
    const chess = chessRef.current;
    const move = chess.move({
      from: uci.slice(0, 2) as never,
      to: uci.slice(2, 4) as never,
      promotion: uci[4] ?? "q",
    });
    if (!move) return;
    const newFen = chess.fen();
    setFen(newFen);
    setHistory((h) => [...h, move.san]);
    fetchExplorer(newFen);
  }

  function handleDrop(from: string, to: string) {
    const chess = chessRef.current;
    const move = chess.move({ from: from as never, to: to as never, promotion: "q" });
    if (!move) return false;
    const newFen = chess.fen();
    setFen(newFen);
    setHistory((h) => [...h, move.san]);
    fetchExplorer(newFen);
    return true;
  }

  function undo() {
    const chess = chessRef.current;
    chess.undo();
    setHistory((h) => h.slice(0, -1));
    const newFen = chess.fen();
    setFen(newFen);
    fetchExplorer(newFen);
  }

  function reset() {
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setHistory([]);
    fetchExplorer(chessRef.current.fen());
  }

  const topMoves = (explorer?.moves ?? []).slice(0, 14);
  const branchTotal = topMoves.reduce((s, m) => s + totalGames(m), 0);

  const atStart = history.length === 0;
  const moveCount = explorer?.moves?.length ?? 0;
  const showOutOfBook = !loading && !explorerError && !atStart && moveCount === 0;

  let movesSectionTitle: string;
  if (loading) {
    movesSectionTitle = "Loading moves";
  } else if (explorerError) {
    movesSectionTitle = "Explorer unavailable";
  } else if (showOutOfBook) {
    movesSectionTitle = "Out of book";
  } else {
    movesSectionTitle = "Top moves (Lichess)";
  }

  const breadcrumb = historyToBreadcrumb(history);

  function retryExplorer() {
    void fetchExplorer(chessRef.current.fen());
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900 dark:shadow-black/25">
          {/* One training surface: context strip + sidebar | board column */}
          <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-50/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60 sm:px-4 sm:py-2.5">
            <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50 lg:inline lg:mr-2">
              Explore
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 lg:inline">
              Board or book moves · Lichess statistics.
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col-reverse overflow-hidden lg:flex-row lg:divide-x lg:divide-zinc-200/90 dark:lg:divide-zinc-800">
            {/* DOM first = bottom on mobile (col-reverse); left on lg = sidebar */}
            <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:w-[min(100%,380px)] lg:max-w-[380px] lg:border-t-0 lg:border-r-0">
              <div className="shrink-0 border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
                      Book moves
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {loading ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-500" aria-hidden />
                      ) : null}
                      {movesSectionTitle}
                    </p>
                  </div>
                </div>
                {explorer?.opening ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-violet-200/70 bg-violet-50/80 px-2.5 py-2 dark:border-violet-800/40 dark:bg-violet-950/35">
                    <BookOpen className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
                    <span className="text-xs font-semibold leading-snug text-violet-900 dark:text-violet-100">
                      {explorer.opening.eco} · {explorer.opening.name}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4">
                {explorerError ? (
                  <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 p-3 dark:border-amber-900/50 dark:bg-amber-950/25">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                      Explorer unavailable
                    </p>
                    <p className="mt-1 text-sm leading-snug text-amber-900/90 dark:text-amber-100/90">
                      Lichess could not be reached. You can still move pieces on the board.
                    </p>
                    <button
                      type="button"
                      onClick={retryExplorer}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {topMoves.map((m) => {
                      const t = totalGames(m);
                      const sharePct = branchTotal ? Math.round((t / branchTotal) * 100) : 0;
                      return (
                        <button
                          key={m.uci}
                          type="button"
                          onClick={() => playMove(m.uci)}
                          className="w-full rounded-xl border border-zinc-200/90 bg-zinc-50/50 px-3 py-2.5 text-left transition hover:border-violet-400/80 hover:bg-violet-50/90 dark:border-zinc-700 dark:bg-zinc-950/50 dark:hover:border-violet-500 dark:hover:bg-violet-950/20"
                        >
                          <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-50">
                            {m.san}
                          </span>
                          <span className="text-zinc-400"> · </span>
                          <span className="tabular-nums text-sm text-zinc-600 dark:text-zinc-300">
                            {sharePct}%
                          </span>
                          <span className="mt-0.5 block text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                            W {pct(m.white, t)} · D {pct(m.draws, t)} · B {pct(m.black, t)}
                          </span>
                        </button>
                      );
                    })}
                    {!loading && !explorerError && showOutOfBook ? (
                      <p className="rounded-lg border border-zinc-200/80 bg-zinc-100/80 px-3 py-2.5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                        No book moves in the database for this position.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-zinc-200/90 bg-zinc-50/90 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="space-y-1">
                  <p className="break-words font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                    <span className="mr-1.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Line</span>
                    {breadcrumb || "Start position"}
                  </p>
                  <p
                    className="line-clamp-1 break-all font-mono text-[10px] leading-snug text-zinc-400 dark:text-zinc-500"
                    title={fen}
                  >
                    {fen}
                  </p>
                </div>
              </div>
            </aside>

            {/* Board column: second in DOM → top on mobile; right on large screens */}
            <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50/40 dark:bg-zinc-950/40">
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4 sm:py-4">
                <OpeningTrainerBoard
                  sizePreset="openingExplore"
                  fen={fen}
                  boardOrientation="white"
                  onPieceDrop={({ sourceSquare, targetSquare }) =>
                    handleDrop(sourceSquare, targetSquare ?? "")
                  }
                />
                {/* Controls directly under the board */}
                <div className="mt-3 flex w-full max-w-md gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={undo}
                    disabled={history.length === 0}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-35 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
                  >
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Undo
                  </button>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Practice Mode ────────────────────────────────────────────────────────────

function PracticeMode() {
  const [selected, setSelected] = useState<QuickStart | null>(null);

  if (!selected) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
        <div className="mx-auto w-full max-w-xl">
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900 dark:shadow-black/20 sm:p-5">
            <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Choose a line
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              You play one color; opponent replies using the most popular Lichess moves in each position.
            </p>
            <div className="mt-4 space-y-2">
              {QUICK_STARTS.map((qs) => (
                <button
                  key={qs.id}
                  type="button"
                  onClick={() => setSelected(qs)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/50 p-3 text-left transition hover:border-violet-400/70 hover:bg-violet-50/60 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:border-violet-500 dark:hover:bg-violet-950/25 sm:gap-4 sm:p-3.5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                    <Star className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{qs.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {qs.subtext}
                      <span className="text-zinc-400"> · </span>
                      <span className="font-medium text-violet-600 dark:text-violet-400">You: {qs.playAs}</span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-violet-500" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <PracticeBoard quickStart={selected} onBack={() => setSelected(null)} />;
}

/** Replay a sequence of UCI moves on the given Chess instance, returning the SAN list. */
function applyInitialMoves(chess: Chess, initialMoves: string[]): string[] {
  const sans: string[] = [];
  for (const uci of initialMoves) {
    const move = chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: "q" });
    if (move) sans.push(move.san);
  }
  return sans;
}

// ─── Practice Board ───────────────────────────────────────────────────────────

function PracticeBoard({
  quickStart,
  onBack,
}: {
  quickStart: QuickStart;
  onBack: () => void;
}) {
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [result, setResult] = useState<PracticeResult>("idle");
  const [resultMsg, setResultMsg] = useState("");
  const [correctSan, setCorrectSan] = useState("");
  const [phase, setPhase] = useState<"user" | "auto">("user");
  const [explorer, setExplorer] = useState<ExplorerData | null>(null);
  const [openingName, setOpeningName] = useState("");
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [wrongSquares, setWrongSquares] = useState<Record<string, object>>({});
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, object>>({});
  const [finished, setFinished] = useState(false);

  const playAs = quickStart.playAs;
  const initialMoves = quickStart.moves;

  // Play the pre-loaded opening moves automatically
  const hasBootstrapped = useRef(false);
  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    const chess = chessRef.current;
    const sans = applyInitialMoves(chess, initialMoves);
    setFen(chess.fen());
    setHistory(sans);
    setPhase(chess.turn() === playAs[0] ? "user" : "auto");

    fetchExplorer(chess.fen());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-play opponent when phase = "auto"
  useEffect(() => {
    if (phase !== "auto" || finished) return;
    if (!explorer) return;
    const topMove = explorer.moves[0];
    if (!topMove) { setFinished(true); return; }
    const delay = setTimeout(() => {
      const chess = chessRef.current;
      const move = chess.move({
        from: topMove.uci.slice(0, 2) as never,
        to: topMove.uci.slice(2, 4) as never,
        promotion: topMove.uci[4] ?? "q",
      });
      if (!move) { setFinished(true); return; }
      setLastMoveSquares({
        [topMove.uci.slice(0, 2)]: { background: "rgba(100,100,255,0.3)" },
        [topMove.uci.slice(2, 4)]: { background: "rgba(100,100,255,0.3)" },
      });
      setFen(chess.fen());
      setHistory((h) => [...h, move.san]);
      setPhase("user");
      fetchExplorer(chess.fen());
    }, 600);
    return () => clearTimeout(delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, explorer, finished]);

  async function fetchExplorer(currentFen: string) {
    try {
      const res = await fetch(`/api/chess/opening?fen=${encodeURIComponent(currentFen)}`);
      const data = (await res.json()) as ExplorerData;
      if (!res.ok || data.error) {
        setExplorer({ white: 0, draws: 0, black: 0, moves: [] });
        setOpeningName("");
        return;
      }
      setExplorer(data);
      if (data.opening?.name) setOpeningName(data.opening.name);
    } catch {
      setExplorer({ white: 0, draws: 0, black: 0, moves: [] });
      setOpeningName("");
    }
  }

  function handleUserDrop(from: string, to: string): boolean {
    if (phase !== "user" || finished) return false;

    const chess = chessRef.current;
    const movePlayed = chess.move({ from: from as never, to: to as never, promotion: "q" });
    if (!movePlayed) return false;

    // Evaluate against explorer
    const topMove = explorer?.moves?.[0];
    const top3Ucis = (explorer?.moves ?? []).slice(0, 3).map((m) => m.uci);
    const playedUci = from + to;

    if (!topMove) {
      // Out of book – still valid
      setResult("correct_alt");
      setResultMsg("Out of theory — you're on your own now!");
      setLastMoveSquares({
        [from]: { background: "rgba(100,200,100,0.4)" },
        [to]: { background: "rgba(100,200,100,0.4)" },
      });
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      setFen(chess.fen());
      setHistory((h) => [...h, movePlayed.san]);
      fetchExplorer(chess.fen()).then(() => setPhase("auto"));
      return true;
    }

    const isTop = playedUci === topMove.uci;
    const isAlt = !isTop && top3Ucis.includes(playedUci);

    if (isTop || isAlt) {
      setResult(isTop ? "correct" : "correct_alt");
      setResultMsg(
        isTop
          ? `✓ Best move! ${movePlayed.san}`
          : `✓ Good alternative! ${movePlayed.san} (best was ${topMove.san})`,
      );
      setLastMoveSquares({
        [from]: { background: "rgba(100,200,100,0.4)" },
        [to]: { background: "rgba(100,200,100,0.4)" },
      });
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      setFen(chess.fen());
      setHistory((h) => [...h, movePlayed.san]);
      fetchExplorer(chess.fen()).then(() => setPhase("auto"));
      return true;
    } else {
      // Wrong – undo the move
      chess.undo();
      setResult("wrong");
      setCorrectSan(topMove.san);
      setResultMsg(`✗ ${movePlayed.san} is not in the book. Best was ${topMove.san}`);
      setWrongSquares({
        [from]: { background: "rgba(220,50,50,0.4)" },
        [to]: { background: "rgba(220,50,50,0.4)" },
      });
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
      setTimeout(() => { setWrongSquares({}); setResult("idle"); }, 1800);
      return false;
    }
  }

  function reset() {
    chessRef.current = new Chess();
    hasBootstrapped.current = false;
    setFen(chessRef.current.fen());
    setHistory([]);
    setResult("idle");
    setResultMsg("");
    setCorrectSan("");
    setPhase("user");
    setExplorer(null);
    setOpeningName("");
    setFinished(false);
    setWrongSquares({});
    setLastMoveSquares({});
    setScore({ correct: 0, wrong: 0 });

    // Re-bootstrap
    const chess = chessRef.current;
    const sans = applyInitialMoves(chess, initialMoves);
    setFen(chess.fen());
    setHistory(sans);
    setPhase(chess.turn() === playAs[0] ? "user" : "auto");
    fetchExplorer(chess.fen());
    hasBootstrapped.current = true;
  }

  const squareStyles = useMemo(() => ({ ...lastMoveSquares, ...wrongSquares }), [lastMoveSquares, wrongSquares]);

  const accuracy =
    score.correct + score.wrong > 0
      ? Math.round((score.correct / (score.correct + score.wrong)) * 100)
      : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900 dark:shadow-black/25">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/60 sm:px-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">All lines</span>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Practice
            </p>
            <p className="min-w-0 truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">
              {quickStart.name}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Restart
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="flex flex-col items-stretch gap-3 px-3 py-4 sm:px-4">
            {openingName ? (
              <div className="flex items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/90 px-3 py-2 dark:border-violet-800/50 dark:bg-violet-950/35">
                <BookOpen className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
                <span className="text-xs font-semibold text-violet-900 dark:text-violet-100">{openingName}</span>
              </div>
            ) : null}

            <div className="flex justify-center">
              <OpeningTrainerBoard
                fen={fen}
                boardOrientation={playAs}
                squareStyles={squareStyles}
                sizePreset="opening"
                onPieceDrop={({ sourceSquare, targetSquare }) =>
                  handleUserDrop(sourceSquare, targetSquare ?? "")
                }
              />
            </div>

            {result !== "idle" && (
              <div
                className={`w-full rounded-xl border px-3 py-2.5 text-sm font-medium sm:px-4 ${
                  result === "wrong"
                    ? "border-red-200/80 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-300"
                    : result === "correct"
                      ? "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-300"
                      : "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-200"
                }`}
              >
                {resultMsg}
                {result === "wrong" && correctSan && (
                  <p className="mt-1 text-xs opacity-90">
                    Book move: <strong className="font-mono">{correctSan}</strong>
                  </p>
                )}
              </div>
            )}

            {phase === "auto" && !finished && (
              <p className="text-center text-xs font-medium text-zinc-500 animate-pulse dark:text-zinc-400">
                Opponent is thinking…
              </p>
            )}

            {finished && (
              <div className="w-full rounded-xl border border-violet-200/80 bg-violet-50/90 px-4 py-3 text-center dark:border-violet-800/50 dark:bg-violet-950/35">
                <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                  Out of book — line complete.
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-2 text-sm font-semibold text-violet-700 underline decoration-violet-400 underline-offset-2 dark:text-violet-300"
                >
                  Practice again
                </button>
              </div>
            )}

            {score.correct + score.wrong > 0 && (
              <div className="grid w-full grid-cols-3 gap-2 rounded-xl border border-zinc-200/90 bg-zinc-50/95 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Correct</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{score.correct}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Accuracy</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-zinc-800 dark:text-zinc-100">
                    {accuracy ?? "—"}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Wrong</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-red-500">{score.wrong}</p>
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div className="w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-2.5 dark:border-zinc-700 dark:bg-zinc-950/50">
                <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Moves</p>
                <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {history.map((san, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {i % 2 === 0 && <span className="mr-0.5 text-zinc-400">{Math.floor(i / 2) + 1}.</span>}
                      {san}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
