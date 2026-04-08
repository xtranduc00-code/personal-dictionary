"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft, BookOpen, ChevronRight, RefreshCw, Star,
} from "lucide-react";
import type { PieceDropHandlerArgs } from "react-chessboard";
import {
  ChessBoardWrapper,
  type ChessBoardSizePreset,
} from "@/components/chess/ChessBoardWrapper";
import { useChessLegalMoves } from "@/hooks/use-chess-legal-moves";

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


function OpeningTrainerBoard({
  fen,
  boardOrientation,
  onPieceDrop,
  squareStyles,
  sizePreset = "opening",
  extraOptions,
}: {
  fen: string;
  boardOrientation: "white" | "black";
  onPieceDrop: (args: PieceDropHandlerArgs) => boolean;
  squareStyles?: Record<string, React.CSSProperties>;
  sizePreset?: ChessBoardSizePreset;
  extraOptions?: Record<string, unknown>;
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
          ...extraOptions,
        }}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpeningTrainer({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <div className="min-h-0 flex-1 overflow-hidden">
        <PracticeMode onBack={onBack} />
      </div>
    </div>
  );
}

// ─── Practice Mode ────────────────────────────────────────────────────────────

function PracticeMode({ onBack }: { onBack?: () => void }) {
  const [selected, setSelected] = useState<QuickStart | null>(null);

  if (!selected) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
        <div className="mx-auto w-full max-w-xl">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-3 flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
          )}
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
  const [explorerFailed, setExplorerFailed] = useState(false);

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

  // Retry explorer fetch on failure
  useEffect(() => {
    if (!explorerFailed || finished) return;
    const retry = setTimeout(() => {
      fetchExplorer(chessRef.current.fen());
    }, 2000);
    return () => clearTimeout(retry);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorerFailed, finished]);

  // Auto-play opponent when phase = "auto"
  useEffect(() => {
    if (phase !== "auto" || finished || explorerFailed) return;
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
    setExplorerFailed(false);
    try {
      const res = await fetch(`/api/chess/opening?fen=${encodeURIComponent(currentFen)}`);
      const data = (await res.json()) as ExplorerData;
      if (!res.ok || data.error) {
        setExplorer(null);
        setExplorerFailed(true);
        return;
      }
      setExplorer(data);
      if (data.opening?.name) setOpeningName(data.opening.name);
    } catch {
      setExplorer(null);
      setExplorerFailed(true);
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

  const canInteract = phase === "user" && !finished;
  const { legalMoveStyles, handlers: legalMoveHandlers, clearSelection } = useChessLegalMoves(chessRef, handleUserDrop, canInteract);

  const squareStyles = useMemo(() => ({ ...lastMoveSquares, ...wrongSquares, ...legalMoveStyles }), [lastMoveSquares, wrongSquares, legalMoveStyles]);

  const accuracy =
    score.correct + score.wrong > 0
      ? Math.round((score.correct / (score.correct + score.wrong)) * 100)
      : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-row gap-2.5 overflow-hidden bg-zinc-100 px-2 py-2 dark:bg-zinc-950 sm:gap-3 sm:px-3 sm:py-2.5">
      {/* ── Left sidebar ── */}
      <div className="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border border-zinc-200 bg-white px-3 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:w-64 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          All lines
        </button>

        {/* Opening name */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Opening</p>
          <p className="mt-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300 leading-snug">
            {openingName || quickStart.name}
          </p>
          <p className="mt-1 text-[10px] text-zinc-400">{quickStart.subtext}</p>
          <p className="mt-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            You: <span className="text-violet-600 dark:text-violet-400 font-semibold capitalize">{playAs}</span>
          </p>
        </div>

        {/* Score */}
        {score.correct + score.wrong > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Score</p>
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg bg-emerald-50 p-1.5 text-center dark:bg-emerald-950/30">
                <p className="text-[9px] font-bold uppercase text-emerald-600 dark:text-emerald-400">✓</p>
                <p className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">{score.correct}</p>
              </div>
              <div className="flex-1 rounded-lg bg-red-50 p-1.5 text-center dark:bg-red-950/30">
                <p className="text-[9px] font-bold uppercase text-red-500">✗</p>
                <p className="text-lg font-black tabular-nums text-red-500">{score.wrong}</p>
              </div>
            </div>
            {accuracy !== null && (
              <p className="text-center text-xs font-bold text-zinc-600 dark:text-zinc-300">{accuracy}%</p>
            )}
          </div>
        )}

        {/* Status / feedback */}
        {phase === "auto" && !finished && (
          <p className="text-[11px] font-medium text-zinc-400 animate-pulse">Opponent is thinking…</p>
        )}
        {result !== "idle" && (
          <div className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium leading-snug ${
            result === "wrong"
              ? "border-red-200/80 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-300"
              : result === "correct"
                ? "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-300"
                : "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-200"
          }`}>
            {resultMsg}
            {result === "wrong" && correctSan && (
              <p className="mt-0.5 text-[10px] opacity-90">Best: <strong className="font-mono">{correctSan}</strong></p>
            )}
          </div>
        )}

        {finished && (
          <div className="rounded-lg border border-violet-200/80 bg-violet-50/90 px-2 py-2 text-center dark:border-violet-800/50 dark:bg-violet-950/35">
            <p className="text-[11px] font-semibold text-violet-900 dark:text-violet-100">Line complete!</p>
            <button type="button" onClick={reset} className="mt-1 text-[11px] font-semibold text-violet-700 underline dark:text-violet-300">
              Restart
            </button>
          </div>
        )}

        {/* Move list */}
        {history.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Moves</p>
            <div className="flex flex-wrap gap-1">
              {history.map((san, i) => (
                <span key={i} className="rounded bg-white px-1 py-0.5 font-mono text-[10px] text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                  {i % 2 === 0 && <span className="mr-0.5 text-zinc-400">{Math.floor(i / 2) + 1}.</span>}
                  {san}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Restart button */}
        <button
          type="button"
          onClick={reset}
          className="mt-auto flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Restart
        </button>
      </div>

      {/* ── Board area ── */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
        <OpeningTrainerBoard
          fen={fen}
          boardOrientation={playAs}
          squareStyles={squareStyles}
          sizePreset="opening"
          onPieceDrop={({ sourceSquare, targetSquare }) => {
            clearSelection();
            return handleUserDrop(sourceSquare, targetSquare ?? "");
          }}
          extraOptions={legalMoveHandlers}
        />
      </div>
    </div>
  );
}
