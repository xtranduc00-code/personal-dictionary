"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { RefreshCw } from "lucide-react";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" />
    ),
  },
);

// ─── Types ────────────────────────────────────────────────────────────────────

type RushMode  = "3min" | "5min" | "survival";
type RushPhase = "select" | "playing" | "gameover";
type PuzzleLevel = "beginner" | "intermediate" | "hard" | "expert";

type LibraryPuzzle = {
  id: string; fen: string; moves: string[];
  rating: number; themes: string[]; level: PuzzleLevel;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_CONFIG: Record<RushMode, { label: string; sub: string; durSecs: number | null; icon: string }> = {
  "3min":     { label: "3 Minutes",  sub: "Race the clock",          durSecs: 180,  icon: "⚡" },
  "5min":     { label: "5 Minutes",  sub: "More time, more puzzles", durSecs: 300,  icon: "🕐" },
  "survival": { label: "Survival",   sub: "3 mistakes = game over",  durSecs: null, icon: "❤️" },
};

const LIVES   = 3;
const PB_KEY  = "chess_rush_pb";

// ─── Persistence ──────────────────────────────────────────────────────────────

function getPB(): Record<RushMode, number> {
  if (typeof window === "undefined") return { "3min": 0, "5min": 0, "survival": 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(PB_KEY) ?? "{}");
    return { "3min": raw["3min"] ?? 0, "5min": raw["5min"] ?? 0, "survival": raw["survival"] ?? 0 };
  } catch { return { "3min": 0, "5min": 0, "survival": 0 }; }
}

