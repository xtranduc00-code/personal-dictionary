"use client";

import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Loader2, RefreshCw } from "lucide-react";
import { KenChessboard } from "@/components/chess/ken-chessboard";

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

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Offset 0 + client shuffle — avoids empty slice when random offset exceeded DB size */
async function fetchPuzzleBatch(level: PuzzleLevel, count = 20): Promise<LibraryPuzzle[]> {
  const params = new URLSearchParams({ level, limit: String(count), offset: "0" });
  try {
    const res = await fetch(`/api/chess/puzzles/library?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: LibraryPuzzle[] };
    const items = (data.items ?? []).filter((p) => p.level === level) as LibraryPuzzle[];
    return shuffleInPlace([...items]);
  } catch {
    return [];
  }
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

type RushLoadStatus = "loading" | "ready" | "error";

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
  const [loadStatus, setLoadStatus] = useState<RushLoadStatus>("loading");
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
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

  function endGame() {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    onGameOver(scoreRef.current, correctRef.current, attemptsRef.current, mode);
  }

  /** Returns false if FEN / moves are unusable (skip puzzle). */
  function loadPuzzle(p: LibraryPuzzle): boolean {
    if (!p?.fen || !Array.isArray(p.moves) || p.moves.length < 2) return false;

    let chess: Chess;
    try {
      chess = new Chess(p.fen);
    } catch {
      return false;
    }

    const setupUci = p.moves[0];
    if (setupUci && setupUci.length >= 4) {
      try {
        chess.move({
          from: setupUci.slice(0, 2) as never,
          to: setupUci.slice(2, 4) as never,
          promotion: setupUci[4] ?? "q",
        });
      } catch {
        return false;
      }
    }

    const nextFen = chess.fen();
    if (!nextFen || nextFen.split(" ").length < 4) return false;

    chessRef.current = chess;
    puzzleRef.current = p;
    stepRef.current = 1;

    const orient = chess.turn() === "w" ? "white" : "black";
    setBoardOrientation(orient);
    setFen(nextFen);

    // Pre-fetch more when queue is low
    if (queueRef.current.length < 5 && !fetchingRef.current) {
      fetchingRef.current = true;
      const level = levelForScore(scoreRef.current);
      fetchPuzzleBatch(level, 20).then((more) => {
        queueRef.current = [...queueRef.current, ...more];
        fetchingRef.current = false;
      });
    }
    return true;
  }

  /** Pop puzzles until one loads or queue empty. */
  function tryLoadNextFromQueue(): boolean {
    while (queueRef.current.length > 0) {
      const next = queueRef.current[0]!;
      queueRef.current = queueRef.current.slice(1);
      if (loadPuzzle(next)) return true;
    }
    return false;
  }

  // ── Load initial puzzles (do not tie unmount to game over — fixes Strict Mode) ──
  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      setLoadStatus("loading");
      setLoadError(null);

      const puzzles = (
        await Promise.all([import("react-chessboard"), fetchPuzzleBatch("beginner", 25)])
      )[1];
      if (!alive) return;

      if (puzzles.length === 0) {
        setLoadStatus("error");
        setLoadError("Failed to load puzzle");
        return;
      }

      queueRef.current = [...puzzles];

      while (queueRef.current.length > 0 && alive) {
        const next = queueRef.current[0]!;
        queueRef.current = queueRef.current.slice(1);
        if (loadPuzzle(next)) {
          setLoadStatus("ready");
          return;
        }
      }

      setLoadStatus("error");
      setLoadError("Failed to load puzzle");
    }

    bootstrap();

    return () => {
      alive = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce]);

  // ── Timer: only after first valid puzzle is on the board ─────────────────
  useEffect(() => {
    if (loadStatus !== "ready" || !isFinite(initMs)) return;

    setTimeMs(initMs);
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
  }, [loadStatus, initMs]);

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
          void (async () => {
            if (gameEndedRef.current) return;
            transitionRef.current = false;
            if (tryLoadNextFromQueue()) return;
            const more = await fetchPuzzleBatch(levelForScore(scoreRef.current), 30);
            queueRef.current = [...queueRef.current, ...more];
            if (tryLoadNextFromQueue()) return;
            endGame();
          })();
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
      <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-x-2 gap-y-1 px-0.5">
        <div className="flex min-w-[3rem] shrink-0 flex-col items-center">
          <p className="text-2xl font-black tabular-nums leading-none text-zinc-900 dark:text-zinc-100 sm:text-3xl">{score}</p>
          <p className="text-[9px] uppercase tracking-wide text-zinc-400 sm:text-[10px]">Score</p>
        </div>

        <p
          className={`min-w-0 flex-1 text-center text-3xl font-black tabular-nums leading-none transition-colors sm:text-4xl ${
            isLow ? "text-red-500 animate-pulse" : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {mode === "survival" ? "∞" : formatTime(timeMs)}
        </p>

        <div className="flex shrink-0 items-center justify-end gap-0.5">
          {Array.from({ length: LIVES }).map((_, i) => (
            <span
              key={i}
              className={`text-base transition-opacity sm:text-lg ${i < lives ? "opacity-100" : "opacity-15"}`}
              aria-hidden
            >
              ❤️
            </span>
          ))}
        </div>
      </div>

      {/* ── Board ──────────────────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-xs">
        {loadStatus === "loading" && (
          <div
            className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50"
            role="status"
            aria-live="polite"
            aria-label="Loading puzzle"
          >
            <Loader2 className="h-10 w-10 animate-spin text-zinc-400" />
            <p className="text-xs font-medium text-zinc-500">Loading puzzle…</p>
          </div>
        )}

        {loadStatus === "error" && (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50/80 p-4 text-center dark:border-red-900/50 dark:bg-red-950/30">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
              {loadError ?? "Failed to load puzzle"}
            </p>
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {loadStatus === "ready" && fen && (
          <KenChessboard
            options={{
              position: fen,
              onPieceDrop: ({ sourceSquare, targetSquare }) =>
                handleDrop(sourceSquare, targetSquare ?? ""),
              boardOrientation,
              allowDragging: !gameEndedRef.current,
              boardStyle: flashStyle,
            }}
          />
        )}
      </div>

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
