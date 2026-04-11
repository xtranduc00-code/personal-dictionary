/**
 * Opening Drill engine — turn a saved opening line into a sequence of
 * "position → expected next move" challenges and run them through a
 * stateful drill session.
 *
 * Pure logic + a React hook. No UI. Designed to be reusable for any line
 * source: opening trainer quick-starts, saved repertoire lines, or any other
 * UCI move list.
 *
 * Flow:
 *   1. generateDrillNodes(uciMoves) → DrillNode[]
 *   2. useDrillEngine({ moves, mode })
 *        - currentNode  → render the FEN, ask for the next move
 *        - submitMove(uci) → "correct" | "wrong"
 *        - on "wrong": node is queued for retry, mistake counter bumps
 *        - on "correct": advance to next node (unless line ends)
 *        - retryQueue interleaves with new nodes so weak spots come back
 */

import { Chess } from "chess.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DrillNode = {
  /** Original index in the line (0..moves.length-1). */
  index: number;
  /** Position to render. */
  fen: string;
  /** Position-only key (board + turn + castling + en passant). */
  positionKey: string;
  /** UCI of the expected next move. */
  expectedMove: string;
  /** SAN of the expected next move (for display / SAN comparison). */
  expectedSan: string;
  /** Whose move it is at this node. */
  sideToMove: "white" | "black";
};

export type DrillMode = "random" | "sequential";

export type DrillResult = "correct" | "wrong";

export type MistakeRecord = {
  /** `${positionKey}|${expectedMove}` — stable key across re-encounters. */
  key: string;
  fen: string;
  positionKey: string;
  expectedMove: string;
  expectedSan: string;
  wrongCount: number;
  /** UCI of the most recent wrong attempt. */
  lastPlayed: string | null;
};

