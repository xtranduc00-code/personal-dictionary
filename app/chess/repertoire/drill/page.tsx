"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import {
  ArrowLeft, CheckCircle2, ChevronRight, Loader2, RotateCcw, StickyNote, XCircle,
} from "lucide-react";
import { useAuth, authFetch } from "@/lib/auth-context";
import { type RepertoireLine, lineFromRow, movesToSan } from "../utils";
import { ChessBoardWrapper } from "@/components/chess/ChessBoardWrapper";

// ─── Types ────────────────────────────────────────────────────────────────────

type DrillPhase = "select" | "drilling" | "summary";

interface LineResult {
  lineId: string;
  lineName: string;
  color: "white" | "black";
  correct: number;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortBySpacedRepetition(lines: RepertoireLine[]): RepertoireLine[] {
  return [...lines].sort((a, b) => {
    // Never-drilled first
    if (!a.lastDrilledAt && b.lastDrilledAt) return -1;
    if (a.lastDrilledAt && !b.lastDrilledAt) return 1;
    // Then lowest score %
    const scoreA = a.drillTotal > 0 ? a.drillCorrect / a.drillTotal : 0;
    const scoreB = b.drillTotal > 0 ? b.drillCorrect / b.drillTotal : 0;
    if (Math.abs(scoreA - scoreB) > 0.05) return scoreA - scoreB;
    // Then least recently drilled
    if (!a.lastDrilledAt) return 0;
    if (!b.lastDrilledAt) return 0;
    return new Date(a.lastDrilledAt).getTime() - new Date(b.lastDrilledAt).getTime();
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DrillPage() {
  const { user } = useAuth();
  const [allLines, setAllLines]   = useState<RepertoireLine[]>([]);
  const [loading, setLoading]     = useState(true);
  const [phase, setPhase]         = useState<DrillPhase>("select");
  const [drillQueue, setDrillQueue] = useState<RepertoireLine[]>([]);
  const [results, setResults]     = useState<LineResult[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authFetch("/api/chess/repertoire");
      const data = (await res.json()) as Record<string, unknown>[];
      setAllLines(data.map(lineFromRow));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function startDrill(lines: RepertoireLine[]) {
    setDrillQueue(sortBySpacedRepetition(lines));
    setResults([]);
    setPhase("drilling");
  }

  async function handleLineComplete(result: LineResult) {
    setResults((prev) => [...prev, result]);
    // Persist stats
    await authFetch(`/api/chess/repertoire/${result.lineId}/drill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correct: result.correct, total: result.total }),
    }).catch(() => {});
  }

  function handleSessionDone(remaining: RepertoireLine[]) {
    void remaining;
    setPhase("summary");
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (phase === "select") {
    return (
      <DrillSelect
        lines={allLines}
        onStart={startDrill}
      />
    );
  }

  if (phase === "drilling") {
    return (
      <DrillSession
        queue={drillQueue}
        onLineComplete={handleLineComplete}
        onDone={handleSessionDone}
      />
    );
  }

  return (
    <DrillSummary
      results={results}
      onPlayAgain={() => {
        if (drillQueue.length > 0) {
          setResults([]);
          setPhase("drilling");
        } else {
          setPhase("select");
        }
      }}
      onBack={() => setPhase("select")}
    />
  );
}

// ─── Drill Select ─────────────────────────────────────────────────────────────

function DrillSelect({ lines, onStart }: { lines: RepertoireLine[]; onStart: (lines: RepertoireLine[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(lines.map((l) => l.id)));
  const [colorFilter, setColorFilter] = useState<"all" | "white" | "black">("all");

  const filtered = colorFilter === "all" ? lines : lines.filter((l) => l.color === colorFilter);
  const toStart = lines.filter((l) => selected.has(l.id));

  function toggleAll() {
    if (filtered.every((l) => selected.has(l.id))) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((l) => next.delete(l.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((l) => next.add(l.id));
        return next;
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/90">
        <Link href="/chess/repertoire" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Drill Mode</span>
        <button
          disabled={toStart.length === 0}
          onClick={() => onStart(toStart)}
          className="ml-auto flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Start ⚡ ({toStart.length})
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-8">
        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-zinc-400">No lines to drill yet.</p>
            <Link href="/chess/repertoire" className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">
              ← Add Lines First
            </Link>
          </div>
        ) : (
          <>
            {/* Filter + select all */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 overflow-hidden rounded-xl border border-zinc-200 text-xs dark:border-zinc-700">
                {(["all", "white", "black"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setColorFilter(c)}
                    className={`flex-1 py-1.5 transition ${
                      colorFilter === c
                        ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-white text-zinc-500 hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {c === "all" ? "All" : c === "white" ? "♔" : "♚"}
                  </button>
                ))}
              </div>
              <button onClick={toggleAll} className="text-xs text-emerald-600 dark:text-emerald-400">
                {filtered.every((l) => selected.has(l.id)) ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div className="space-y-2">
              {filtered.map((line) => {
                const on = selected.has(line.id);
                const score = line.drillTotal > 0
                  ? Math.round((line.drillCorrect / line.drillTotal) * 100)
                  : null;
                return (
                  <button
                    key={line.id}
                    onClick={() => setSelected((prev) => {
                      const next = new Set(prev);
                      on ? next.delete(line.id) : next.add(line.id);
                      return next;
                    })}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      on
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                    }`}
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      on ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 dark:border-zinc-600"
                    }`}>
                      {on && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{line.name}</p>
                      <p className="font-mono text-[10px] text-zinc-400 truncate">{movesToSan(line.moves)}</p>
                    </div>
                    {score != null && (
                      <span className={`shrink-0 text-xs font-bold ${
                        score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500"
                      }`}>{score}%</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Drill Session ────────────────────────────────────────────────────────────

function DrillSession({
  queue,
  onLineComplete,
  onDone,
}: {
  queue: RepertoireLine[];
  onLineComplete: (r: LineResult) => void;
  onDone: (remaining: RepertoireLine[]) => void;
}) {
  const [lineIdx, setLineIdx]       = useState(0);
  const [step, setStep]             = useState(0);
  const [fen, setFen]               = useState(new Chess().fen());
  const [lineCorrect, setLineCorrect] = useState(0);
  const [lineTotal, setLineTotal]   = useState(0);
  const [status, setStatus]         = useState<"idle" | "correct" | "wrong">("idle");
  const [wrongPlayedSq, setWrongPlayedSq] = useState<{ from: string; to: string } | null>(null);
  const [correctSq, setCorrectSq]   = useState<{ from: string; to: string } | null>(null);
  const [locked, setLocked]         = useState(false);

  const chessRef = useRef(new Chess());
  const transRef = useRef(false);

  const line = queue[lineIdx];

  // Init / line change
  useEffect(() => {
    if (!line) return;
    const chess = new Chess();
    chessRef.current = chess;
    setFen(chess.fen());
    setStep(0);
    setLineCorrect(0);
    setLineTotal(0);
    setStatus("idle");
    setWrongPlayedSq(null);
    setCorrectSq(null);
    setLocked(false);
    transRef.current = false;
  }, [line]);

  // Auto-play opponent moves
  useEffect(() => {
    if (!line || transRef.current) return;
    const chess = chessRef.current;
    const isUserTurn = chess.turn() === (line.color === "white" ? "w" : "b");
    if (!isUserTurn && step < line.moves.length) {
      transRef.current = true;
      setTimeout(() => {
        const uci = line.moves[step];
        chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: uci[4] ?? "q" });
        setFen(chess.fen());
        setStep((s) => s + 1);
        transRef.current = false;
      }, 350);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, line]);

  function getUserMoveCount(l: RepertoireLine): number {
    const tempChess = new Chess();
    let count = 0;
    const userColor = l.color === "white" ? "w" : "b";
    for (const uci of l.moves) {
      if (tempChess.turn() === userColor) count++;
      try { tempChess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: uci[4] ?? "q" }); }
      catch { break; }
    }
    return count;
  }

  function handleDrop(from: string, to: string): boolean {
    if (!line || locked || transRef.current) return false;
    const chess = chessRef.current;
    if (step >= line.moves.length) return false;

    const expected = line.moves[step];
    const playedUci = from + to;
    const isCorrect = playedUci === expected.slice(0, 4);

    const move = chess.move({ from: from as never, to: to as never, promotion: expected[4] ?? "q" });
    if (!move) return false;

    setLineTotal((t) => t + 1);

    if (isCorrect) {
      setLineCorrect((c) => c + 1);
      setStatus("correct");
      setFen(chess.fen());
      const nextStep = step + 1;
      setStep(nextStep);

      if (nextStep >= line.moves.length) {
        // Line complete
        const correct = lineCorrect + 1;
        const total   = lineTotal + 1;
        onLineComplete({ lineId: line.id, lineName: line.name, color: line.color, correct, total });
        setTimeout(() => advanceLine(correct, total), 800);
      } else {
        setStatus("idle");
      }
    } else {
      // Wrong move — undo it
      chess.undo();
      setStatus("wrong");
      setWrongPlayedSq({ from, to });
      const expFrom = expected.slice(0, 2);
      const expTo   = expected.slice(2, 4);
      setCorrectSq({ from: expFrom, to: expTo });
      setLocked(true);
    }

    return isCorrect;
  }

  function handleRetry() {
    setStatus("idle");
    setWrongPlayedSq(null);
    setCorrectSq(null);
    setLocked(false);
  }

  function handleSkipMove() {
    if (!line) return;
    const chess = chessRef.current;
    const expected = line.moves[step];
    chess.move({ from: expected.slice(0, 2) as never, to: expected.slice(2, 4) as never, promotion: expected[4] ?? "q" });
    setFen(chess.fen());
    const nextStep = step + 1;
    setStep(nextStep);
    setStatus("idle");
    setWrongPlayedSq(null);
    setCorrectSq(null);
    setLocked(false);

    if (nextStep >= line.moves.length) {
      const total = lineTotal + 1;
      onLineComplete({ lineId: line.id, lineName: line.name, color: line.color, correct: lineCorrect, total });
      setTimeout(() => advanceLine(lineCorrect, total), 400);
    }
  }

  function advanceLine(correct: number, total: number) {
    void correct;
    void total;
    const next = lineIdx + 1;
    if (next >= queue.length) {
      onDone(queue.slice(next));
    } else {
      setLineIdx(next);
    }
  }

  function skipLine() {
    onLineComplete({ lineId: line.id, lineName: line.name, color: line.color, correct: lineCorrect, total: lineTotal });
    advanceLine(lineCorrect, lineTotal);
  }

  if (!line) return null;

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (status === "wrong" && wrongPlayedSq) {
    squareStyles[wrongPlayedSq.from] = { backgroundColor: "rgba(239,68,68,0.4)" };
    squareStyles[wrongPlayedSq.to]   = { backgroundColor: "rgba(239,68,68,0.4)" };
  }
  if (status === "wrong" && correctSq) {
    squareStyles[correctSq.from] = { backgroundColor: "rgba(34,197,94,0.35)" };
    squareStyles[correctSq.to]   = { backgroundColor: "rgba(34,197,94,0.35)" };
  }
  if (status === "correct") {
    // Will flash briefly before next move
  }

  const chess = chessRef.current;
  const isUserTurn = chess.turn() === (line.color === "white" ? "w" : "b");
  const userMoves = getUserMoveCount(line);
  const doneUserMoves = (() => {
    const tmp = new Chess();
    let count = 0;
    const uc = line.color === "white" ? "w" : "b";
    for (let i = 0; i < step; i++) {
      if (tmp.turn() === uc) count++;
      try { tmp.move({ from: line.moves[i].slice(0, 2) as never, to: line.moves[i].slice(2, 4) as never, promotion: line.moves[i][4] ?? "q" }); }
      catch { break; }
    }
    return count;
  })();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/90">
        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[60%]">{line.name}</span>
        <span className="ml-auto text-xs text-zinc-400">
          Line {lineIdx + 1}/{queue.length}
        </span>
        <button onClick={skipLine} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          Skip →
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-8">
        {/* Progress bar for this line */}
        <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: userMoves > 0 ? `${(doneUserMoves / userMoves) * 100}%` : "0%" }}
          />
        </div>

        {/* Notes sticky */}
        {line.notes && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/10">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-xs text-amber-800 dark:text-amber-300">{line.notes}</p>
          </div>
        )}

        {/* Board */}
        <div className="mx-auto flex w-full justify-center">
          <ChessBoardWrapper
            className="overflow-hidden rounded-xl"
            options={{
              position: fen,
              onPieceDrop: ({ sourceSquare, targetSquare }) => handleDrop(sourceSquare, targetSquare ?? ""),
              boardOrientation: line.color,
              allowDragging: !locked && !transRef.current && isUserTurn,
              squareStyles,
            }}
          />
        </div>

        {/* Status panel */}
        <div className={`rounded-xl border p-3 transition ${
          status === "correct" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
          : status === "wrong" ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
        }`}>
          {status === "idle" && (
            <p className="text-sm text-zinc-500">
              {isUserTurn
                ? `Your turn — play as ${line.color} (move ${doneUserMoves + 1}/${userMoves})`
                : "Opponent is playing…"}
            </p>
          )}
          {status === "correct" && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Correct! ✓</p>
            </div>
          )}
          {status === "wrong" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  Not quite — correct move highlighted in green
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  <RotateCcw className="h-3 w-3" /> Try Again
                </button>
                <button
                  onClick={handleSkipMove}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Move sequence reference */}
        <p className="text-center font-mono text-[10px] text-zinc-400">
          {movesToSan(line.moves)}
        </p>
      </div>
    </div>
  );
}

// ─── Drill Summary ────────────────────────────────────────────────────────────

function DrillSummary({
  results,
  onPlayAgain,
  onBack,
}: {
  results: LineResult[];
  onPlayAgain: () => void;
  onBack: () => void;
}) {
  const totalCorrect = results.reduce((s, r) => s + r.correct, 0);
  const totalMoves   = results.reduce((s, r) => s + r.total, 0);
  const accuracy     = totalMoves > 0 ? Math.round((totalCorrect / totalMoves) * 100) : 0;

  const perfect = results.filter((r) => r.total > 0 && r.correct === r.total);
  const needWork = results.filter((r) => r.total > 0 && r.correct < r.total)
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/90">
        <Link href="/chess/repertoire" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Drill Complete</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-8">
        {/* Accuracy card */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="text-5xl font-black text-emerald-700 dark:text-emerald-300">{accuracy}%</p>
          <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
            {totalCorrect}/{totalMoves} moves correct · {results.length} line{results.length !== 1 ? "s" : ""} drilled
          </p>
        </div>

        {/* Per-line breakdown */}
        <div className="space-y-2">
          {results.map((r) => {
            const pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 100;
            const color = pct === 100 ? "emerald" : pct >= 70 ? "amber" : "red";
            return (
              <div key={r.lineId} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                <span className="text-sm">{r.color === "white" ? "♔" : "♚"}</span>
                <p className="flex-1 min-w-0 text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{r.lineName}</p>
                <span className={`shrink-0 text-sm font-bold ${
                  color === "emerald" ? "text-emerald-600 dark:text-emerald-400"
                  : color === "amber" ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
                }`}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Needs work section */}
        {needWork.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/10">
            <p className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">Needs more practice:</p>
            {needWork.slice(0, 3).map((r) => (
              <p key={r.lineId} className="text-xs text-amber-600 dark:text-amber-400">
                • {r.lineName} ({r.correct}/{r.total})
              </p>
            ))}
          </div>
        )}

        {perfect.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/10">
            <p className="mb-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Perfectly memorized:</p>
            {perfect.map((r) => (
              <p key={r.lineId} className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {r.lineName}
              </p>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onPlayAgain}
            className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            ⚡ Drill Again
          </button>
          <button
            onClick={onBack}
            className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Change Lines
          </button>
        </div>
      </div>
    </div>
  );
}
