"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Heart, Loader2, RefreshCw, Zap } from "lucide-react";
import { ChessBoardWrapper } from "@/components/chess/ChessBoardWrapper";
import { squareStylesForLastMove } from "@/components/chess/move-highlight-styles";
import { useChessLegalMoves } from "@/hooks/use-chess-legal-moves";

// ─── Types ────────────────────────────────────────────────────────────────────

import type { LibraryPuzzle, PuzzleLevel } from "@/lib/chess-types";

type RushPhase = "select" | "playing" | "gameover";

export type RushPlayStyle = "survival" | "relaxed";
export type RushTimeChoice = "3min" | "5min" | "unlimited";

export type RushConfig = {
  playStyle: RushPlayStyle;
  timeChoice: RushTimeChoice;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const LIVES = 3;
const PB_KEY = "chess_rush_pb_v2";

const TIME_LABELS: Record<RushTimeChoice, string> = {
  "3min": "3 min",
  "5min": "5 min",
  unlimited: "Unlimited",
};

function rushConfigKey(c: RushConfig): string {
  return `${c.playStyle}_${c.timeChoice}`;
}

function timeChoiceToMs(t: RushTimeChoice): number {
  if (t === "3min") return 180 * 1000;
  if (t === "5min") return 300 * 1000;
  return Infinity;
}

function formatSessionSummary(c: RushConfig): string {
  const time = c.timeChoice === "unlimited" ? "Unlimited time" : TIME_LABELS[c.timeChoice];
  return c.playStyle === "survival" ? `Survival · ${time}` : `Relaxed · ${time}`;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function getPB(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(PB_KEY) ?? "{}");
    return typeof raw === "object" && raw !== null ? (raw as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function trySetPB(key: string, score: number): boolean {
  const pb = getPB();
  if (score > (pb[key] ?? 0)) {
    pb[key] = score;
    localStorage.setItem(PB_KEY, JSON.stringify(pb));
    return true;
  }
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function levelForScore(score: number): PuzzleLevel {
  if (score < 5) return "beginner";
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
  const [phase, setPhase] = useState<RushPhase>("select");
  const [rushConfig, setRushConfig] = useState<RushConfig | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [isNewPB, setIsNewPB] = useState(false);
  const [sessCorrect, setSessCorrect] = useState(0);
  const [sessAttempts, setSessAttempts] = useState(0);
  const [gameKey, setGameKey] = useState(0);

  function handleGameOver(score: number, correct: number, attempts: number) {
    if (!rushConfig) return;
    const key = rushConfigKey(rushConfig);
    const newPb = trySetPB(key, score);
    setFinalScore(score);
    setIsNewPB(newPb);
    setSessCorrect(correct);
    setSessAttempts(attempts);
    setPhase("gameover");
  }

  function restart() {
    setGameKey((k) => k + 1);
    setPhase("playing");
  }

  if (phase === "gameover" && rushConfig) {
    return (
      <GameOver
        config={rushConfig}
        score={finalScore}
        isNewPB={isNewPB}
        correct={sessCorrect}
        attempts={sessAttempts}
        pb={getPB()[rushConfigKey(rushConfig)] ?? 0}
        onPlayAgain={restart}
        onChangeMode={() => {
          setPhase("select");
        }}
      />
    );
  }

  if (phase === "playing" && rushConfig) {
    return <RushGame key={gameKey} config={rushConfig} onGameOver={handleGameOver} />;
  }

  return (
    <ModeSelect
      onStart={(c) => {
        setRushConfig(c);
        setPhase("playing");
      }}
    />
  );
}

// ─── Mode Select ──────────────────────────────────────────────────────────────

function ModeSelect({ onStart }: { onStart: (c: RushConfig) => void }) {
  const [playStyle, setPlayStyle] = useState<RushPlayStyle | null>(null);
  const [timeChoice, setTimeChoice] = useState<RushTimeChoice>("3min");
  const [pb, setPb] = useState<Record<string, number>>({});

  useEffect(() => {
    setPb(getPB());
  }, []);

  const canStart = playStyle !== null;
  const previewKey = playStyle ? rushConfigKey({ playStyle, timeChoice }) : null;
  const previewPb = previewKey ? pb[previewKey] ?? 0 : 0;

  return (
    <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto p-4 pb-8 sm:p-6">
      <div className="text-center">
        <p className="text-4xl">⚡</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">Puzzle Rush</h2>
        <p className="text-sm text-zinc-500">Choose a mode and time control, then start.</p>
      </div>

      <div className="w-full max-w-md space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Mode</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPlayStyle("survival")}
            className={`rounded-2xl border p-4 text-left transition ${
              playStyle === "survival"
                ? "border-amber-400 bg-amber-50 ring-2 ring-amber-400/40 dark:border-amber-600 dark:bg-amber-950/30"
                : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
            }`}
          >
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Survival</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              3 lives per puzzle · Classic mode
            </p>
          </button>
          <button
            type="button"
            onClick={() => setPlayStyle("relaxed")}
            className={`rounded-2xl border p-4 text-left transition ${
              playStyle === "relaxed"
                ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-400/40 dark:border-emerald-600 dark:bg-emerald-950/25"
                : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
            }`}
          >
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Relaxed</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Unlimited lives · Practice mode
            </p>
          </button>
        </div>
      </div>

      <div className="w-full max-w-md space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Time</p>
        <div className="flex flex-wrap gap-2">
          {(["3min", "5min", "unlimited"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTimeChoice(t)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition sm:min-w-[5.5rem] sm:flex-none ${
                timeChoice === t
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {TIME_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {previewKey && previewPb > 0 && (
        <p className="text-center text-xs text-amber-600 dark:text-amber-400">
          Personal best for this setup: <span className="font-bold tabular-nums">{previewPb}</span>
        </p>
      )}

      <button
        type="button"
        disabled={!canStart}
        onClick={() => {
          if (playStyle) onStart({ playStyle, timeChoice });
        }}
        className="w-full max-w-md rounded-2xl bg-amber-500 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start
      </button>
    </div>
  );
}

// ─── Rush Game ────────────────────────────────────────────────────────────────

/** Presentation-only status bar: score (secondary) · timer (primary) · lives (secondary). */
function RushGameHud({
  score,
  timerMain,
  timerSubtitle,
  isLow,
  isCritical,
  isSurvival,
  heartFilled,
}: {
  score: number;
  timerMain: string;
  timerSubtitle: string;
  isLow: boolean;
  isCritical: boolean;
  isSurvival: boolean;
  heartFilled: (i: number) => boolean;
}) {
  return (
    <header className="shrink-0 border-b border-zinc-200/90 bg-gradient-to-b from-white via-zinc-50/98 to-zinc-100/90 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900/95">
      <div className="mx-auto flex w-full max-w-5xl items-stretch gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
            Score
          </span>
          <span className="mt-0.5 text-2xl font-black tabular-nums leading-none text-zinc-800 dark:text-zinc-100 sm:text-3xl">
            {score}
          </span>
        </div>

        <div
          className={`flex min-w-0 shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-3 py-2 shadow-md transition-[box-shadow,border-color,background-color] sm:px-5 sm:py-2.5 ${
            isCritical
              ? "border-red-500 bg-red-50/95 shadow-red-500/25 dark:border-red-500 dark:bg-red-950/50"
              : isLow
                ? "border-amber-400/90 bg-amber-50/90 shadow-amber-500/15 dark:border-amber-500/70 dark:bg-amber-950/35"
                : "border-zinc-200/95 bg-white shadow-zinc-900/5 dark:border-zinc-600 dark:bg-zinc-900/90 dark:shadow-black/20"
          } ${isCritical ? "animate-pulse" : ""}`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Zap
              className={`h-4 w-4 shrink-0 sm:h-5 sm:w-5 ${
                isCritical ? "text-red-500" : isLow ? "text-amber-500" : "text-violet-500 dark:text-violet-400"
              }`}
              aria-hidden
            />
            <span
              className={`text-[1.65rem] font-black tabular-nums leading-none tracking-tight sm:text-4xl ${
                isCritical
                  ? "text-red-600 dark:text-red-400"
                  : isLow
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-zinc-900 dark:text-zinc-50"
              }`}
            >
              {timerMain}
            </span>
          </div>
          <p className="mt-1 max-w-[16rem] text-center text-[9px] font-medium leading-snug text-zinc-500 dark:text-zinc-400 sm:max-w-[20rem] sm:text-[10px]">
            {timerSubtitle}
          </p>
        </div>

        <div
          className="flex flex-1 flex-col items-end justify-center gap-0.5"
          aria-label={isSurvival ? "Lives remaining this puzzle" : "Unlimited lives"}
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
            {isSurvival ? "Lives" : "Mode"}
          </span>
          <div className="flex items-center gap-0.5 sm:gap-1">
            {isSurvival ? (
              Array.from({ length: LIVES }).map((_, i) => (
                <Heart
                  key={i}
                  className={`h-[1.15rem] w-[1.15rem] shrink-0 transition sm:h-6 sm:w-6 ${
                    heartFilled(i)
                      ? "fill-red-500 text-red-500 drop-shadow-sm"
                      : "fill-none text-zinc-300 opacity-[0.22] dark:text-zinc-600"
                  }`}
                  strokeWidth={2.25}
                  aria-hidden
                />
              ))
            ) : (
              <span className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400 sm:text-xl">
                ∞
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

type RushLoadStatus = "loading" | "ready" | "error";

function RushGame({
  config,
  onGameOver,
}: {
  config: RushConfig;
  onGameOver: (score: number, correct: number, attempts: number) => void;
}) {
  const initMs = timeChoiceToMs(config.timeChoice);
  const isSurvival = config.playStyle === "survival";

  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const [timeMs, setTimeMs] = useState(initMs);
  const [fen, setFen] = useState("");
  const [loadStatus, setLoadStatus] = useState<RushLoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [lastMoveHighlight, setLastMoveHighlight] = useState<{
    from: string;
    to: string;
    side: "user" | "opponent";
  } | null>(null);
  const [flashStyle, setFlashStyle] = useState<React.CSSProperties>({
    borderRadius: "12px", boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
  });
  const [puzzleRating, setPuzzleRating] = useState<number | null>(null);

  const puzzleRef = useRef<LibraryPuzzle | null>(null);
  const stepRef = useRef(1);
  const chessRef = useRef(new Chess());
  const queueRef = useRef<LibraryPuzzle[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(LIVES);
  const attemptsRef = useRef(0);
  const correctRef = useRef(0);
  const gameEndedRef = useRef(false);
  const fetchingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(Date.now());
  const transitionRef = useRef(false);

  const { legalMoveStyles, handlers: legalMoveHandlers, clearSelection } = useChessLegalMoves(chessRef, handleDrop, !gameEndedRef.current);

  function endGame() {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    onGameOver(scoreRef.current, correctRef.current, attemptsRef.current);
  }

  function resetLivesForNewPuzzle() {
    livesRef.current = LIVES;
    setLives(LIVES);
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

    setLastMoveHighlight(null);
    setPuzzleRating(p.rating);
    setFen(nextFen);
    resetLivesForNewPuzzle();

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

  function tryLoadNextFromQueue(): boolean {
    while (queueRef.current.length > 0) {
      const next = queueRef.current[0]!;
      queueRef.current = queueRef.current.slice(1);
      if (loadPuzzle(next)) return true;
    }
    return false;
  }

  function advanceToNextPuzzleAfterFail() {
    transitionRef.current = true;
    setTimeout(() => {
      if (gameEndedRef.current) return;
      transitionRef.current = false;
      void (async () => {
        if (tryLoadNextFromQueue()) return;
        const more = await fetchPuzzleBatch(levelForScore(scoreRef.current), 30);
        queueRef.current = [...queueRef.current, ...more];
        if (tryLoadNextFromQueue()) return;
        endGame();
      })();
    }, 450);
  }

  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      setLoadStatus("loading");
      setLoadError(null);
      setPuzzleRating(null);

      const puzzles = await fetchPuzzleBatch("beginner", 25);
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

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus, initMs]);

  function flash(type: "green" | "red") {
    const shadow =
      type === "green"
        ? "0 0 0 6px rgba(16,185,129,0.45), 0 4px 24px rgba(0,0,0,0.12)"
        : "0 0 0 6px rgba(239,68,68,0.45), 0 4px 24px rgba(0,0,0,0.12)";
    setFlashStyle({ borderRadius: "12px", boxShadow: shadow, transition: "box-shadow 0.15s" });
    setTimeout(() => {
      setFlashStyle({
        borderRadius: "12px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        transition: "box-shadow 0.3s",
      });
    }, type === "green" ? 350 : 650);
  }

  function handleDrop(from: string, to: string): boolean {
    if (gameEndedRef.current || transitionRef.current || !puzzleRef.current) return false;

    const puzzle = puzzleRef.current;
    const step = stepRef.current;
    const expected = puzzle.moves[step];
    if (!expected) return false;

    const played = from + to;
    const correct = played === expected.slice(0, 4);

    attemptsRef.current++;

    if (correct) {
      const chess = chessRef.current;
      try {
        chess.move({ from: from as never, to: to as never, promotion: expected[4] ?? "q" });
      } catch {
        return false;
      }

      setLastMoveHighlight({ from, to, side: "user" });

      const nextStep = step + 1;

      if (nextStep >= puzzle.moves.length) {
        scoreRef.current++;
        correctRef.current++;
        setScore(scoreRef.current);

        flash("green");
        transitionRef.current = true;
        /* Keep board in sync with chess.js before the next puzzle loads (avoids a late snap/jump). */
        setFen(chess.fen());

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
              setLastMoveHighlight({
                from: oppUci.slice(0, 2),
                to: oppUci.slice(2, 4),
                side: "opponent",
              });
              setFen(chess.fen());
            } catch {
              /* ignore */
            }
          }
          stepRef.current = nextStep + 1;
          transitionRef.current = false;
        }, 400);
      }
      return true;
    }

    setLastMoveHighlight(null);
    flash("red");

    if (!isSurvival) {
      return false;
    }

    livesRef.current -= 1;
    setLives(livesRef.current);

    if (livesRef.current <= 0) {
      advanceToNextPuzzleAfterFail();
    }
    return false;
  }

  const isLow = isFinite(timeMs) && timeMs < 30000;
  const isCritical = isFinite(timeMs) && timeMs < 10000;
  const timerMain = config.timeChoice === "unlimited" ? "∞" : formatTime(timeMs);
  const timeBit = config.timeChoice === "unlimited" ? "Unlimited time" : TIME_LABELS[config.timeChoice];
  const timerSubtitle =
    config.playStyle === "survival"
      ? `Survival · ${timeBit} · 3 lives per puzzle · no hints`
      : `Relaxed · ${timeBit} · unlimited lives · no hints`;

  const { boardOrientation, sideToMoveLabel } = useMemo(() => {
    if (!fen) return { boardOrientation: "white" as const, sideToMoveLabel: "…" };
    try {
      const c = new Chess(fen);
      const t = c.turn();
      return {
        boardOrientation: t === "w" ? ("white" as const) : ("black" as const),
        sideToMoveLabel: t === "b" ? "Black" : "White",
      };
    } catch {
      return { boardOrientation: "white" as const, sideToMoveLabel: "…" };
    }
  }, [fen]);

  const heartFilled = (i: number) => {
    if (!isSurvival) return true;
    return i < lives;
  };

  const sideIsBlack = sideToMoveLabel === "Black";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-zinc-100/80 dark:bg-zinc-950">
      <RushGameHud
        score={score}
        timerMain={timerMain}
        timerSubtitle={timerSubtitle}
        isLow={isLow}
        isCritical={isCritical}
        isSurvival={isSurvival}
        heartFilled={heartFilled}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-2 pb-2 pt-2 sm:px-4 sm:pb-3 sm:pt-3">
          {loadStatus === "loading" && (
            <div
              className="mx-auto flex aspect-square w-full max-w-lg flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-200/90 bg-white/90 shadow-inner dark:border-zinc-700 dark:bg-zinc-900/60"
              role="status"
              aria-live="polite"
              aria-label="Loading puzzle"
            >
              <Loader2 className="h-10 w-10 animate-spin text-violet-500/80" />
              <p className="text-xs font-semibold text-zinc-500">Loading puzzle…</p>
            </div>
          )}

          {loadStatus === "error" && (
            <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-4 rounded-2xl border border-red-200/90 bg-red-50/90 p-6 text-center shadow-sm dark:border-red-900/50 dark:bg-red-950/40">
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
            /* justify-start: avoids vertical “jump” when hint/rating height changes (flex-center recenters every render). */
            <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-start gap-2.5 pt-1 sm:gap-3 sm:pt-2">
              <div className="flex w-full max-w-md shrink-0 flex-col items-center justify-start gap-1.5">
                <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/90 sm:px-4 sm:py-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                    Your move
                  </span>
                  <span
                    className={`min-w-[5.5rem] rounded-full px-2.5 py-0.5 text-center text-xs font-extrabold tabular-nums shadow-sm sm:min-w-[6rem] sm:text-sm ${
                      sideIsBlack
                        ? "bg-zinc-900 text-amber-100 dark:bg-zinc-950 dark:text-amber-50"
                        : "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-100 dark:text-zinc-950 dark:ring-zinc-600"
                    }`}
                  >
                    {sideIsBlack ? "♚ Black" : "♔ White"}
                  </span>
                </div>
              </div>

              <div className="flex w-full shrink-0 justify-center px-0.5">
                <ChessBoardWrapper
                  sizePreset="rush"
                  className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/[0.06] dark:ring-white/10"
                  fixedEdgeNotation={false}
                  options={{
                    position: fen,
                    onPieceDrop: ({ sourceSquare, targetSquare }) => {
                      clearSelection();
                      return handleDrop(sourceSquare, targetSquare ?? "");
                    },
                    boardOrientation,
                    allowDragging: !gameEndedRef.current,
                    boardStyle: flashStyle,
                    squareStyles: {
                      ...(lastMoveHighlight
                        ? squareStylesForLastMove(
                            lastMoveHighlight.from,
                            lastMoveHighlight.to,
                            lastMoveHighlight.side,
                          )
                        : {}),
                      ...legalMoveStyles,
                    },
                    ...legalMoveHandlers,
                  }}
                />
              </div>

              {/* Always reserve rating row height so puzzle swap / async queue doesn’t collapse and shift layout. */}
              <div className="flex min-h-[2.75rem] w-full shrink-0 items-start justify-center sm:min-h-[3rem]">
                {puzzleRating != null ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50/90 px-3 py-1.5 shadow-sm dark:border-amber-800/60 dark:from-amber-950/50 dark:to-orange-950/40 sm:px-4 sm:py-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-800/80 dark:text-amber-400/90">
                      Puzzle rating
                    </span>
                    <span className="min-w-[2.5rem] text-center text-base font-black tabular-nums text-amber-950 dark:text-amber-100 sm:text-lg">
                      {puzzleRating}
                    </span>
                  </div>
                ) : (
                  <div className="h-9 w-full max-w-xs rounded-full border border-transparent opacity-0 sm:h-10" aria-hidden />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Game Over ────────────────────────────────────────────────────────────────

function GameOver({
  config,
  score,
  isNewPB,
  correct,
  attempts,
  pb,
  onPlayAgain,
  onChangeMode,
}: {
  config: RushConfig;
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

      <div className="w-full max-w-xs space-y-2">
        {[
          { label: "Accuracy", value: `${accuracy}%` },
          { label: "Personal Best", value: String(pb) },
          { label: "Setup", value: formatSessionSummary(config) },
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

      <div className="flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <RefreshCw className="h-4 w-4" /> Play Again
        </button>
        <button
          type="button"
          onClick={onChangeMode}
          className="rounded-xl border border-zinc-200 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Change Mode
        </button>
      </div>
    </div>
  );
}