export type DrillSummary = {
  totalAttempts: number;
  correct: number;
  wrong: number;
  uniqueMistakes: MistakeRecord[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip the half-move and full-move counters from a FEN. */
function normalizePositionKey(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(" ");
}

/** Try to parse a UCI string into chess.js move input. */
function parseUci(uci: string): { from: string; to: string; promotion?: string } | null {
  if (!uci || uci.length < 4) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length >= 5 ? uci[4] : undefined,
  };
}

/**
 * Walk the line one move at a time and emit a DrillNode for every position
 * BEFORE the move. The final position (after the last move) is not emitted —
 * there is no expected move from there.
 */
export function generateDrillNodes(uciMoves: string[]): DrillNode[] {
  if (!Array.isArray(uciMoves) || uciMoves.length === 0) return [];
  const chess = new Chess();
  const nodes: DrillNode[] = [];

  for (let i = 0; i < uciMoves.length; i++) {
    const uci = uciMoves[i]!;
    const parsed = parseUci(uci);
    if (!parsed) break;

    // Capture the position BEFORE applying the move.
    const fen = chess.fen();
    const sideToMove: "white" | "black" = chess.turn() === "w" ? "white" : "black";

    // Use chess.js to compute the SAN string for this UCI move (and to verify
    // the move is legal). If the move is illegal we drop the rest of the line.
    let move;
    try {
      move = chess.move({
        from: parsed.from as never,
        to: parsed.to as never,
        promotion: (parsed.promotion ?? "q") as never,
      });
    } catch {
      break;
    }
    if (!move) break;

    nodes.push({
      index: i,
      fen,
      positionKey: normalizePositionKey(fen),
      expectedMove: uci,
      expectedSan: move.san,
      sideToMove,
    });
  }

  return nodes;
}

/** Compare a played UCI against an expected UCI, ignoring promotion casing. */
export function isCorrectMove(playedUci: string, expectedUci: string): boolean {
  if (!playedUci || !expectedUci) return false;
  const a = playedUci.toLowerCase();
  const b = expectedUci.toLowerCase();
  if (a === b) return true;
  // Allow the user to omit the promotion suffix (board input often does).
  if (b.length === 5 && a.length === 4 && a === b.slice(0, 4)) return true;
  if (a.length === 5 && b.length === 4 && b === a.slice(0, 4)) return true;
  return false;
}

// ─── React hook ─────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, useState } from "react";

export type DrillEngineState = {
  nodes: DrillNode[];
  currentNode: DrillNode | null;
  /** Index into `nodes` that is currently being asked. */
  currentIndex: number;
  /** Number of attempts the user has made in this session. */
  totalAttempts: number;
  correct: number;
  wrong: number;
  /** Map keyed by `${positionKey}|${expectedMove}`. */
  mistakes: Map<string, MistakeRecord>;
  /** Last attempt result (for transient UI feedback). Cleared on next/retry. */
  lastResult: DrillResult | null;
  /** Last move the user played (UCI). Cleared on next/retry. */
  lastPlayed: string | null;
  /** True when the drill has reached the end of the line and the queue is empty. */
  finished: boolean;
};

export type UseDrillEngineOptions = {
  moves: string[];
  mode?: DrillMode;
  /** Called whenever the user gets a node wrong. Use this to log mistakes. */
  onMistake?: (node: DrillNode, playedUci: string) => void;
  /** Called whenever the user gets a node right. */
  onCorrect?: (node: DrillNode, playedUci: string) => void;
};

export function useDrillEngine({
  moves,
  mode = "random",
  onMistake,
  onCorrect,
}: UseDrillEngineOptions) {
  const nodes = useMemo(() => generateDrillNodes(moves), [moves]);

  // The retry queue is a list of node indices that the user got wrong and
  // should re-encounter later in the session. New wrong nodes go to the end;
  // we drain from the front after every few correct answers.
  const retryQueueRef = useRef<number[]>([]);
  const correctSinceRetryRef = useRef(0);

  function pickInitialIndex(): number {
    if (nodes.length === 0) return -1;
    if (mode === "sequential") return 0;
    return Math.floor(Math.random() * nodes.length);
  }

  const [currentIndex, setCurrentIndex] = useState<number>(() => pickInitialIndex());
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [mistakes, setMistakes] = useState<Map<string, MistakeRecord>>(() => new Map());
  const [lastResult, setLastResult] = useState<DrillResult | null>(null);
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const currentNode = currentIndex >= 0 && currentIndex < nodes.length ? nodes[currentIndex]! : null;

  // ── Picking the next node ────────────────────────────────────────────────
  //
  // Strategy:
  //   1. After every 3 correct answers, drain one item from the retry queue
  //      so weak spots resurface quickly.
  //   2. Otherwise, advance:
  //      - sequential mode → currentIndex + 1
  //      - random mode    → another random node (avoiding the same one twice
  //                         in a row when possible)
  //   3. If we've stepped past the end of the line and the retry queue is
  //      empty, mark the session finished.
  function advance(after: "correct" | "wrong") {
    setLastResult(null);
    setLastPlayed(null);

    // Drain from retry queue every few correct answers.
    if (after === "correct") {
      correctSinceRetryRef.current++;
      if (
        retryQueueRef.current.length > 0 &&
        correctSinceRetryRef.current >= 3
      ) {
        const next = retryQueueRef.current.shift()!;
        correctSinceRetryRef.current = 0;
        setCurrentIndex(next);
        return;
      }
    }

    // Otherwise pick the next normal node.
    let nextIdx: number;
    if (mode === "sequential") {
      nextIdx = currentIndex + 1;
    } else {
      // Random mode: avoid repeating the same node back-to-back when possible.
      if (nodes.length <= 1) {
        nextIdx = 0;
      } else {
        do {
          nextIdx = Math.floor(Math.random() * nodes.length);
        } while (nextIdx === currentIndex);
      }
    }

    if (nextIdx >= nodes.length) {
      // End of line — see if there's anything in the retry queue.
      if (retryQueueRef.current.length > 0) {
        nextIdx = retryQueueRef.current.shift()!;
      } else {
        setFinished(true);
        return;
      }
    }

    setCurrentIndex(nextIdx);
  }

  // ── User submits a move ──────────────────────────────────────────────────
  const submitMove = useCallback(
    (playedUci: string): DrillResult => {
      if (!currentNode || finished) return "wrong";
      const correct_ = isCorrectMove(playedUci, currentNode.expectedMove);
      setTotalAttempts((n) => n + 1);
      setLastPlayed(playedUci);

      if (correct_) {
        setCorrect((n) => n + 1);
        setLastResult("correct");
        onCorrect?.(currentNode, playedUci);
      } else {
        setWrong((n) => n + 1);
        setLastResult("wrong");

        // Bump mistake counter for this exact (position, expected) pair.
        const key = `${currentNode.positionKey}|${currentNode.expectedMove}`;
        setMistakes((prev) => {
          const next = new Map(prev);
          const existing = next.get(key);
          next.set(key, {
            key,
            fen: currentNode.fen,
            positionKey: currentNode.positionKey,
            expectedMove: currentNode.expectedMove,
            expectedSan: currentNode.expectedSan,
            wrongCount: (existing?.wrongCount ?? 0) + 1,
            lastPlayed: playedUci,
          });
          return next;
        });

        // Push this node to the retry queue so it comes back.
        if (!retryQueueRef.current.includes(currentNode.index)) {
          retryQueueRef.current.push(currentNode.index);
        }

        onMistake?.(currentNode, playedUci);
      }

      return correct_ ? "correct" : "wrong";
    },
    [currentNode, finished, onCorrect, onMistake],
  );

  // ── Continue past current node (after correct, or to skip past wrong) ────
  const next = useCallback(() => {
    advance(lastResult ?? "correct");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult, currentIndex, nodes.length, mode]);

  // ── Retry the same node (after wrong) ────────────────────────────────────
  const retry = useCallback(() => {
    setLastResult(null);
    setLastPlayed(null);
  }, []);

  // ── Reset the whole session ──────────────────────────────────────────────
  const reset = useCallback(() => {
    retryQueueRef.current = [];
    correctSinceRetryRef.current = 0;
    setCurrentIndex(pickInitialIndex());
    setTotalAttempts(0);
    setCorrect(0);
    setWrong(0);
    setMistakes(new Map());
    setLastResult(null);
    setLastPlayed(null);
    setFinished(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, mode]);

  const summary: DrillSummary = useMemo(
    () => ({
      totalAttempts,
      correct,
      wrong,
      uniqueMistakes: Array.from(mistakes.values()).sort(
        (a, b) => b.wrongCount - a.wrongCount,
      ),
    }),
    [totalAttempts, correct, wrong, mistakes],
  );

  const state: DrillEngineState = {
    nodes,
    currentNode,
    currentIndex,
    totalAttempts,
    correct,
    wrong,
    mistakes,
    lastResult,
    lastPlayed,
    finished,
  };

  return { state, summary, submitMove, next, retry, reset };
}
