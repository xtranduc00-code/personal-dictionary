"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChessMoveAnnounceChip } from "@/components/chess-move-announce-chip";
import { useChessMoveAnnouncement } from "@/hooks/use-chess-move-announcement";
import { ChessBoardWrapper } from "@/components/chess/ChessBoardWrapper";
import { BoardLayoutShell } from "@/components/chess/board-layout-shell";
import { ChessListPage } from "@/components/chess/chess-list-page";
import { squareStylesForLastMove } from "@/components/chess/move-highlight-styles";
import { useChessLegalMoves } from "@/hooks/use-chess-legal-moves";
import { Chess } from "chess.js";
import { ArrowLeft, CheckCircle2, ChevronRight, Lightbulb, RefreshCw, Star, Target, Trophy } from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  win: "Winning",
  loss: "Losing",
  draw: "Draw",
  "cursed-win": "Winning (50-move)",
  "blessed-loss": "Draw (50-move)",
  unknown: "Unknown",
};

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
  difficulty: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  concept: string;
  fen: string;
  goal: string;
  winningSide: "w" | "b";
  drawGoal?: boolean;
};

const LESSONS: Lesson[] = [
  // ── Beginner ────────────────────────────────────────────────────────────────
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
  // ── Intermediate ────────────────────────────────────────────────────────────
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
    drawGoal: true,
  },
  {
    id: "kbbk",
    title: "Two Bishops vs King",
    icon: "♗",
    difficulty: "Intermediate",
    concept: "Use both bishops and the king together to drive the lone king to the edge, then corner it for checkmate.",
    fen: "8/8/3k4/8/8/8/3BB3/4K3 w - - 0 1",
    goal: "Checkmate the lone king with the bishop pair",
    winningSide: "w",
  },
  {
    id: "zugzwang",
    title: "Zugzwang & Key Squares",
    icon: "♙",
    difficulty: "Intermediate",
    concept: "The key squares for a d-pawn are c6, d6 and e6. Get your king to a key square and the pawn promotes — it's zugzwang!",
    fen: "8/8/8/4k3/3P4/3K4/8/8 w - - 0 1",
    goal: "Advance the pawn by reaching its key squares",
    winningSide: "w",
  },
  {
    id: "passed_pawn",
    title: "Passed Pawn Endgame",
    icon: "♟",
    difficulty: "Intermediate",
    concept: "Escort the passed pawn to promotion. The king leads the charge — use it aggressively to clear the path.",
    fen: "8/8/3k4/8/8/3P4/3K4/8 w - - 0 1",
    goal: "Promote the passed pawn",
    winningSide: "w",
  },
  {
    id: "philidor2",
    title: "Philidor Defense (R+P vs R)",
    icon: "♜",
    difficulty: "Intermediate",
    concept: "When the pawn reaches the 6th rank, move your rook to the 8th rank, then harass from behind. The passive defense fails!",
    fen: "4k3/8/4P3/4K3/8/8/8/R6r b - - 0 1",
    goal: "Hold the draw as Black — use the Philidor technique",
    winningSide: "b",
    drawGoal: true,
  },
  // ── Advanced ─────────────────────────────────────────────────────────────────
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
    title: "Philidor Position (R vs R)",
    icon: "♜",
    difficulty: "Advanced",
    concept: "Hold the draw by keeping your rook on the 6th rank until the king advances.",
    fen: "8/8/3r4/3k4/8/8/3KR3/8 b - - 0 1",
    goal: "Draw — stop the opposing king from advancing",
    winningSide: "b",
    drawGoal: true,
  },
  {
    id: "ocb",
    title: "Opposite Colored Bishops",
    icon: "♗",
    difficulty: "Advanced",
    concept: "A bishop on the wrong color can't control the pawn's promotion square. Get your king to the corner for stalemate!",
    fen: "8/Pk6/8/K7/8/8/1B6/8 b - - 0 1",
    goal: "Hold the draw — reach the a8 corner to force stalemate",
    winningSide: "b",
    drawGoal: true,
  },
  {
    id: "rook_7th",
    title: "Rook on the 7th Rank",
    icon: "♖",
    difficulty: "Advanced",
    concept: "A rook on the 7th rank cuts off the enemy king and creates decisive threats. Combined with a passer it becomes unstoppable.",
    fen: "r5k1/1R4P1/8/8/8/8/8/6K1 w - - 0 1",
    goal: "Win using the dominant rook on the 7th rank",
    winningSide: "w",
  },
  {
    id: "qvr",
    title: "Queen vs Rook",
    icon: "♛",
    difficulty: "Advanced",
    concept: "The queen defeats the rook — use skewers and forks to win the rook cleanly. Avoid perpetual checks and stalemate traps.",
    fen: "8/8/8/4k3/8/8/3r4/4KQ2 w - - 0 1",
    goal: "Win the rook with precise queen technique",
    winningSide: "w",
  },
  {
    id: "active_king",
    title: "Active King in Rook Endgame",
    icon: "♔",
    difficulty: "Advanced",
    concept: "An active king is your most powerful piece in the endgame. Use it aggressively to support the pawn and dominate the position.",
    fen: "8/8/3k4/3r4/3P4/3K4/8/8 w - - 0 1",
    goal: "Use the active king to escort the pawn to promotion",
    winningSide: "w",
  },
  // ── Expert ───────────────────────────────────────────────────────────────────
  {
    id: "bnk",
    title: "Bishop & Knight vs King",
    icon: "♞",
    difficulty: "Expert",
    concept: "The hardest basic checkmate. Drive the king to a corner that matches your bishop's color, using the W-maneuver with the knight.",
    fen: "8/8/8/4k3/8/8/8/3KNB2 w - - 0 1",
    goal: "Force checkmate — drive the king to the correct corner",
    winningSide: "w",
  },
];

