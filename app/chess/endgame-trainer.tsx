"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { ArrowLeft, CheckCircle2, ChevronRight, RefreshCw, Trophy } from "lucide-react";

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

type TablebaseMove = {
  uci: string;
  san: string;
  dtm: number | null;
  dtz: number | null;
  category: "win" | "draw" | "loss" | "unknown" | "cursed-win" | "blessed-loss";
  checkmate: boolean;
  stalemate: boolean;
  zeroing: boolean;
};

type TablebaseData = {
  dtm: number | null;
  dtz: number | null;
  category: "win" | "draw" | "loss" | "unknown" | "cursed-win" | "blessed-loss";
  checkmate: boolean;
  stalemate: boolean;
  moves: TablebaseMove[];
};

type MoveResult = "optimal" | "ok" | "suboptimal" | "wrong";

type LessonProgress = { completed: boolean; bestMoves: number };

// ─── Lessons ──────────────────────────────────────────────────────────────────

type Lesson = {
  id: string;
  title: string;
  icon: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  concept: string;
  fen: string;
  goal: string;
  winningSide: "w" | "b";
};

const LESSONS: Lesson[] = [
  {
    id: "kqk",
    title: "Queen & King vs King",
    icon: "♛",
    difficulty: "Beginner",
    concept: "Force the lone king to a corner, then deliver checkmate. Avoid stalemate!",
    fen: "8/8/8/4k3/8/8/8/3KQ3 w - - 0 1",
    goal: "Checkmate the lone king",
    winningSide: "w",
  },
  {
    id: "krk",
    title: "Rook & King vs King",
    icon: "♜",
    difficulty: "Beginner",
    concept: "Use the rook to cut off files and ranks, then drive the king to the edge.",
    fen: "8/8/8/4k3/8/8/8/4KR2 w - - 0 1",
    goal: "Checkmate the lone king",
    winningSide: "w",
  },
  {
    id: "kpk",
    title: "King & Pawn vs King (Win)",
    icon: "♟",
    difficulty: "Intermediate",
    concept: "Use opposition and triangulation to escort the pawn to promotion.",
    fen: "8/8/8/4k3/8/3K4/4P3/8 w - - 0 1",
    goal: "Promote the pawn",
    winningSide: "w",
  },
  {
    id: "kpk_draw",
    title: "King & Pawn vs King (Draw)",
    icon: "♟",
    difficulty: "Intermediate",
    concept: "Hold the draw — keep direct opposition in front of the pawn.",
    fen: "8/8/4k3/8/8/4K3/4P3/8 b - - 0 1",
    goal: "Hold the draw as Black",
    winningSide: "b",
  },
  {
    id: "lucena",
    title: "Lucena Position",
    icon: "♖",
    difficulty: "Advanced",
    concept: "Build a bridge: use your rook to shelter the king from checks.",
    fen: "1K1k4/1P6/8/8/8/8/r7/4R3 w - - 0 1",
    goal: "Win with the Lucena method",
    winningSide: "w",
  },
  {
    id: "philidor",
    title: "Philidor Position",
    icon: "♜",
    difficulty: "Advanced",
    concept: "Hold the draw by keeping your rook on the 6th rank until the king advances.",
    fen: "8/8/3r4/3k4/8/8/3KR3/8 b - - 0 1",
    goal: "Draw — stop the opposing king from advancing",
    winningSide: "b",
  },
];