function trySetPB(mode: RushMode, score: number): boolean {
  const pb = getPB();
  if (score > (pb[mode] ?? 0)) {
    pb[mode] = score;
    localStorage.setItem(PB_KEY, JSON.stringify(pb));
    return true;
  }
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function levelForScore(score: number): PuzzleLevel {
  if (score < 5)  return "beginner";
  if (score < 15) return "intermediate";
  if (score < 25) return "hard";
  return "expert";
}

function formatTime(ms: number): string {
  if (!isFinite(ms)) return "∞";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

async function fetchPuzzleBatch(level: PuzzleLevel, count = 20): Promise<LibraryPuzzle[]> {
  const offset = Math.floor(Math.random() * 400);
  const params = new URLSearchParams({ level, limit: String(count), offset: String(offset) });
  try {
    const res = await fetch(`/api/chess/puzzles/library?${params}`);
    const data = await res.json();
    return (data.items ?? []) as LibraryPuzzle[];
  } catch { return []; }
}

// ─── Root Component ───────────────────────────────────────────────────────────

export function PuzzleRush() {
  const [phase, setPhase]         = useState<RushPhase>("select");
  const [mode, setMode]           = useState<RushMode>("3min");
  const [finalScore, setFinalScore]   = useState(0);
  const [isNewPB, setIsNewPB]         = useState(false);
  const [sessCorrect, setSessCorrect] = useState(0);
  const [sessAttempts, setSessAttempts] = useState(0);
  const [gameKey, setGameKey]     = useState(0); // force re-mount

  function handleGameOver(score: number, correct: number, attempts: number, m: RushMode) {
    const newPb = trySetPB(m, score);
    setFinalScore(score);
    setIsNewPB(newPb);
    setSessCorrect(correct);
    setSessAttempts(attempts);
    setMode(m);
    setPhase("gameover");
  }

  function restart() {
    setGameKey((k) => k + 1);
    setPhase("playing");
  }

  if (phase === "select") {
    return <ModeSelect onSelect={(m) => { setMode(m); setPhase("playing"); }} />;
  }

  if (phase === "gameover") {
    return (
      <GameOver
        mode={mode}
        score={finalScore}
        isNewPB={isNewPB}
        correct={sessCorrect}
        attempts={sessAttempts}
        pb={getPB()[mode]}
        onPlayAgain={restart}
        onChangeMode={() => setPhase("select")}
      />
    );
  }

  return (
    <RushGame
      key={gameKey}
      mode={mode}
      onGameOver={handleGameOver}
    />
  );
}

// ─── Mode Select ──────────────────────────────────────────────────────────────

function ModeSelect({ onSelect }: { onSelect: (m: RushMode) => void }) {
  const [pb, setPb] = useState<Record<RushMode, number>>({ "3min": 0, "5min": 0, "survival": 0 });
  useEffect(() => { setPb(getPB()); }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <p className="text-4xl">⚡</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">Puzzle Rush</h2>
        <p className="text-sm text-zinc-500">Solve as many puzzles as you can!</p>
      </div>

      <div className="grid w-full max-w-xs gap-3">
        {(Object.entries(MODE_CONFIG) as [RushMode, typeof MODE_CONFIG[RushMode]][]).map(([m, cfg]) => (
          <button
            key={m}
            onClick={() => onSelect(m)}
            className="group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <span className="text-2xl">{cfg.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{cfg.label}</p>
              <p className="text-xs text-zinc-500">{cfg.sub}</p>
            </div>
            {pb[m] > 0 && (
              <div className="text-right shrink-0">
                <p className="text-[10px] font-semibold text-amber-500">PB</p>
                <p className="text-xl font-black text-zinc-900 dark:text-zinc-100">{pb[m]}</p>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Rush Game ────────────────────────────────────────────────────────────────

function RushGame({
  mode,
  onGameOver,
}: {
  mode: RushMode;
  onGameOver: (score: number, correct: number, attempts: number, mode: RushMode) => void;
}) {
  const cfg       = MODE_CONFIG[mode];
  const initMs    = cfg.durSecs != null ? cfg.durSecs * 1000 : Infinity;

  const [lives, setLives]       = useState(LIVES);
  const [score, setScore]       = useState(0);
  const [timeMs, setTimeMs]     = useState(initMs);
  const [fen, setFen]           = useState("");
  const [loading, setLoading]   = useState(true);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [flashStyle, setFlashStyle] = useState<React.CSSProperties>({
    borderRadius: "12px", boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
  });

  // Stable refs for game state (no stale closures in callbacks)
  const puzzleRef      = useRef<LibraryPuzzle | null>(null);
  const stepRef        = useRef(1);
  const chessRef       = useRef(new Chess());
  const queueRef       = useRef<LibraryPuzzle[]>([]);
  const scoreRef       = useRef(0);
  const livesRef       = useRef(LIVES);
  const attemptsRef    = useRef(0);
  const correctRef     = useRef(0);
  const gameEndedRef   = useRef(false);
  const fetchingRef    = useRef(false);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef    = useRef(Date.now());
  const transitionRef  = useRef(false); // prevent drops during puzzle transition

  // ── Load initial puzzles ──────────────────────────────────────────────────
  useEffect(() => {
    fetchPuzzleBatch("beginner", 25).then((puzzles) => {
      if (gameEndedRef.current) return;
      queueRef.current = puzzles.slice(1);
      if (puzzles[0]) loadPuzzle(puzzles[0]);
      setLoading(false);
    });
    return () => {
      gameEndedRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || !isFinite(initMs)) return;

    lastTickRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (gameEndedRef.current) return;
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      setTimeMs((prev) => {
        const next = prev - delta;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          endGame();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function endGame() {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    onGameOver(scoreRef.current, correctRef.current, attemptsRef.current, mode);
  }

  function loadPuzzle(p: LibraryPuzzle) {
    const chess = new Chess(p.fen);
    const setupUci = p.moves[0];
    if (setupUci) {
      try {
        chess.move({
          from: setupUci.slice(0, 2) as never,
          to: setupUci.slice(2, 4) as never,
          promotion: setupUci[4] ?? "q",
        });
      } catch { /* ignore invalid */ }
    }
    chessRef.current = chess;
    puzzleRef.current = p;
    stepRef.current = 1;

    const orient = chess.turn() === "w" ? "white" : "black";
    setBoardOrientation(orient);
    setFen(chess.fen());

    // Pre-fetch more when queue is low
    if (queueRef.current.length < 5 && !fetchingRef.current) {
      fetchingRef.current = true;
      const level = levelForScore(scoreRef.current);
      fetchPuzzleBatch(level, 20).then((more) => {
        queueRef.current = [...queueRef.current, ...more];
        fetchingRef.current = false;
      });
    }
  }

  function flash(type: "green" | "red") {
    const shadow = type === "green"
      ? "0 0 0 6px rgba(16,185,129,0.45), 0 4px 24px rgba(0,0,0,0.12)"
      : "0 0 0 6px rgba(239,68,68,0.45), 0 4px 24px rgba(0,0,0,0.12)";
    setFlashStyle({ borderRadius: "12px", boxShadow: shadow, transition: "box-shadow 0.15s" });
    setTimeout(() => {
      setFlashStyle({ borderRadius: "12px", boxShadow: "0 4px 24px rgba(0,0,0,0.12)", transition: "box-shadow 0.3s" });
    }, type === "green" ? 350 : 650);
  }

  function handleDrop(from: string, to: string): boolean {
    if (gameEndedRef.current || transitionRef.current || !puzzleRef.current) return false;

    const puzzle    = puzzleRef.current;
    const step      = stepRef.current;
    const expected  = puzzle.moves[step];
    if (!expected) return false;

    const played = from + to;
    const correct = played === expected.slice(0, 4);

    attemptsRef.current++;

    if (correct) {
      const chess = chessRef.current;
      try {
        chess.move({ from: from as never, to: to as never, promotion: expected[4] ?? "q" });
      } catch { return false; }

      const nextStep = step + 1;

      if (nextStep >= puzzle.moves.length) {
        // ── Puzzle complete ───────────────────────────────────────────────
        scoreRef.current++;
        correctRef.current++;
        setScore(scoreRef.current);

        flash("green");
        transitionRef.current = true;

        setTimeout(() => {
          if (gameEndedRef.current) return;
          transitionRef.current = false;
          const next = queueRef.current[0];
          if (next) {
            queueRef.current = queueRef.current.slice(1);
            loadPuzzle(next);
          }
        }, 450);
      } else {
        // ── More user moves needed — auto-play opponent ───────────────────
        setFen(chess.fen());
        transitionRef.current = true;

        setTimeout(() => {
          if (gameEndedRef.current) return;
          const oppUci = puzzle.moves[nextStep];
          if (oppUci) {
            try {
              chess.move({
                from: oppUci.slice(0, 2) as never,
                to: oppUci.slice(2, 4) as never,
                promotion: oppUci[4] ?? "q",
              });
              setFen(chess.fen());
            } catch { /* ignore */ }
          }
          stepRef.current = nextStep + 1;
          transitionRef.current = false;
        }, 400);
      }
      return true;
    } else {
      // ── Wrong move ───────────────────────────────────────────────────────
      flash("red");
      livesRef.current--;
      setLives(livesRef.current);

      if (livesRef.current <= 0) {
        setTimeout(() => endGame(), 700);
      }
      return false;
    }
  }

  const isLow = isFinite(timeMs) && timeMs < 30000;
  const ratingText = puzzleRef.current?.rating ? `Rating ${puzzleRef.current.rating}` : "";

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      {/* ── HUD ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        {/* Score */}
        <div className="flex min-w-[48px] flex-col items-center">
          <p className="text-3xl font-black tabular-nums text-zinc-900 dark:text-zinc-100">{score}</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">Score</p>
        </div>

        {/* Timer */}
        <p className={`text-4xl font-black tabular-nums transition-colors ${
          isLow ? "text-red-500 animate-pulse" : "text-zinc-900 dark:text-zinc-100"
        }`}>
          {mode === "survival" ? "∞" : formatTime(timeMs)}
        </p>

        {/* Lives */}
        <div className="flex min-w-[48px] items-center justify-end gap-0.5">
          {Array.from({ length: LIVES }).map((_, i) => (
            <span key={i} className={`text-lg transition-opacity ${i < lives ? "opacity-100" : "opacity-15"}`}>
              ❤️
            </span>
          ))}
        </div>
      </div>

      {/* ── Board ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="mx-auto aspect-square w-full max-w-xs animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" />
      ) : (
        <div className="mx-auto w-full max-w-xs">
          <Chessboard
            options={{
              position: fen,
              onPieceDrop: ({ sourceSquare, targetSquare }) =>
                handleDrop(sourceSquare, targetSquare ?? ""),
              boardOrientation,
              allowDragging: !gameEndedRef.current,
              boardStyle: flashStyle,
            }}
          />
        </div>
      )}

      {/* ── Status strip ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{MODE_CONFIG[mode].label} · No hints</span>
        {ratingText && <span>{ratingText}</span>}
      </div>
    </div>
  );
}

// ─── Game Over ────────────────────────────────────────────────────────────────

function GameOver({
  mode, score, isNewPB, correct, attempts, pb, onPlayAgain, onChangeMode,
}: {
  mode: RushMode;
  score: number;
  isNewPB: boolean;
  correct: number;
  attempts: number;
  pb: number;
  onPlayAgain: () => void;
  onChangeMode: () => void;
}) {
  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
      {/* Trophy */}
      <div className="flex flex-col items-center gap-1 text-center">
        {isNewPB ? (
          <>
            <span className="text-4xl">🏆</span>
            <p className="text-base font-bold text-amber-600 dark:text-amber-400">New Personal Best!</p>
          </>
        ) : (
          <>
            <span className="text-4xl">⚡</span>
            <p className="text-sm font-semibold text-zinc-500">Game Over</p>
          </>
        )}
        <p className="text-6xl font-black leading-none text-zinc-900 dark:text-zinc-100">{score}</p>
        <p className="text-sm text-zinc-500">puzzles solved</p>
      </div>

      {/* Stats */}
      <div className="w-full max-w-xs space-y-2">
        {[
          { label: "Accuracy",       value: `${accuracy}%` },
          { label: "Personal Best",  value: String(pb) },
          { label: "Mode",           value: MODE_CONFIG[mode].label },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <span className="text-sm text-zinc-500">{label}</span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={onPlayAgain}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <RefreshCw className="h-4 w-4" /> Play Again
        </button>
        <button
          onClick={onChangeMode}
          className="rounded-xl border border-zinc-200 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Change Mode
        </button>
      </div>
    </div>
  );
}