const DIFFICULTY_COLORS = {
  Beginner:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Intermediate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Advanced:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Expert:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
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

export function EndgameTrainer({ onBack }: { onBack?: () => void }) {
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

  const allComplete = completed === LESSONS.length;

  return (
    <ChessListPage>
      <div className="flex w-full max-w-[800px] flex-col gap-4 py-4 mx-auto">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 self-start text-sm font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        )}
        {/* Progress summary */}
        <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/50">
          <div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {completed} / {LESSONS.length} completed
            </p>
            <p className="text-xs text-zinc-400">Complete all lessons to master endgames</p>
          </div>
          <div
            className="group relative flex items-center gap-2"
            title={
              allComplete
                ? "Master badge unlocked!"
                : `Master badge — complete all ${LESSONS.length} lessons to unlock`
            }
          >
            <span className="hidden text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:inline">
              {allComplete ? "Master badge unlocked!" : `Master badge · ${LESSONS.length - completed} to go`}
            </span>
            <Trophy
              className={`h-7 w-7 ${allComplete ? "text-amber-500" : "text-zinc-300 dark:text-zinc-600"}`}
              aria-label={
                allComplete
                  ? "Master badge unlocked"
                  : `Master badge — complete all ${LESSONS.length} lessons to unlock`
              }
            />
          </div>
        </div>

      {/* Lesson list — grouped by difficulty, wrapped in a single card to match
          the opening trainer's "Choose a line" container. */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900 dark:shadow-black/20 sm:p-5">
        <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          All lessons
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Master each endgame before moving on to the next difficulty.
        </p>
        <div className="mt-4 space-y-5">
          {(["Beginner", "Intermediate", "Advanced", "Expert"] as const).map((diff) => {
            const group = LESSONS.filter((l) => l.difficulty === diff);
            if (group.length === 0) return null;
            return (
              <div key={diff} className="space-y-2">
                <p className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">{diff}</p>
                {group.map((lesson) => {
                  const prog = progress[lesson.id];
                  const isDraw = !!lesson.drawGoal;
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => setSelected(lesson)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/50 p-3 text-left transition hover:border-emerald-400/70 hover:bg-emerald-50/60 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/25 sm:gap-4 sm:p-3.5"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                        {prog?.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <Star className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{lesson.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${DIFFICULTY_COLORS[lesson.difficulty]}`}>
                            {lesson.difficulty}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                          {lesson.concept}
                          <span className="text-zinc-400"> · </span>
                          <span
                            className={
                              isDraw
                                ? "font-medium text-zinc-500 dark:text-zinc-400"
                                : "font-medium text-emerald-600 dark:text-emerald-400"
                            }
                          >
                            {isDraw ? "Draw" : "Win"}
                          </span>
                          {prog?.bestMoves ? (
                            <>
                              <span className="text-zinc-400"> · </span>
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                Best {prog.bestMoves}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" aria-hidden />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </ChessListPage>
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
  const { chip: moveAnnounceChip, announce: announceMove } = useChessMoveAnnouncement();

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
    // Include all move categories — cursed-win / blessed-loss are valid opponent moves
    const opponentMoves = data.moves.filter(
      (m) => m.category !== "unknown",
    );
    // Opponent plays the "worst" move from the winning side's perspective (hardest defense)
    // Sort by dtm (pick the one that maximises distance to mate for defender)
    const best = opponentMoves.sort((a, b) => {
      const da = a.dtm == null ? -Infinity : Math.abs(a.dtm);
      const db = b.dtm == null ? -Infinity : Math.abs(b.dtm);
      return db - da;
    })[0];

    // If no valid move or no data, just unlock the board
    if (!best) {
      setIsOpponentTurn(false);
      return;
    }

    setTimeout(() => {
      const chess = chessRef.current;
      const move = chess.move({
        from: best.uci.slice(0, 2) as never,
        to: best.uci.slice(2, 4) as never,
        promotion: best.uci[4] ?? "q",
      });
      if (!move) {
        // Move failed (shouldn't happen) — unlock the board
        setIsOpponentTurn(false);
        return;
      }
      announceMove(move, chess);
      setLastMoveSquares(squareStylesForLastMove(best.uci.slice(0, 2), best.uci.slice(2, 4), "opponent"));
      const newFen = chess.fen();
      setFen(newFen);
      setHistory((h) => [...h, move.san]);

      // If the opponent triggers a draw in a draw-goal lesson, that counts as success
      if (chess.isDraw() && lesson.drawGoal) {
        setFeedback({ result: "optimal", msg: "½ Draw! You held the position perfectly." });
        setFinished(true);
        setIsOpponentTurn(false);
        return;
      }

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
      announceMove(move, chess);
      setFen(newFen);
      setLastMoveSquares(squareStylesForLastMove(from, to, "user"));
      setFeedback({ result: "optimal", msg: "♟ Checkmate! Excellent technique!" });
      setFinished(true);
      onComplete(moveCount + 1);
      return true;
    }

    // Check for draw
    if (chess.isDraw()) {
      setFen(newFen);
      if (lesson.drawGoal) {
        announceMove(move, chess);
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

    announceMove(move, chess);

    // Show board immediately, then fetch tablebase async
    setFen(newFen);
    setLastMoveSquares(squareStylesForLastMove(from, to, "user"));

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
    clearSelection();

    const chess = chessRef.current;
    const isMyTurn = chess.turn() === userSide;
    setIsOpponentTurn(!isMyTurn);
    fetchTablebase(chess.fen()).then((data) => {
      if (data?.dtm != null) setDtmCurrent(Math.abs(data.dtm));
      if (!isMyTurn && data) autoPlayOpponent(data);
    });
  }

  const canInteract = !finished && !isOpponentTurn && !processingRef.current;
  const { legalMoveStyles, handlers: legalMoveHandlers, clearSelection } = useChessLegalMoves(chessRef, handleDrop, canInteract);

  const squareStyles = useMemo(() => ({ ...lastMoveSquares, ...wrongSquares, ...legalMoveStyles }), [lastMoveSquares, wrongSquares, legalMoveStyles]);

  const dtmDisplay = dtmCurrent != null ? dtmCurrent : "–";

  const positionCategory = tablebase?.category;
  const positionValue = loading ? "…" : positionCategory ? (CATEGORY_LABELS[positionCategory] ?? positionCategory) : "–";
  const positionValueClass =
    positionCategory === "draw" || positionCategory === "blessed-loss"
      ? "text-zinc-700 dark:text-zinc-300"
      : positionCategory === "win" || positionCategory === "cursed-win"
        ? "text-emerald-700 dark:text-emerald-400"
        : positionCategory === "loss"
          ? "text-red-700 dark:text-red-400"
          : "text-zinc-800 dark:text-zinc-100";

  const objectiveBlock = (
    <div className="rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/90">
      <div className="flex gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 dark:bg-emerald-400/10">
          <Target className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Training objective
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
            {lesson.goal}
          </p>
          <p className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400 lg:text-[11px] lg:leading-relaxed">
            {lesson.concept}
          </p>
        </div>
      </div>
    </div>
  );

  const statsBlock = (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-zinc-200/90 bg-zinc-50/90 p-2 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="rounded-lg bg-white/80 px-1.5 py-2 text-center dark:bg-zinc-900/50">
        <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">DTM</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{dtmDisplay}</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">to mate</p>
      </div>
      <div className="rounded-lg bg-white/80 px-1.5 py-2 text-center dark:bg-zinc-900/50">
        <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Eval</p>
        <p
          className={`mt-1 line-clamp-2 text-xs font-semibold leading-tight ${loading ? "text-zinc-400" : positionValueClass}`}
        >
          {positionValue}
        </p>
      </div>
      <div className="rounded-lg bg-white/80 px-1.5 py-2 text-center dark:bg-zinc-900/50">
        <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Moves</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{moveCount}</p>
      </div>
    </div>
  );

  const moveListBlock = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <p className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Moves
      </p>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {history.length === 0 ? (
          <p className="text-[11px] italic text-zinc-400 dark:text-zinc-500">
            Make a move to see the line.
          </p>
        ) : (
          <div className="grid grid-cols-[1.75rem_1fr_1fr] gap-x-1.5 gap-y-0.5 font-mono text-[11px] tabular-nums">
            {(() => {
              const rows: Array<{ num: number; w?: string; b?: string }> = [];
              for (let i = 0; i < history.length; i += 2) {
                rows.push({ num: i / 2 + 1, w: history[i], b: history[i + 1] });
              }
              return rows.map((r) => (
                <React.Fragment key={`mv-${r.num}`}>
                  <span className="text-zinc-400 dark:text-zinc-500">{r.num}.</span>
                  <span className="text-zinc-700 dark:text-zinc-200">{r.w ?? ""}</span>
                  <span className="text-zinc-700 dark:text-zinc-200">{r.b ?? ""}</span>
                </React.Fragment>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );

  // Lesson-specific tip — short, generated from the lesson goal/concept so it
  // feels relevant to what the player is trying to do.
  const lessonTip = `${lesson.goal}. ${lesson.concept}`;

  return (
    <BoardLayoutShell
      left={
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Lessons
          </button>

          {/* Lesson identity */}
          <div>
            <p className="text-2xl leading-none" aria-hidden>{lesson.icon}</p>
            <p className="mt-1.5 text-xs font-bold leading-snug text-zinc-900 dark:text-zinc-100">{lesson.title}</p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${DIFFICULTY_COLORS[lesson.difficulty]}`}>
              {lesson.difficulty}
            </span>
          </div>

          {/* Objective */}
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-2 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/25">
            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Goal</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-snug text-emerald-900 dark:text-emerald-100">{lesson.goal}</p>
            <p className="mt-1 text-[10px] leading-snug text-emerald-700/80 dark:text-emerald-300/70">{lesson.concept}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-200/90 bg-zinc-50/90 p-1.5 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="rounded bg-white/80 px-1 py-1.5 text-center dark:bg-zinc-900/50">
              <p className="text-[8px] font-bold uppercase text-zinc-400">DTM</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{dtmDisplay}</p>
            </div>
            <div className="rounded bg-white/80 px-1 py-1.5 text-center dark:bg-zinc-900/50">
              <p className="text-[8px] font-bold uppercase text-zinc-400">Eval</p>
              <p className={`mt-0.5 text-[10px] font-semibold leading-tight ${loading ? "text-zinc-400" : positionValueClass}`}>{positionValue}</p>
            </div>
            <div className="rounded bg-white/80 px-1 py-1.5 text-center dark:bg-zinc-900/50">
              <p className="text-[8px] font-bold uppercase text-zinc-400">Moves</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{moveCount}</p>
            </div>
          </div>

          <ChessMoveAnnounceChip text={moveAnnounceChip} />

          {/* Feedback */}
          {feedback && (
            <div className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium leading-snug ${
              feedback.result === "optimal"
                ? "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/35 dark:text-emerald-300"
                : feedback.result === "suboptimal"
                  ? "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-200"
                  : "border-red-200/80 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-300"
            }`}>
              {feedback.msg}
            </div>
          )}

          {finished && (
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 p-2 text-center dark:border-emerald-800/40 dark:bg-emerald-950/30">
              <Trophy className="mx-auto mb-1 h-5 w-5 text-amber-500" />
              <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Complete!</p>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-400">{moveCount} moves</p>
              <button type="button" onClick={resetLesson} className="mt-1.5 w-full rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700">
                Retry
              </button>
            </div>
          )}

          {isOpponentTurn && !finished && (
            <p className="text-[11px] font-medium text-zinc-400 animate-pulse">Opponent thinking…</p>
          )}
        </div>
      }
      right={
        <>
          {/* Moves history */}
          {moveListBlock}

          {/* Lesson tip — generated from the goal + concept */}
          <div className="mt-3 shrink-0 rounded-md border border-amber-200/80 bg-amber-50/70 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/25 dark:text-amber-300">
            <p className="flex items-start gap-1.5">
              <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{lessonTip}</span>
            </p>
          </div>

          {/* Reset — pinned to the bottom of the right panel */}
          <button
            type="button"
            onClick={resetLesson}
            className="mt-3 flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-300/60 bg-zinc-100/80 px-2.5 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200/80 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </button>
        </>
      }
    >
      {(boardEdge) => (
        <ChessBoardWrapper
          useViewportSizeFallback={false}
          forcedBoardWidth={boardEdge > 0 ? boardEdge : undefined}
          fixedEdgeNotation={false}
          className="overflow-hidden"
          options={{
            position: fen,
            onPieceDrop: ({ sourceSquare, targetSquare }) => { clearSelection(); return handleDrop(sourceSquare, targetSquare ?? ""); },
            boardOrientation: orientation,
            boardStyle: { borderRadius: 0, border: "none" },
            squareStyles,
            ...legalMoveHandlers,
          }}
        />
      )}
    </BoardLayoutShell>
  );
}