const DIFFICULTY_COLORS = {
  Beginner: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Intermediate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Advanced: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STORAGE_KEY = "endgame_progress";

function loadProgress(): Record<string, LessonProgress> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

function saveProgress(p: Record<string, LessonProgress>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EndgameTrainer() {
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});

  useEffect(() => { setProgress(loadProgress()); }, []);

  function onComplete(lessonId: string, moveCount: number) {
    setProgress((prev) => {
      const existing = prev[lessonId];
      const updated = {
        ...prev,
        [lessonId]: {
          completed: true,
          bestMoves: existing?.bestMoves
            ? Math.min(existing.bestMoves, moveCount)
            : moveCount,
        },
      };
      saveProgress(updated);
      return updated;
    });
  }

  if (selected) {
    return (
      <LessonBoard
        lesson={selected}
        onBack={() => setSelected(null)}
        onComplete={(moves) => onComplete(selected.id, moves)}
      />
    );
  }

  const completed = Object.values(progress).filter((p) => p.completed).length;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Progress summary */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/50">
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {completed} / {LESSONS.length} completed
          </p>
          <p className="text-xs text-zinc-400">Complete all lessons to master endgames</p>
        </div>
        <Trophy className={`h-7 w-7 ${completed === LESSONS.length ? "text-amber-500" : "text-zinc-300 dark:text-zinc-600"}`} />
      </div>

      {/* Lesson list */}
      <div className="space-y-3">
        {LESSONS.map((lesson) => {
          const prog = progress[lesson.id];
          return (
            <button
              key={lesson.id}
              onClick={() => setSelected(lesson)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-2xl dark:bg-zinc-800">
                {prog?.completed ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                ) : (
                  lesson.icon
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{lesson.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${DIFFICULTY_COLORS[lesson.difficulty]}`}>
                    {lesson.difficulty}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">{lesson.concept}</p>
                {prog?.bestMoves && (
                  <p className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                    Best: {prog.bestMoves} moves
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Lesson Board ─────────────────────────────────────────────────────────────

function LessonBoard({
  lesson,
  onBack,
  onComplete,
}: {
  lesson: Lesson;
  onBack: () => void;
  onComplete: (moves: number) => void;
}) {
  const chessRef = useRef(new Chess(lesson.fen));
  const [fen, setFen]                         = useState(chessRef.current.fen());
  const [history, setHistory]                 = useState<string[]>([]);
  const [tablebase, setTablebase]             = useState<TablebaseData | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [dtmCurrent, setDtmCurrent]           = useState<number | null>(null);
  const [feedback, setFeedback]               = useState<{ result: MoveResult; msg: string } | null>(null);
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, object>>({});
  const [wrongSquares, setWrongSquares]       = useState<Record<string, object>>({});
  const [finished, setFinished]               = useState(false);
  const [moveCount, setMoveCount]             = useState(0);
  const [isOpponentTurn, setIsOpponentTurn]   = useState(false);
  const processingRef = useRef(false);

  const userSide = lesson.winningSide; // user always plays as the winning side
  const orientation = userSide === "w" ? "white" : "black";

  const fetchTablebase = useCallback(async (currentFen: string): Promise<TablebaseData | null> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chess/tablebase?fen=${encodeURIComponent(currentFen)}`);
      const data: TablebaseData = await res.json();
      setTablebase(data);
      setLoading(false);
      return data;
    } catch {
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    const chess = chessRef.current;
    // Determine initial turn
    const isMyTurn = chess.turn() === userSide;
    setIsOpponentTurn(!isMyTurn);
    fetchTablebase(chess.fen()).then((data) => {
      if (data?.dtm != null) setDtmCurrent(Math.abs(data.dtm));
      // If it's opponent's turn at start, auto-play
      if (!isMyTurn && data) autoPlayOpponent(data);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function autoPlayOpponent(data: TablebaseData) {
    const opponentMoves = data.moves.filter(
      (m) => m.category === "win" || m.category === "loss" || m.category === "draw",
    );
    // Opponent plays the "worst" move from the winning side's perspective (hardest defense)
    // Sort by dtm (pick the one that maximises distance to mate for defender)
    const best = opponentMoves.sort((a, b) => {
      const da = a.dtm == null ? -Infinity : Math.abs(a.dtm);
      const db = b.dtm == null ? -Infinity : Math.abs(b.dtm);
      return db - da;
    })[0];

    if (!best) return;

    setTimeout(() => {
      const chess = chessRef.current;
      const move = chess.move({
        from: best.uci.slice(0, 2) as never,
        to: best.uci.slice(2, 4) as never,
        promotion: best.uci[4] ?? "q",
      });
      if (!move) return;
      setLastMoveSquares({
        [best.uci.slice(0, 2)]: { background: "rgba(100,100,255,0.25)" },
        [best.uci.slice(2, 4)]: { background: "rgba(100,100,255,0.25)" },
      });
      const newFen = chess.fen();
      setFen(newFen);
      setHistory((h) => [...h, move.san]);
      setIsOpponentTurn(false);
      fetchTablebase(newFen).then((d) => {
        if (d?.dtm != null) setDtmCurrent(Math.abs(d.dtm));
      });
    }, 600);
  }

  function handleDrop(from: string, to: string): boolean {
    if (finished || isOpponentTurn || processingRef.current) return false;

    const chess = chessRef.current;

    // Validate move
    const move = chess.move({ from: from as never, to: to as never, promotion: "q" });
    if (!move) return false;

    const newFen = chess.fen();
    const moveSan = move.san;
    const playedUci = from + to;
    const prevDtm = dtmCurrent;

    setHistory((h) => [...h, moveSan]);
    setMoveCount((c) => c + 1);

    // Check for checkmate
    if (chess.isCheckmate()) {
      setFen(newFen);
      setLastMoveSquares({
        [from]: { background: "rgba(100,200,100,0.4)" },
        [to]: { background: "rgba(100,200,100,0.4)" },
      });
      setFeedback({ result: "optimal", msg: "♟ Checkmate! Excellent technique!" });
      setFinished(true);
      onComplete(moveCount + 1);
      return true;
    }

    // Check for draw
    if (chess.isDraw()) {
      setFen(newFen);
      if (lesson.id === "kpk_draw" || lesson.id === "philidor") {
        setFeedback({ result: "optimal", msg: "½ Draw! You held the position perfectly." });
        setFinished(true);
        onComplete(moveCount + 1);
        return true;
      } else {
        chess.undo();
        setFeedback({ result: "wrong", msg: "⚠ That leads to stalemate — try another move!" });
        setWrongSquares({
          [from]: { background: "rgba(220,50,50,0.35)" },
          [to]: { background: "rgba(220,50,50,0.35)" },
        });
        setTimeout(() => { setWrongSquares({}); setFeedback(null); }, 2000);
        return false;
      }
    }

    // Show board immediately, then fetch tablebase async
    setFen(newFen);
    setLastMoveSquares({
      [from]: { background: "rgba(100,200,100,0.4)" },
      [to]: { background: "rgba(100,200,100,0.4)" },
    });

    processingRef.current = true;

    // Async evaluation
    fetchTablebase(newFen).then((data) => {
      processingRef.current = false;
      const newDtm = data?.dtm != null ? Math.abs(data.dtm) : null;

      // Find the optimal move from previous tablebase data
      const optimalMove = tablebase?.moves
        .filter((m) => m.category === "win")
        .sort((a, b) => {
          const da = a.dtm == null ? Infinity : Math.abs(a.dtm);
          const db = b.dtm == null ? Infinity : Math.abs(b.dtm);
          return da - db;
        })[0];

      const isOptimal =
        optimalMove?.uci === playedUci ||
        (newDtm != null && prevDtm != null && newDtm <= prevDtm);

      if (!isOptimal && newDtm != null && prevDtm != null && newDtm > prevDtm) {
        const diff = newDtm - (prevDtm - 1);
        setFeedback({
          result: "suboptimal",
          msg: `⚠ Suboptimal — DTM increased by ${diff}. ${optimalMove ? `Try ${optimalMove.san} instead.` : "Look for a faster path."}`,
        });
        setLastMoveSquares({
          [from]: { background: "rgba(255,165,0,0.35)" },
          [to]: { background: "rgba(255,165,0,0.35)" },
        });
      } else {
        setFeedback({
          result: "optimal",
          msg: newDtm != null ? `✓ Good move! DTM: ${newDtm}` : `✓ Good move!`,
        });
      }

      if (newDtm != null) setDtmCurrent(newDtm);

      if (data && !chessRef.current.isGameOver()) {
        setIsOpponentTurn(true);
        autoPlayOpponent(data);
      }
    });

    return true;
  }

  function resetLesson() {
    chessRef.current = new Chess(lesson.fen);
    setFen(chessRef.current.fen());
    setHistory([]);
    setTablebase(null);
    setDtmCurrent(null);
    setFeedback(null);
    setLastMoveSquares({});
    setWrongSquares({});
    setFinished(false);
    setMoveCount(0);
    setIsOpponentTurn(false);

    const chess = chessRef.current;
    const isMyTurn = chess.turn() === userSide;
    setIsOpponentTurn(!isMyTurn);
    fetchTablebase(chess.fen()).then((data) => {
      if (data?.dtm != null) setDtmCurrent(Math.abs(data.dtm));
      if (!isMyTurn && data) autoPlayOpponent(data);
    });
  }

  const squareStyles = { ...lastMoveSquares, ...wrongSquares };

  const dtmDisplay = dtmCurrent != null ? dtmCurrent : "–";
  const categoryLabel: Record<string, string> = {
    win: "Winning",
    loss: "Losing",
    draw: "Draw",
    "cursed-win": "Winning (50-move)",
    "blessed-loss": "Draw (50-move)",
    unknown: "Unknown",
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Back + title */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Lessons
        </button>
        <button
          onClick={resetLesson}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      {/* Lesson info */}
      <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <span className="text-xl">{lesson.icon}</span>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{lesson.title}</p>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${DIFFICULTY_COLORS[lesson.difficulty]}`}>
            {lesson.difficulty}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{lesson.concept}</p>
        <p className="mt-1 text-xs font-medium text-violet-700 dark:text-violet-300">🎯 Goal: {lesson.goal}</p>
      </div>

      {/* Board */}
      <div className="mx-auto w-full max-w-xs">
        <Chessboard
          options={{
            position: fen,
            onPieceDrop: ({ sourceSquare, targetSquare }) => handleDrop(sourceSquare, targetSquare ?? ""),
            boardOrientation: orientation,
            squareStyles,
          }}
        />
      </div>

      {/* DTM + status bar */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-2.5 dark:bg-zinc-800/50">
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{dtmDisplay}</p>
          <p className="text-[10px] text-zinc-400">DTM (moves to mate)</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            {loading ? "Checking…" : tablebase?.category ? categoryLabel[tablebase.category] ?? tablebase.category : "–"}
          </p>
          <p className="text-[10px] text-zinc-400">Position</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{moveCount}</p>
          <p className="text-[10px] text-zinc-400">Moves played</p>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
            feedback.result === "optimal"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
              : feedback.result === "suboptimal"
              ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Finished */}
      {finished && (
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 p-5 text-center dark:from-emerald-900/20 dark:to-emerald-800/20">
          <Trophy className="mx-auto mb-2 h-8 w-8 text-amber-500" />
          <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">
            Lesson Complete!
          </p>
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Finished in {moveCount} moves
          </p>
          <button
            onClick={resetLesson}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Practice Again
          </button>
        </div>
      )}

      {/* Opponent thinking */}
      {isOpponentTurn && !finished && (
        <p className="text-center text-xs text-zinc-400 animate-pulse">Opponent is thinking…</p>
      )}

      {/* Move history */}
      {history.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {history.map((san, i) => (
            <span key={i} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {i % 2 === 0 && (
                <span className="mr-0.5 text-zinc-400">{Math.floor(i / 2) + 1}.</span>
              )}
              {san}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
