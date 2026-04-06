"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight,
  Loader2, SkipBack, SkipForward,
} from "lucide-react";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false, loading: () => <div className="aspect-square w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" /> },
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type MoveClass = "brilliant" | "great" | "good" | "inaccuracy" | "mistake" | "blunder";

type MoveInfo = {
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  color: "w" | "b";
  moveNum: number;
};

type AnalyzedMove = MoveInfo & {
  evalBefore: number;   // centipawns, White's perspective
  evalAfter: number;
  cpLoss: number;       // always ≥ 0, from the moving player's perspective
  bestMove: string;     // UCI
  classification: MoveClass;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASS_META: Record<MoveClass, { label: string; symbol: string; color: string; bg: string }> = {
  brilliant:  { label: "Brilliant",  symbol: "!!",  color: "text-cyan-500",   bg: "bg-cyan-50 dark:bg-cyan-950/30" },
  great:      { label: "Great",      symbol: "!",   color: "text-emerald-500",bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  good:       { label: "Good",       symbol: "·",   color: "text-zinc-400",   bg: "" },
  inaccuracy: { label: "Inaccuracy", symbol: "?",   color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-950/30" },
  mistake:    { label: "Mistake",    symbol: "?!",  color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
  blunder:    { label: "Blunder",    symbol: "??",  color: "text-red-500",    bg: "bg-red-50 dark:bg-red-950/30" },
};

function classifyMove(cpLoss: number): MoveClass {
  if (cpLoss < 0)   return "brilliant"; // better than engine expected (sacrifice / tactic)
  if (cpLoss <= 10)  return "great";
  if (cpLoss <= 30)  return "good";
  if (cpLoss <= 100) return "inaccuracy";
  if (cpLoss <= 200) return "mistake";
  return "blunder";
}

/** Convert centipawns (White's perspective) to 0-100 bar height for White. */
function cpToBar(cp: number): number {
  const sigmoid = 1 / (1 + Math.exp(-cp / 400));
  return Math.round(sigmoid * 100);
}

/** Lichess-style accuracy formula. */
function calcAccuracy(moves: AnalyzedMove[]): number {
  if (moves.length === 0) return 100;
  const avg = moves.reduce((s, m) => s + m.cpLoss, 0) / moves.length;
  return Math.max(0, Math.min(100, Math.round(103.1668 * Math.exp(-0.04354 * avg) - 3.1669)));
}

// ─── Parse PGN ────────────────────────────────────────────────────────────────

function parsePgn(pgn: string): MoveInfo[] {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch { return []; }

  const history = chess.history({ verbose: true });
  const positions: MoveInfo[] = [];

  const replay = new Chess();
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    const fenBefore = replay.fen();
    replay.move({ from: h.from, to: h.to, promotion: h.promotion });
    positions.push({
      san:       h.san,
      uci:       `${h.from}${h.to}${h.promotion ?? ""}`,
      fenBefore,
      fenAfter:  replay.fen(),
      color:     h.color,
      moveNum:   Math.floor(i / 2) + 1,
    });
  }
  return positions;
}

// ─── Stockfish hook ────────────────────────────────────────────────────────────

type SfResult = { cp: number; bestMove: string };

function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((r: SfResult) => void) | null>(null);
  const pendingCp = useRef(0);

  const init = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = new Worker("/stockfish.js");
    w.onmessage = (e: MessageEvent<string>) => {
      const msg = e.data;
      if (typeof msg !== "string") return;

      // Parse score (prefer score cp, fallback mate → ±30000)
      const cpMatch = msg.match(/score cp (-?\d+)/);
      if (cpMatch) pendingCp.current = parseInt(cpMatch[1]);
      const mateMatch = msg.match(/score mate (-?\d+)/);
      if (mateMatch) pendingCp.current = parseInt(mateMatch[1]) > 0 ? 30000 : -30000;

      if (msg.startsWith("bestmove")) {
        const bm = msg.split(" ")[1] ?? "";
        resolveRef.current?.({ cp: pendingCp.current, bestMove: bm });
        resolveRef.current = null;
      }
    };
    w.postMessage("uci");
    w.postMessage("isready");
    workerRef.current = w;
  }, []);

  const analyze = useCallback((fen: string, depth = 15): Promise<SfResult> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      pendingCp.current = 0;
      const w = workerRef.current;
      if (!w) { resolve({ cp: 0, bestMove: "" }); return; }
      w.postMessage(`position fen ${fen}`);
      w.postMessage(`go depth ${depth}`);
    });
  }, []);

  const terminate = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  return { init, analyze, terminate };
}

