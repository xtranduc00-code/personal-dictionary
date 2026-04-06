"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight,
  Loader2, Sparkles, SkipBack, SkipForward, X,
} from "lucide-react";
import { toast } from "react-toastify";
import { updateGameAccuracy } from "@/lib/chess-storage";
import { useAuth, authFetch } from "@/lib/auth-context";
import { KenChessboard } from "@/components/chess/ken-chessboard";

/** Runtime-only worker script (not bundled). Override with NEXT_PUBLIC_STOCKFISH_WORKER_URL. */
const STOCKFISH_CDN_DEFAULT =
  "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js";

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
  const blobUrlRef = useRef<string | null>(null);
  const resolveRef = useRef<((r: SfResult) => void) | null>(null);
  const pendingCp = useRef(0);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  const init = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (workerRef.current) return;
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    const url =
      (typeof process !== "undefined" &&
        process.env.NEXT_PUBLIC_STOCKFISH_WORKER_URL) ||
      STOCKFISH_CDN_DEFAULT;

    initPromiseRef.current = (async () => {
      let w: Worker;

      const res = await fetch(url, { credentials: "omit", mode: "cors" });
      if (!res.ok) throw new Error(`Stockfish script HTTP ${res.status}`);
      const code = await res.text();
      if (code.length < 1000) throw new Error("Stockfish script too small");

      const blobUrl = URL.createObjectURL(
        new Blob([code], { type: "application/javascript" }),
      );
      blobUrlRef.current = blobUrl;
      w = new Worker(blobUrl);

      w.onmessage = (e: MessageEvent<string>) => {
        const msg = e.data;
        if (typeof msg !== "string") return;

        const cpMatch = msg.match(/score cp (-?\d+)/);
        if (cpMatch) pendingCp.current = parseInt(cpMatch[1], 10);
        const mateMatch = msg.match(/score mate (-?\d+)/);
        if (mateMatch) pendingCp.current = parseInt(mateMatch[1], 10) > 0 ? 30000 : -30000;

        if (msg.startsWith("bestmove")) {
          const bm = msg.split(" ")[1] ?? "";
          resolveRef.current?.({ cp: pendingCp.current, bestMove: bm });
          resolveRef.current = null;
        }
      };

      w.postMessage("uci");
      w.postMessage("isready");
      workerRef.current = w;

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Stockfish ready timeout")), 20000);
        const onMsg = (ev: MessageEvent<string>) => {
          const m = ev.data;
          if (typeof m === "string" && m.includes("readyok")) {
            clearTimeout(t);
            w.removeEventListener("message", onMsg as never);
            resolve();
          }
        };
        w.addEventListener("message", onMsg as never);
      });
    })();

    try {
      await initPromiseRef.current;
    } catch (e) {
      initPromiseRef.current = null;
      const wKill = workerRef.current as Worker | null;
      workerRef.current = null;
      if (wKill) wKill.terminate();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      throw e;
    }
  }, []);

  const analyze = useCallback((fen: string, depth = 15): Promise<SfResult> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      pendingCp.current = 0;
      const w = workerRef.current;
      if (!w) {
        resolve({ cp: 0, bestMove: "" });
        return;
      }
      w.postMessage(`position fen ${fen}`);
      w.postMessage(`go depth ${depth}`);
    });
  }, []);

  const terminate = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    initPromiseRef.current = null;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
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

