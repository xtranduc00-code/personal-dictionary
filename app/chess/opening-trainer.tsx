"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft, BookOpen, ChevronRight, RefreshCw, RotateCcw, Star,
} from "lucide-react";
import { KenChessboard } from "@/components/chess/ken-chessboard";

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

// ─── Component ────────────────────────────────────────────────────────────────

export function OpeningTrainer() {
  const [tab, setTab] = useState<"explore" | "practice">("explore");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex border-b border-zinc-200 dark:border-zinc-700">
        {(["explore", "practice"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium capitalize transition
              ${tab === t
                ? "border-b-2 border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
          >
            {t === "explore" ? "🔭 Explore" : "🎯 Practice"}
          </button>
        ))}
      </div>

      {tab === "explore" ? <ExploreMode /> : <PracticeMode />}
    </div>
  );
}

// ─── Explore Mode ─────────────────────────────────────────────────────────────

function ExploreMode() {
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [explorer, setExplorer] = useState<ExplorerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const fetchExplorer = useCallback(async (currentFen: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/chess/opening?fen=${encodeURIComponent(currentFen)}`,
        { signal: ctrl.signal },
      );
      const data: ExplorerData = await res.json();
      setExplorer(data);
    } catch {
      // aborted or error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExplorer(fen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const top3 = (explorer?.moves ?? []).slice(0, 5);
  const total = explorer ? totalGames(explorer) : 0;
  const globalW = explorer ? pct(explorer.white, total) : "–";
  const globalD = explorer ? pct(explorer.draws, total) : "–";
  const globalB = explorer ? pct(explorer.black, total) : "–";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-3 sm:p-4">
      {/* Opening name */}
      {explorer?.opening && (
        <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2.5 dark:bg-violet-900/20">
          <BookOpen className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">
            {explorer.opening.eco} · {explorer.opening.name}
          </span>
        </div>
      )}

      {/* Board */}
      <div className="mx-auto w-full max-w-xs">
        <KenChessboard
          options={{
            position: fen,
            onPieceDrop: ({ sourceSquare, targetSquare }) => handleDrop(sourceSquare, targetSquare ?? ""),
            boardOrientation: "white",
          }}
        />
      </div>

      {/* Move history */}
      {history.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {history.map((san, i) => (
            <span key={i} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {i % 2 === 0 && <span className="mr-0.5 text-zinc-400">{Math.floor(i / 2) + 1}.</span>}
              {san}
            </span>
          ))}
          <button onClick={undo} className="ml-1 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800">
            <RotateCcw className="h-3 w-3" />
          </button>
          <button onClick={reset} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800">
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Global W/D/L */}
      {explorer && total > 0 && (
        <div className="flex gap-2 text-xs">
          <span className="flex-1 rounded-lg bg-white py-1 text-center font-semibold text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
            ♔ {globalW}
          </span>
          <span className="flex-1 rounded-lg bg-zinc-100 py-1 text-center font-semibold text-zinc-500 dark:bg-zinc-800">
            ½ {globalD}
          </span>
          <span className="flex-1 rounded-lg bg-zinc-900 py-1 text-center font-semibold text-white dark:bg-zinc-950">
            ♚ {globalB}
          </span>
        </div>
      )}

      {/* Top moves table */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {loading ? "Loading…" : top3.length ? "Top moves" : "Out of book"}
        </p>
        {top3.map((m) => {
          const t = totalGames(m);
          const wPct = t ? (m.white / t) * 100 : 0;
          const dPct = t ? (m.draws / t) * 100 : 0;
          return (
            <button
              key={m.uci}
              onClick={() => playMove(m.uci)}
              className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-violet-700 dark:hover:bg-violet-900/10"
            >
              <span className="w-8 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{m.san}</span>
              {/* W/D/L bar */}
              <div className="flex h-2 flex-1 overflow-hidden rounded-full">
                <div className="bg-white ring-1 ring-inset ring-zinc-300 dark:bg-zinc-200" style={{ width: `${wPct}%` }} />
                <div className="bg-zinc-400 dark:bg-zinc-600" style={{ width: `${dPct}%` }} />
                <div className="bg-zinc-900 dark:bg-zinc-950" style={{ width: `${100 - wPct - dPct}%` }} />
              </div>
              <span className="text-xs text-zinc-400">{Math.round(t / 1000)}k</span>
              <ChevronRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-violet-500" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Practice Mode ────────────────────────────────────────────────────────────

function PracticeMode() {
  const [selected, setSelected] = useState<QuickStart | null>(null);

  if (!selected) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="text-sm text-zinc-500">Pick a repertoire to practice:</p>
        <div className="grid gap-3">
          {QUICK_STARTS.map((qs) => (
            <button
              key={qs.id}
              onClick={() => setSelected(qs)}
              className="group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-violet-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
                <Star className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{qs.name}</p>
                <p className="text-xs text-zinc-500">{qs.subtext} · Play as {qs.playAs}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <PracticeBoard quickStart={selected} onBack={() => setSelected(null)} />;
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
    const sans: string[] = [];
    for (const uci of initialMoves) {
      const move = chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: "q" });
      if (move) sans.push(move.san);
    }
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
      const data: ExplorerData = await res.json();
      setExplorer(data);
      if (data.opening?.name) setOpeningName(data.opening.name);
    } catch { /* ignore */ }
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
    const sans: string[] = [];
    for (const uci of initialMoves) {
      const move = chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: "q" });
      if (move) sans.push(move.san);
    }
    setFen(chess.fen());
    setHistory(sans);
    setPhase(chess.turn() === playAs[0] ? "user" : "auto");
    fetchExplorer(chess.fen());
    hasBootstrapped.current = true;
  }

  const squareStyles = { ...lastMoveSquares, ...wrongSquares };

  const accuracy =
    score.correct + score.wrong > 0
      ? Math.round((score.correct / (score.correct + score.wrong)) * 100)
      : null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Repertoires
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Restart
        </button>
      </div>

      {/* Opening name */}
      {openingName && (
        <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 dark:bg-violet-900/20">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">{openingName}</span>
        </div>
      )}

      {/* Board */}
      <div className="mx-auto w-full max-w-xs">
        <KenChessboard
          options={{
            position: fen,
            onPieceDrop: ({ sourceSquare, targetSquare }) => handleUserDrop(sourceSquare, targetSquare ?? ""),
            boardOrientation: playAs,
            squareStyles,
          }}
        />
      </div>

      {/* Feedback bar */}
      {result !== "idle" && (
        <div
          className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
            result === "wrong"
              ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              : result === "correct"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
          }`}
        >
          {resultMsg}
          {result === "wrong" && correctSan && (
            <p className="mt-0.5 text-xs opacity-80">
              The book move was <strong>{correctSan}</strong>. Try again!
            </p>
          )}
        </div>
      )}

      {/* Status */}
      {phase === "auto" && !finished && (
        <p className="text-center text-xs text-zinc-400 animate-pulse">
          Opponent is thinking…
        </p>
      )}
      {finished && (
        <div className="rounded-xl bg-violet-50 px-4 py-3 text-center dark:bg-violet-900/20">
          <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
            Out of book! You&apos;ve completed the repertoire.
          </p>
          <button onClick={reset} className="mt-2 text-xs text-violet-600 underline dark:text-violet-400">
            Practice again
          </button>
        </div>
      )}

      {/* Score */}
      {(score.correct + score.wrong > 0) && (
        <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-2.5 dark:bg-zinc-800/50">
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-600">{score.correct}</p>
            <p className="text-xs text-zinc-400">Correct</p>
          </div>
          <div className="text-center">
            {accuracy !== null && (
              <>
                <p className="text-lg font-bold text-zinc-700 dark:text-zinc-200">{accuracy}%</p>
                <p className="text-xs text-zinc-400">Accuracy</p>
              </>
            )}
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-500">{score.wrong}</p>
            <p className="text-xs text-zinc-400">Wrong</p>
          </div>
        </div>
      )}

      {/* Move history */}
      {history.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {history.map((san, i) => (
            <span key={i} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {i % 2 === 0 && <span className="mr-0.5 text-zinc-400">{Math.floor(i / 2) + 1}.</span>}
              {san}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