// ─── Evaluation Bar ────────────────────────────────────────────────────────────

function EvalBar({ cp }: { cp: number }) {
  const whitePct = cpToBar(cp);
  return (
    <div className="flex h-full w-5 flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
      <div className="bg-zinc-800 dark:bg-zinc-900 transition-all duration-300" style={{ flex: 100 - whitePct }} />
      <div className="bg-zinc-100 dark:bg-zinc-200 transition-all duration-300"  style={{ flex: whitePct }} />
    </div>
  );
}

// ─── GameReview Component ─────────────────────────────────────────────────────

export function GameReview({ pgn, whitePlayer, blackPlayer, onBack }: {
  pgn: string;
  whitePlayer?: string;
  blackPlayer?: string;
  onBack: () => void;
}) {
  const moves        = parsePgn(pgn);
  const fens         = [new Chess().fen(), ...moves.map((m) => m.fenAfter)];

  const [cursor, setCursor]     = useState(0);          // 0 = start, N = after move N
  const [analyzed, setAnalyzed] = useState<AnalyzedMove[]>([]);
  const [analyzing, setAnalyzing]   = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [progress, setProgress] = useState(0);

  const { init, analyze, terminate } = useStockfish();
  const abortRef = useRef(false);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setCursor((c) => Math.min(c + 1, moves.length));
      if (e.key === "ArrowLeft")  setCursor((c) => Math.max(c - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves.length]);

  // ── Run analysis ─────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (analyzing || analysisDone || moves.length === 0) return;
    setAnalyzing(true);
    abortRef.current = false;
    init();

    const results: AnalyzedMove[] = [];
    const evals: number[] = [];   // White's perspective for each FEN

    for (let i = 0; i <= moves.length; i++) {
      if (abortRef.current) break;
      const fen = fens[i];
      const sideToMove = fen.split(" ")[1] as "w" | "b";
      const { cp, bestMove } = await analyze(fen, 15);
      // Normalize to White's perspective
      const evalWhite = sideToMove === "w" ? cp : -cp;
      evals.push(evalWhite);

      if (i > 0) {
        const mv = moves[i - 1];
        // cpLoss: positive = worse move. White wants eval to stay high; Black wants it to drop.
        const delta = evals[i] - evals[i - 1];
        const cpLoss = mv.color === "w" ? -delta : delta; // negative delta is bad for White
        const classification = classifyMove(cpLoss);

        results.push({
          ...mv,
          evalBefore: evals[i - 1],
          evalAfter:  evals[i],
          cpLoss:     Math.max(0, cpLoss),
          bestMove,
          classification,
        });
        setAnalyzed([...results]);
      }

      setProgress(Math.round((i / moves.length) * 100));
    }

    setAnalyzing(false);
    setAnalysisDone(true);
  }, [analyzing, analysisDone, moves, fens, init, analyze]);

  useEffect(() => {
    return () => { abortRef.current = true; terminate(); };
  }, [terminate]);

  // ── Current display ───────────────────────────────────────────────────────
  const fen = fens[cursor] ?? new Chess().fen();
  const currentMove = cursor > 0 ? analyzed[cursor - 1] : null;
  const currentEval = cursor > 0
    ? (analyzed[cursor - 1]?.evalAfter ?? 0)
    : 0;

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (cursor > 0) {
    const mv = moves[cursor - 1];
    squareStyles[mv.uci.slice(0, 2)] = { backgroundColor: "rgba(255, 213, 0, 0.45)" };
    squareStyles[mv.uci.slice(2, 4)] = { backgroundColor: "rgba(255, 213, 0, 0.45)" };
  }

  const bestArrow = currentMove?.bestMove && currentMove.bestMove.length >= 4
    ? [{ startSquare: currentMove.bestMove.slice(0, 2), endSquare: currentMove.bestMove.slice(2, 4), color: "rgba(0,150,255,0.7)" }]
    : [];

  const whiteMoves = analyzed.filter((m) => m.color === "w");
  const blackMoves = analyzed.filter((m) => m.color === "b");
  const whiteAccuracy = calcAccuracy(whiteMoves);
  const blackAccuracy = calcAccuracy(blackMoves);

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-5 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <button onClick={onBack} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Game Review</span>
        {!analysisDone && !analyzing && (
          <button onClick={runAnalysis}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
            Analyze with Stockfish
          </button>
        )}
        {analyzing && (
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing… {progress}%
          </div>
        )}
        {analysisDone && (
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            Analysis complete
          </span>
        )}
      </div>

      {/* Analysis progress bar */}
      {analyzing && (
        <div className="h-1 bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col gap-4 p-4 md:flex-row md:items-start md:justify-center md:gap-6 md:p-6">

        {/* Board + eval bar column */}
        <div className="flex gap-2 w-full max-w-[520px]">
          {/* Eval bar */}
          <div className="flex flex-col items-center gap-1 w-5">
            <span className="text-[10px] font-mono text-zinc-400">
              {currentEval > 0 ? `+${(currentEval / 100).toFixed(1)}` : (currentEval / 100).toFixed(1)}
            </span>
            <div className="flex-1 w-full min-h-0">
              <EvalBar cp={currentEval} />
            </div>
          </div>

          {/* Board */}
          <div className="flex-1 flex flex-col gap-2">
            {/* Black label */}
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <span>♚ {blackPlayer ?? "Black"}</span>
              {analysisDone && (
                <AccuracyBadge accuracy={blackAccuracy} />
              )}
            </div>

            <Chessboard
              options={{
                position: fen,
                boardOrientation: "white",
                allowDragging: false,
                boardStyle: { borderRadius: "12px", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" },
                squareStyles,
                arrows: bestArrow,
              }}
            />

            {/* White label */}
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <span>♔ {whitePlayer ?? "White"}</span>
              {analysisDone && (
                <AccuracyBadge accuracy={whiteAccuracy} />
              )}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex w-full max-w-xs flex-col gap-3">

          {/* Navigation controls */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <button onClick={() => setCursor(0)} disabled={cursor === 0}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800">
              <SkipBack className="h-4 w-4" />
            </button>
            <button onClick={() => setCursor((c) => Math.max(c - 1, 0))} disabled={cursor === 0}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-zinc-500">
              {cursor === 0 ? "Start" : `Move ${cursor} / ${moves.length}`}
            </span>
            <button onClick={() => setCursor((c) => Math.min(c + 1, moves.length))} disabled={cursor === moves.length}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => setCursor(moves.length)} disabled={cursor === moves.length}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800">
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          <p className="text-center text-[10px] text-zinc-400">← → arrow keys to navigate</p>

          {/* Current move info */}
          {currentMove && (
            <div className={`rounded-xl border border-zinc-200 p-3 dark:border-zinc-700 ${CLASS_META[currentMove.classification].bg}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {currentMove.color === "w" ? "White" : "Black"} played{" "}
                  <span className="font-mono">{currentMove.san}</span>
                </span>
                <span className={`text-sm font-bold ${CLASS_META[currentMove.classification].color}`}>
                  {CLASS_META[currentMove.classification].symbol}
                </span>
              </div>
              <p className={`mt-0.5 text-xs font-medium ${CLASS_META[currentMove.classification].color}`}>
                {CLASS_META[currentMove.classification].label}
                {currentMove.cpLoss > 0 && ` · ${currentMove.cpLoss}cp loss`}
              </p>
              {currentMove.bestMove && currentMove.bestMove !== currentMove.uci && currentMove.bestMove.length >= 4 && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Best was:{" "}
                  <span className="font-mono text-blue-600 dark:text-blue-400">
                    {currentMove.bestMove.slice(0, 2)}→{currentMove.bestMove.slice(2, 4)}
                  </span>
                  <span className="ml-1 text-[10px] text-zinc-400">(blue arrow)</span>
                </p>
              )}
            </div>
          )}

          {/* Move list */}
          <div className="flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <p className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800">
              Moves
            </p>
            <div className="max-h-72 overflow-y-auto">
              {Array.from({ length: moves.length }, (_, i) => i).filter((i) => i % 2 === 0).map((i) => {
                const wMove = moves[i];
                const bMove = moves[i + 1];
                const wAnalysis = analyzed[i];
                const bAnalysis = analyzed[i + 1];
                const moveNum = Math.floor(i / 2) + 1;

                return (
                  <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr] items-center gap-0.5 px-2 py-0.5">
                    <span className="text-[10px] font-medium text-zinc-400">{moveNum}.</span>
                    <MoveButton
                      san={wMove.san} analysis={wAnalysis}
                      active={cursor === i + 1}
                      onClick={() => setCursor(i + 1)}
                    />
                    {bMove && (
                      <MoveButton
                        san={bMove.san} analysis={bAnalysis}
                        active={cursor === i + 2}
                        onClick={() => setCursor(i + 2)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Accuracy summary (after full analysis) */}
          {analysisDone && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="text-center">
                <p className="text-xs text-zinc-400">White</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{whiteAccuracy}%</p>
                <p className="text-[10px] text-zinc-400">accuracy</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-zinc-400">Black</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{blackAccuracy}%</p>
                <p className="text-[10px] text-zinc-400">accuracy</p>
              </div>
              <MoveSummary label="Brilliant" cls="brilliant" moves={analyzed} />
              <MoveSummary label="Blunders"  cls="blunder"   moves={analyzed} />
              <MoveSummary label="Mistakes"  cls="mistake"   moves={analyzed} />
              <MoveSummary label="Inaccuracies" cls="inaccuracy" moves={analyzed} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccuracyBadge({ accuracy }: { accuracy: number }) {
  const color = accuracy >= 85 ? "text-emerald-600 dark:text-emerald-400"
              : accuracy >= 70 ? "text-amber-500"
              : "text-red-500";
  return (
    <span className={`text-xs font-semibold ${color}`}>{accuracy}% accuracy</span>
  );
}

function MoveButton({ san, analysis, active, onClick }: {
  san: string; analysis?: AnalyzedMove; active: boolean; onClick: () => void;
}) {
  const cls = analysis?.classification;
  const meta = cls ? CLASS_META[cls] : null;
  return (
    <button onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-left text-xs font-mono font-medium transition ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {san}
      {meta && cls !== "good" && (
        <span className={`ml-0.5 ${active ? "text-zinc-300" : meta.color}`}>{meta.symbol}</span>
      )}
    </button>
  );
}

function MoveSummary({ label, cls, moves }: { label: string; cls: MoveClass; moves: AnalyzedMove[] }) {
  const count = moves.filter((m) => m.classification === cls).length;
  return (
    <div className="text-center">
      <p className={`text-sm font-bold ${CLASS_META[cls].color}`}>{count}</p>
      <p className="text-[10px] text-zinc-400">{label}</p>
    </div>
  );
}