export function GameReview({ pgn, gameId, whitePlayer, blackPlayer, onBack }: {
  pgn: string;
  gameId?: string;
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

  // ── AI explanation state ──────────────────────────────────────────────────
  const [explCache, setExplCache]       = useState<Record<number, string>>({});  // keyed by cursor index
  const [explLoading, setExplLoading]   = useState(false);
  const [explCursor, setExplCursor]     = useState<number | null>(null); // which cursor has explanation shown

  // ── AI game summary state ─────────────────────────────────────────────────
  type GameSummary = { opening: string; turningPoint: string; weakness: string; suggestions: string[] };
  const [gameSummary, setGameSummary]       = useState<GameSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Save to repertoire state ──────────────────────────────────────────────
  const { user } = useAuth();
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveName, setSaveName]       = useState("");
  const [saveColor, setSaveColor]     = useState<"white" | "black">("white");
  const [saveMoveCount, setSaveMoveCount] = useState(10);
  const [saveNotes, setSaveNotes]     = useState("");
  const [savingLine, setSavingLine]   = useState(false);
  const [savedOk, setSavedOk]         = useState(false);

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
    try {
      await init();
    } catch (e) {
      console.error("[Stockfish]", e);
      toast.error("Could not load the analysis engine. Check your connection and try again.");
      setAnalyzing(false);
      return;
    }

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

    // Persist accuracy to DB if we have a game ID
    if (gameId && results.length > 0) {
      const wMoves = results.filter((m) => m.color === "w");
      const bMoves = results.filter((m) => m.color === "b");
      const wAcc = calcAccuracy(wMoves);
      const bAcc = calcAccuracy(bMoves);
      updateGameAccuracy(gameId, wAcc, bAcc).catch(() => {});
    }
  }, [analyzing, analysisDone, moves, fens, init, analyze, gameId]);

  useEffect(() => {
    return () => { abortRef.current = true; terminate(); };
  }, [terminate]);

  // ── AI: explain the move at a given cursor position ───────────────────────
  async function fetchMoveExplanation(c: number) {
    if (!analysisDone || c === 0 || analyzed[c - 1] === undefined) return;
    if (explCache[c] !== undefined) { setExplCursor(c); return; }

    setExplLoading(true);
    setExplCursor(c);

    const mv = analyzed[c - 1];
    try {
      const res = await fetch("/api/chess/review-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: mv.fenBefore,
          moveSan: mv.san,
          bestUci: mv.bestMove,
          cpLoss: mv.cpLoss,
          classification: mv.classification,
          color: mv.color,
          moveNum: mv.moveNum,
        }),
      });
      const data = await res.json() as { explanation: string };
      setExplCache((prev) => ({ ...prev, [c]: data.explanation }));
    } catch { /* ignore */ }
    finally { setExplLoading(false); }
  }

  // ── AI: full game summary ─────────────────────────────────────────────────
  async function fetchGameSummary() {
    if (summaryLoading || gameSummary || !analysisDone) return;
    setSummaryLoading(true);

    const whiteMoves = analyzed.filter((m) => m.color === "w");
    const blackMoves = analyzed.filter((m) => m.color === "b");
    const wAcc = calcAccuracy(whiteMoves);
    const bAcc = calcAccuracy(blackMoves);
    const blunders = analyzed.filter((m) => m.classification === "blunder")
      .map((m) => ({ moveNum: m.moveNum, color: m.color, san: m.san, cpLoss: m.cpLoss }));
    const mistakes = analyzed.filter((m) => m.classification === "mistake")
      .map((m) => ({ moveNum: m.moveNum, color: m.color, san: m.san, cpLoss: m.cpLoss }));

    try {
      const res = await fetch("/api/chess/review-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pgn,
          whitePlayer: whitePlayer ?? "White",
          blackPlayer: blackPlayer ?? "Black",
          whiteAccuracy: wAcc,
          blackAccuracy: bAcc,
          blunders,
          mistakes,
          totalMoves: moves.length,
        }),
      });
      const data = await res.json() as { opening: string; turningPoint: string; weakness: string; suggestions: string[] };
      setGameSummary(data);
    } catch { /* ignore */ }
    finally { setSummaryLoading(false); }
  }

  // ── Save opening line to repertoire ──────────────────────────────────────
  async function saveOpeningLine() {
    if (!saveName.trim() || !user) return;
    setSavingLine(true);
    const chess = new Chess();
    const sliced = moves.slice(0, saveMoveCount);
    const uciMoves: string[] = [];
    for (const mv of sliced) {
      chess.move({ from: mv.uci.slice(0, 2) as never, to: mv.uci.slice(2, 4) as never, promotion: mv.uci[4] ?? "q" });
      uciMoves.push(mv.uci.slice(0, 4));
    }
    await authFetch("/api/chess/repertoire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: saveName.trim(), color: saveColor, moves: uciMoves, pgn: chess.pgn(), notes: saveNotes }),
    }).catch(() => {});
    setSavingLine(false);
    setSavedOk(true);
    setTimeout(() => { setSavedOk(false); setShowSavePanel(false); }, 1500);
  }

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
        {moves.length > 0 && user && (
          <button
            onClick={() => {
              setSaveName("");
              setSaveColor("white");
              setSaveMoveCount(Math.min(10, moves.length));
              setSaveNotes("");
              setSavedOk(false);
              setShowSavePanel((v) => !v);
            }}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <BookOpen className="h-3.5 w-3.5" /> Save Opening
          </button>
        )}
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

      {/* Save Opening Panel */}
      {showSavePanel && (
        <div className="border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Save Opening to Repertoire</p>
            <button onClick={() => setShowSavePanel(false)} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Line name (e.g. Italian Game – Giuoco Piano)"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <div className="flex items-center gap-3">
              <div className="flex overflow-hidden rounded-xl border border-zinc-200 text-xs dark:border-zinc-700">
                {(["white", "black"] as const).map((c) => (
                  <button key={c} onClick={() => setSaveColor(c)}
                    className={`px-3 py-1.5 transition ${saveColor === c ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-white text-zinc-500 dark:bg-zinc-900"}`}>
                    {c === "white" ? "♔ White" : "♚ Black"}
                  </button>
                ))}
              </div>
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs text-zinc-500 shrink-0">First {saveMoveCount} plies</span>
                <input
                  type="range" min={2} max={Math.min(moves.length, 30)} value={saveMoveCount}
                  onChange={(e) => setSaveMoveCount(Number(e.target.value))}
                  className="flex-1 accent-violet-500"
                />
              </div>
            </div>
            <textarea
              value={saveNotes}
              onChange={(e) => setSaveNotes(e.target.value)}
              placeholder="Notes (optional)…"
              rows={2}
              className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm placeholder-amber-400 text-amber-900 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-200 focus:outline-none"
            />
            <button
              onClick={saveOpeningLine}
              disabled={!saveName.trim() || savingLine || savedOk}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {savingLine ? <Loader2 className="h-4 w-4 animate-spin" /> : savedOk ? "✓ Saved!" : <><BookOpen className="h-4 w-4" /> Save to Repertoire</>}
            </button>
          </div>
        </div>
      )}

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

            <KenChessboard
              options={{
                position: fen,
                boardOrientation: "white",
                allowDragging: false,
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {currentMove.color === "w" ? "White" : "Black"} played{" "}
                  <span className="font-mono">{currentMove.san}</span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-sm font-bold ${CLASS_META[currentMove.classification].color}`}>
                    {CLASS_META[currentMove.classification].symbol}
                  </span>
                  {analysisDone && (
                    <button
                      onClick={() => fetchMoveExplanation(cursor)}
                      disabled={explLoading && explCursor === cursor}
                      className="flex items-center gap-1 rounded-lg bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                    >
                      {explLoading && explCursor === cursor
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Sparkles className="h-3 w-3" />
                      }
                      Explain
                    </button>
                  )}
                </div>
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

              {/* AI explanation */}
              {explCursor === cursor && (
                <div className="mt-2 border-t border-zinc-200/60 pt-2 dark:border-zinc-700/60">
                  {explLoading ? (
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                      <div className="h-2.5 w-4/5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                      <div className="h-2.5 w-3/5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                    </div>
                  ) : explCache[cursor] ? (
                    <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                      <Sparkles className="mr-1 inline h-3 w-3 text-violet-500" />
                      {explCache[cursor]}
                    </p>
                  ) : null}
                </div>
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

          {/* AI Game Summary */}
          {analysisDone && !gameSummary && (
            <button
              onClick={fetchGameSummary}
              disabled={summaryLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
            >
              {summaryLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating summary…</>
                : <><Sparkles className="h-4 w-4" /> Get AI Game Summary</>
              }
            </button>
          )}

          {gameSummary && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-900/20">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <p className="text-sm font-bold text-violet-800 dark:text-violet-300">AI Game Summary</p>
              </div>
              <div className="space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
                {gameSummary.opening && (
                  <div>
                    <p className="mb-0.5 font-semibold text-zinc-800 dark:text-zinc-200">📖 Opening</p>
                    <p className="leading-relaxed">{gameSummary.opening}</p>
                  </div>
                )}
                {gameSummary.turningPoint && (
                  <div>
                    <p className="mb-0.5 font-semibold text-zinc-800 dark:text-zinc-200">⚡ Turning Point</p>
                    <p className="leading-relaxed">{gameSummary.turningPoint}</p>
                  </div>
                )}
                {gameSummary.weakness && (
                  <div>
                    <p className="mb-0.5 font-semibold text-zinc-800 dark:text-zinc-200">🎯 Key Weakness</p>
                    <p className="leading-relaxed">{gameSummary.weakness}</p>
                  </div>
                )}
                {gameSummary.suggestions.length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold text-zinc-800 dark:text-zinc-200">💡 Suggestions</p>
                    <ul className="space-y-1">
                      {gameSummary.suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-0.5 shrink-0 font-bold text-violet-600 dark:text-violet-400">{i + 1}.</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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
