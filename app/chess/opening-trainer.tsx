"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft, ChevronRight, Play, RefreshCw, Star,
} from "lucide-react";
import type { PieceDropHandlerArgs } from "react-chessboard";
import {
  ChessBoardWrapper,
  type ChessBoardSizePreset,
} from "@/components/chess/ChessBoardWrapper";
import { BoardLayoutShell } from "@/components/chess/board-layout-shell";
import { ChessListPage } from "@/components/chess/chess-list-page";
import {
  FeedbackPanel,
  SidebarTitle,
  SidebarState,
  SidebarStatGrid,
  SidebarStat,
  SidebarDominant,
  SidebarButton,
  SidebarBackLink,
} from "@/components/chess/board-workspace";
import { useChessLegalMoves } from "@/hooks/use-chess-legal-moves";

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
  /** Set by our API when Lichess is unreachable (distinct from legal empty moves). */
  error?: string;
};

type PracticeResult = "idle" | "correct" | "correct_alt" | "wrong";

export type QuickStart = {
  id: string;
  name: string;
  subtext: string;
  playAs: "white" | "black";
  moves: string[];
  /** Short blurb shown in the right panel — the main idea of this line. */
  idea: string;
  /**
   * Optional opening tree for drill mode. When present, drill mode walks this
   * tree (with random child selection on the opponent's side) instead of the
   * linear `moves` array. View mode still uses `moves`.
   */
  tree?: OpeningNode;
};

/** Tree node for branching opening lines. `move` is UCI; null only for root. */
export type OpeningNode = {
  move: string | null;
  children: OpeningNode[];
};

/** Convert a flat UCI line into a degenerate (no-branching) tree. */
function buildLinearTree(uciMoves: string[]): OpeningNode {
  const root: OpeningNode = { move: null, children: [] };
  let parent = root;
  for (const uci of uciMoves) {
    const child: OpeningNode = { move: uci, children: [] };
    parent.children.push(child);
    parent = child;
  }
  return root;
}

/** Return the opening's tree, falling back to a degenerate tree from `moves`. */
function getOpeningTree(qs: QuickStart): OpeningNode {
  return qs.tree ?? buildLinearTree(qs.moves);
}

/** Longest path length through the tree — used for the progress denominator. */
function maxTreeDepth(node: OpeningNode): number {
  if (node.children.length === 0) return 0;
  let best = 0;
  for (const c of node.children) {
    const d = maxTreeDepth(c);
    if (d > best) best = d;
  }
  return 1 + best;
}

// ─── Trees ────────────────────────────────────────────────────────────────────
//
// Real branching trees for openings that need variations. Adding more is
// purely additive — just attach `tree:` to a QuickStart entry below.

// Italian / Open Games (user plays White). Black has multiple replies the
// system can pick from; on some user moves, multiple correct continuations
// are accepted.
const italianGameTree: OpeningNode = {
  move: null,
  children: [
    {
      move: "e2e4", // 1. e4 (user)
      children: [
        {
          move: "e7e5", // 1...e5 (Black)
          children: [
            {
              move: "g1f3", // 2. Nf3 (user)
              children: [
                {
                  move: "b8c6", // 2...Nc6 (Black)
                  children: [
                    { move: "f1c4", children: [] }, // 3. Bc4 — Italian
                    { move: "f1b5", children: [] }, // 3. Bb5 — Spanish (also accepted)
                  ],
                },
                {
                  move: "g8f6", // 2...Nf6 — Petroff (Black)
                  children: [
                    { move: "f3e5", children: [] }, // 3. Nxe5
                  ],
                },
              ],
            },
          ],
        },
        {
          move: "c7c5", // 1...c5 — Sicilian (Black)
          children: [{ move: "g1f3", children: [] }], // 2. Nf3
        },
        {
          move: "e7e6", // 1...e6 — French (Black)
          children: [{ move: "d2d4", children: [] }], // 2. d4
        },
      ],
    },
  ],
};

// Caro-Kann (user plays Black). White has the main d4 line and the
// Advance variation; both are accepted system replies.
const caroKannTree: OpeningNode = {
  move: null,
  children: [
    {
      move: "e2e4", // 1. e4 (White)
      children: [
        {
          move: "c7c6", // 1...c6 (user)
          children: [
            {
              move: "d2d4", // 2. d4 (White)
              children: [{ move: "d7d5", children: [] }], // 2...d5
            },
            {
              move: "b1c3", // 2. Nc3 — Two Knights (White)
              children: [{ move: "d7d5", children: [] }], // 2...d5
            },
          ],
        },
      ],
    },
  ],
};

// Queen's Gambit (user plays White). Black can accept, decline, or play Slav.
const queensGambitTree: OpeningNode = {
  move: null,
  children: [
    {
      move: "d2d4", // 1. d4 (user)
      children: [
        {
          move: "d7d5", // 1...d5 (Black)
          children: [
            {
              move: "c2c4", // 2. c4 (user)
              children: [
                {
                  move: "d5c4", // 2...dxc4 — QGA (Black)
                  children: [{ move: "g1f3", children: [] }], // 3. Nf3
                },
                {
                  move: "e7e6", // 2...e6 — QGD (Black)
                  children: [{ move: "b1c3", children: [] }], // 3. Nc3
                },
                {
                  move: "c7c6", // 2...c6 — Slav (Black)
                  children: [{ move: "g1f3", children: [] }], // 3. Nf3
                },
              ],
            },
          ],
        },
        {
          move: "g8f6", // 1...Nf6 — Indian (Black)
          children: [
            {
              move: "c2c4", // 2. c4 (user)
              children: [{ move: "e7e6", children: [] }], // 2...e6
            },
          ],
        },
      ],
    },
  ],
};

// Sicilian Defense (user plays Black). White has Open, Closed, and Alapin.
const sicilianTree: OpeningNode = {
  move: null,
  children: [
    {
      move: "e2e4", // 1. e4 (White)
      children: [
        {
          move: "c7c5", // 1...c5 (user)
          children: [
            {
              move: "g1f3", // 2. Nf3 — Open (White)
              children: [
                {
                  move: "d7d6", // 2...d6 (user)
                  children: [
                    {
                      move: "d2d4", // 3. d4 (White)
                      children: [{ move: "c5d4", children: [] }], // 3...cxd4
                    },
                  ],
                },
                {
                  move: "b8c6", // 2...Nc6 (user, also fine)
                  children: [
                    {
                      move: "d2d4", // 3. d4 (White)
                      children: [{ move: "c5d4", children: [] }], // 3...cxd4
                    },
                  ],
                },
              ],
            },
            {
              move: "b1c3", // 2. Nc3 — Closed (White)
              children: [{ move: "b8c6", children: [] }], // 2...Nc6
            },
            {
              move: "c2c3", // 2. c3 — Alapin (White)
              children: [{ move: "d7d5", children: [] }], // 2...d5
            },
          ],
        },
      ],
    },
  ],
};

// London System (user plays White). Linear-ish — Black tries a few replies
// but White keeps playing the same setup.
const londonTree: OpeningNode = {
  move: null,
  children: [
    {
      move: "d2d4", // 1. d4 (user)
      children: [
        {
          move: "d7d5", // 1...d5 (Black)
          children: [
            {
              move: "c1f4", // 2. Bf4 (user)
              children: [
                {
                  move: "g8f6", // 2...Nf6 (Black)
                  children: [{ move: "e2e3", children: [] }], // 3. e3
                },
                {
                  move: "c7c5", // 2...c5 (Black)
                  children: [{ move: "e2e3", children: [] }], // 3. e3
                },
              ],
            },
          ],
        },
        {
          move: "g8f6", // 1...Nf6 (Black)
          children: [
            {
              move: "c1f4", // 2. Bf4 (user)
              children: [{ move: "d7d5", children: [] }], // 2...d5
            },
          ],
        },
      ],
    },
  ],
};

// French Defense (user plays Black). White has Classical, Tarrasch, Advance.
const frenchTree: OpeningNode = {
  move: null,
  children: [
    {
      move: "e2e4", // 1. e4 (White)
      children: [
        {
          move: "e7e6", // 1...e6 (user)
          children: [
            {
              move: "d2d4", // 2. d4 (White)
              children: [
                {
                  move: "d7d5", // 2...d5 (user)
                  children: [
                    {
                      move: "b1c3", // 3. Nc3 — Classical (White)
                      children: [{ move: "g8f6", children: [] }], // 3...Nf6
                    },
                    {
                      move: "b1d2", // 3. Nd2 — Tarrasch (White)
                      children: [{ move: "g8f6", children: [] }], // 3...Nf6
                    },
                    {
                      move: "e4e5", // 3. e5 — Advance (White)
                      children: [{ move: "c7c5", children: [] }], // 3...c5
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const QUICK_STARTS: QuickStart[] = [
  {
    id: "italian-game",
    name: "Italian Game",
    subtext: "1.e4 e5 2.Nf3 Nc6 3.Bc4",
    playAs: "white",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
    idea: "Develop the bishop to c4 aiming at f7 — Black's weakest square. Fast, classical development with pressure on the kingside.",
    tree: italianGameTree,
  },
  {
    id: "caro-kann",
    name: "Caro-Kann Defense",
    subtext: "1.e4 c6",
    playAs: "black",
    moves: ["e2e4", "c7c6"],
    idea: "Solid reply to 1.e4. Prepares ...d5 to challenge the center without blocking your light-squared bishop in.",
    tree: caroKannTree,
  },
  {
    id: "queens-gambit",
    name: "Queen's Gambit",
    subtext: "1.d4 d5 2.c4",
    playAs: "white",
    moves: ["d2d4", "d7d5", "c2c4"],
    idea: "Offer the c-pawn to deflect Black's d5 pawn — gain central control and open lines for your pieces.",
    tree: queensGambitTree,
  },
  {
    id: "sicilian",
    name: "Sicilian Defense",
    subtext: "1.e4 c5",
    playAs: "black",
    moves: ["e2e4", "c7c5"],
    idea: "Sharpest reply to 1.e4. Fights for the d4 square and unbalances the position — Black plays for a win.",
    tree: sicilianTree,
  },
  {
    id: "london",
    name: "London System",
    subtext: "1.d4 d5 2.Bf4",
    playAs: "white",
    moves: ["d2d4", "d7d5", "c1f4"],
    idea: "System-based opening: develop the dark-squared bishop early, then build a solid pawn triangle. Easy to learn, hard to break.",
    tree: londonTree,
  },
  {
    id: "french",
    name: "French Defense",
    subtext: "1.e4 e6",
    playAs: "black",
    moves: ["e2e4", "e7e6"],
    idea: "Prepares ...d5 and a closed, strategic battle. Solid pawn structure but the light-squared bishop is locked in.",
    tree: frenchTree,
  },
];

/** Look up an opening by URL id. */
export function findOpeningById(id: string): QuickStart | undefined {
  return QUICK_STARTS.find((q) => q.id === id);
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function totalGames(d: ExplorerData | ExplorerMove): number {
  return (d.white ?? 0) + (d.draws ?? 0) + (d.black ?? 0);
}


function OpeningTrainerBoard({
  fen,
  boardOrientation,
  onPieceDrop,
  squareStyles,
  sizePreset = "opening",
  extraOptions,
}: {
  fen: string;
  boardOrientation: "white" | "black";
  onPieceDrop: (args: PieceDropHandlerArgs) => boolean;
  squareStyles?: Record<string, React.CSSProperties>;
  sizePreset?: ChessBoardSizePreset;
  extraOptions?: Record<string, unknown>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-full shrink-0 justify-center">
      <ChessBoardWrapper
        sizePreset={sizePreset}
        className="overflow-hidden rounded-2xl shadow-md ring-1 ring-black/[0.06] dark:ring-white/10"
        fixedEdgeNotation={false}
        options={{
          position: fen,
          boardOrientation,
          onPieceDrop,
          squareStyles,
          ...extraOptions,
        }}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpeningTrainer({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <div className="min-h-0 flex-1 overflow-hidden">
        <PracticeMode onBack={onBack} />
      </div>
    </div>
  );
}

// ─── Practice Mode ────────────────────────────────────────────────────────────

export function PracticeMode({
  onBack,
  onSelect,
}: {
  onBack?: () => void;
  /** Optional override for selection — when provided, called instead of local state. */
  onSelect?: (qs: QuickStart) => void;
}) {
  const [selected, setSelected] = useState<QuickStart | null>(null);

  if (!selected) {
    return (
      <ChessListPage>
        <div className="mx-auto w-full max-w-xl py-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-3 flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
          )}
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900 dark:shadow-black/20 sm:p-5">
            <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Choose a line
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              You play one color; opponent replies using the most popular Lichess moves in each position.
            </p>
            <div className="mt-4 space-y-2">
              {QUICK_STARTS.map((qs) => (
                <button
                  key={qs.id}
                  type="button"
                  onClick={() => (onSelect ? onSelect(qs) : setSelected(qs))}
                  className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/50 p-3 text-left transition hover:border-emerald-400/70 hover:bg-emerald-50/60 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/25 sm:gap-4 sm:p-3.5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                    <Star className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{qs.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {qs.subtext}
                      <span className="text-zinc-400"> · </span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">You: {qs.playAs}</span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        </div>
      </ChessListPage>
    );
  }

  return <PracticeBoard quickStart={selected} onBack={() => setSelected(null)} />;
}

/** Replay a sequence of UCI moves on the given Chess instance, returning the SAN list. */
function applyInitialMoves(chess: Chess, initialMoves: string[]): string[] {
  const sans: string[] = [];
  for (const uci of initialMoves) {
    const move = chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: "q" });
    if (move) sans.push(move.san);
  }
  return sans;
}

// ─── Practice Board ───────────────────────────────────────────────────────────

export function PracticeBoard({
  quickStart,
  onBack,
}: {
  quickStart: QuickStart;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"view" | "drill">("view");

  // Drill mode is a fully separate render path so it doesn't have to coexist
  // with the Lichess-explorer-driven view mode logic.
  if (mode === "drill") {
    return (
      <DrillSession
        quickStart={quickStart}
        onBack={onBack}
        onExit={() => setMode("view")}
      />
    );
  }

  return (
    <PracticeBoardView
      quickStart={quickStart}
      onBack={onBack}
      onStartDrill={() => setMode("drill")}
    />
  );
}

function PracticeBoardView({
  quickStart,
  onBack,
  onStartDrill,
}: {
  quickStart: QuickStart;
  onBack: () => void;
  onStartDrill: () => void;
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
  const [explorerFailed, setExplorerFailed] = useState(false);

  const playAs = quickStart.playAs;
  const initialMoves = quickStart.moves;

  // Play the pre-loaded opening moves automatically
  const hasBootstrapped = useRef(false);
  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    const chess = chessRef.current;
    const sans = applyInitialMoves(chess, initialMoves);
    setFen(chess.fen());
    setHistory(sans);
    setPhase(chess.turn() === playAs[0] ? "user" : "auto");

    fetchExplorer(chess.fen());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry explorer fetch on failure
  useEffect(() => {
    if (!explorerFailed || finished) return;
    const retry = setTimeout(() => {
      fetchExplorer(chessRef.current.fen());
    }, 2000);
    return () => clearTimeout(retry);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorerFailed, finished]);

  // Auto-play opponent when phase = "auto"
  useEffect(() => {
    if (phase !== "auto" || finished || explorerFailed) return;
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
    setExplorerFailed(false);
    try {
      const res = await fetch(`/api/chess/opening?fen=${encodeURIComponent(currentFen)}`);
      const data = (await res.json()) as ExplorerData;
      if (!res.ok || data.error) {
        setExplorer(null);
        setExplorerFailed(true);
        return;
      }
      setExplorer(data);
      if (data.opening?.name) setOpeningName(data.opening.name);
    } catch {
      setExplorer(null);
      setExplorerFailed(true);
    }
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
    const sans = applyInitialMoves(chess, initialMoves);
    setFen(chess.fen());
    setHistory(sans);
    setPhase(chess.turn() === playAs[0] ? "user" : "auto");
    fetchExplorer(chess.fen());
    hasBootstrapped.current = true;
  }

  const canInteract = phase === "user" && !finished;
  const { legalMoveStyles, handlers: legalMoveHandlers, clearSelection } = useChessLegalMoves(chessRef, handleUserDrop, canInteract);

  const squareStyles = useMemo(() => ({ ...lastMoveSquares, ...wrongSquares, ...legalMoveStyles }), [lastMoveSquares, wrongSquares, legalMoveStyles]);

  const accuracy =
    score.correct + score.wrong > 0
      ? Math.round((score.correct / (score.correct + score.wrong)) * 100)
      : null;

  // Number of player moves played so far (every 2 plies = 1 full move; opponent
  // bootstrap moves are part of `initialMoves` so we just count user plies).
  const userPliesPlayed = Math.max(0, history.length - initialMoves.length);
  const movesDeep = Math.ceil(userPliesPlayed / 2);

  return (
    <BoardLayoutShell
      left={
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <SidebarBackLink onClick={onBack} label="All lines" />

          <SidebarTitle
            eyebrow="Opening"
            title={openingName || quickStart.name}
            subtitle={
              <>
                {quickStart.subtext}
                <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-bold capitalize">· You: {playAs}</span>
              </>
            }
          />

          <SidebarState
            tone={finished ? "done" : phase === "auto" ? "opponent" : "user"}
            label={finished ? "Line" : phase === "auto" ? "Opponent" : "Your move"}
            value={
              finished
                ? "Complete!"
                : phase === "auto"
                  ? "Thinking…"
                  : `Play for ${playAs === "white" ? "White" : "Black"}`
            }
          />

          {score.correct + score.wrong > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">Score</p>
              <div className="mt-1.5">
                <SidebarStatGrid>
                  <SidebarStat label="✓ Correct" value={score.correct} tone="success" />
                  <SidebarStat label="✗ Wrong" value={score.wrong} tone="danger" />
                </SidebarStatGrid>
              </div>
              {accuracy !== null && (
                <p className="mt-1 text-center text-[13px] font-bold text-zinc-600 dark:text-zinc-300">{accuracy}% accuracy</p>
              )}
            </div>
          )}

          {/* Feedback (best-move coaching) */}
          {result !== "idle" && (
            <div className={`rounded-lg border px-2.5 py-2 text-xs font-semibold leading-snug ${
              result === "wrong"
                ? "border-red-200/80 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-300"
                : result === "correct"
                  ? "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-300"
                  : "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-200"
            }`}>
              {resultMsg}
              {result === "wrong" && correctSan && (
                <p className="mt-1 text-[11px] opacity-90">Best: <strong className="font-mono">{correctSan}</strong></p>
              )}
            </div>
          )}

          {/* Move list — bigger font, highlighted last move */}
          <div className="min-h-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">Moves</p>
            {history.length === 0 ? (
              <p className="mt-1.5 text-xs italic text-zinc-400">Play the line to see moves.</p>
            ) : (
              <div className="mt-2 grid grid-cols-[1.9rem_1fr_1fr] gap-x-1.5 gap-y-1 font-mono text-[13px] leading-5 tabular-nums">
                {(() => {
                  const rows: Array<{ num: number; w?: { san: string; ply: number }; b?: { san: string; ply: number } }> = [];
                  for (let i = 0; i < history.length; i += 2) {
                    rows.push({
                      num: i / 2 + 1,
                      w: history[i] != null ? { san: history[i]!, ply: i } : undefined,
                      b: history[i + 1] != null ? { san: history[i + 1]!, ply: i + 1 } : undefined,
                    });
                  }
                  const lastPly = history.length - 1;
                  const cellClass = (ply: number) =>
                    ply === lastPly
                      ? "rounded bg-emerald-100 px-1.5 font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                      : "px-1.5 font-semibold text-zinc-700 dark:text-zinc-200";
                  return rows.map((r) => (
                    <React.Fragment key={`mv-${r.num}`}>
                      <span className="text-zinc-400 dark:text-zinc-500">{r.num}.</span>
                      <span className={r.w ? cellClass(r.w.ply) : ""}>{r.w?.san ?? ""}</span>
                      <span className={r.b ? cellClass(r.b.ply) : ""}>{r.b?.san ?? ""}</span>
                    </React.Fragment>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      }
      right={
        <>
          <SidebarDominant label="Depth" value={movesDeep} unit="moves deep" />

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <p className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              Main idea
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
              {quickStart.idea}
            </p>
          </div>

          <div className="mt-3 flex shrink-0 flex-col gap-2">
            <SidebarButton variant="primary" onClick={onStartDrill}>
              <Play className="h-4 w-4" aria-hidden />
              Start Drill
            </SidebarButton>
            <SidebarButton variant="secondary" onClick={reset}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Restart
            </SidebarButton>
          </div>
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
            boardOrientation: playAs,
            boardStyle: { borderRadius: 0, border: "none" },
            squareStyles,
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              clearSelection();
              return handleUserDrop(sourceSquare, targetSquare ?? "");
            },
            ...legalMoveHandlers,
          }}
        />
      )}
    </BoardLayoutShell>
  );
}

// ─── Drill Session ────────────────────────────────────────────────────────────
//
// Tree-based opening trainer (chess.com style). Walks the opening tree:
//   - User's turn → drag piece, validated against currentNode.children. Multiple
//     correct continuations are accepted.
//   - Opponent's turn → randomly picks one child and auto-plays after 500ms.
// Drill ends when we reach a leaf (children.length === 0).
function DrillSession({
  quickStart,
  onBack,
  onExit,
}: {
  quickStart: QuickStart;
  onBack: () => void;
  onExit: () => void;
}) {
  const playAs = quickStart.playAs;
  const tree = useMemo(() => getOpeningTree(quickStart), [quickStart]);
  const treeMaxDepth = useMemo(() => maxTreeDepth(tree), [tree]);

  // chess.js holds the live position; currentNode is our cursor in the tree.
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [currentNode, setCurrentNode] = useState<OpeningNode>(tree);
  const [pathSans, setPathSans] = useState<string[]>([]);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [expectedSan, setExpectedSan] = useState<string>("");

  // Side-to-move is derived from FEN so it re-renders when the position changes.
  const sideToMove = (fen.split(" ")[1] ?? "w") as "w" | "b";
  const finished = currentNode.children.length === 0;
  const isUserTurn = !finished && sideToMove === playAs[0];

  /** Apply a tree child to the live board and advance the cursor. */
  function applyChild(child: OpeningNode) {
    if (!child.move) return;
    const chess = chessRef.current;
    const move = chess.move({
      from: child.move.slice(0, 2) as never,
      to: child.move.slice(2, 4) as never,
      promotion: (child.move[4] ?? "q") as never,
    });
    if (!move) return;
    setFen(chess.fen());
    setPathSans((p) => [...p, move.san]);
    setCurrentNode(child);
  }

  // Auto-play opponent: pick a random child and apply after a short pause.
  useEffect(() => {
    if (finished || isUserTurn) return;
    const children = currentNode.children;
    if (children.length === 0) return;
    const pick = children[Math.floor(Math.random() * children.length)]!;
    const t = setTimeout(() => applyChild(pick), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNode, isUserTurn, finished]);

  /** Compute SAN of a UCI move from the current live position (for hints). */
  function sanFromUci(uci: string): string {
    try {
      const probe = new Chess(chessRef.current.fen());
      const m = probe.move({
        from: uci.slice(0, 2) as never,
        to: uci.slice(2, 4) as never,
        promotion: (uci[4] ?? "q") as never,
      });
      return m?.san ?? "";
    } catch {
      return "";
    }
  }

  function handleDrop(from: string, to: string): boolean {
    if (finished || !isUserTurn) return false;
    const played = (from + to).slice(0, 4).toLowerCase();
    const match = currentNode.children.find(
      (c) => c.move != null && c.move.slice(0, 4).toLowerCase() === played,
    );

    if (match) {
      applyChild(match);
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      setFeedback("correct");
      setExpectedSan("");
      return true;
    }

    // Wrong — show the first valid option as the hint, snap piece back.
    const first = currentNode.children.find((c) => c.move != null);
    setExpectedSan(first?.move ? sanFromUci(first.move) : "");
    setFeedback("wrong");
    setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    return false;
  }

  function resetDrill() {
    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setCurrentNode(tree);
    setPathSans([]);
    setScore({ correct: 0, wrong: 0 });
    setFeedback("idle");
    setExpectedSan("");
  }

  const totalAttempts = score.correct + score.wrong;
  const accuracy =
    totalAttempts > 0 ? Math.round((score.correct / totalAttempts) * 100) : null;
  const fenToShow = fen;
  const sideToMoveLabel = playAs === "white" ? "White" : "Black";

  // For the right-panel progress display.
  const plyPlayed = pathSans.length;

  // Number of branches available to the user at the current node — surfaced as
  // a tiny "X correct moves accepted" hint when > 1.
  const userBranchCount =
    isUserTurn ? currentNode.children.filter((c) => c.move != null).length : 0;

  return (
    <BoardLayoutShell
      left={
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <SidebarBackLink onClick={onBack} label="All lines" />

          <SidebarTitle
            eyebrow="Drill mode"
            eyebrowTone="accent"
            title={quickStart.name}
            subtitle={quickStart.subtext}
          />

          <SidebarState
            tone={finished ? "done" : isUserTurn ? "user" : "opponent"}
            label={finished ? "Drill" : isUserTurn ? "Your move" : "Opponent"}
            value={
              finished
                ? "Line complete"
                : isUserTurn
                  ? `Play for ${sideToMoveLabel}`
                  : "Thinking…"
            }
          >
            {userBranchCount > 1 ? `${userBranchCount} moves accepted` : null}
          </SidebarState>

          {totalAttempts > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                Score
              </p>
              <div className="mt-1.5">
                <SidebarStatGrid>
                  <SidebarStat label="✓ Correct" value={score.correct} tone="success" />
                  <SidebarStat label="✗ Wrong" value={score.wrong} tone="danger" />
                </SidebarStatGrid>
              </div>
              {accuracy !== null && (
                <p className="mt-1 text-center text-[13px] font-bold text-zinc-600 dark:text-zinc-300">{accuracy}% accuracy</p>
              )}
            </div>
          )}

          {feedback === "correct" && !finished && (
            <FeedbackPanel variant="success" title="Correct" />
          )}
          {feedback === "wrong" && (
            <FeedbackPanel variant="warning" title="Incorrect — try again">
              {expectedSan ? (
                <p>
                  Expected:{" "}
                  <strong className="font-mono">{expectedSan}</strong>
                </p>
              ) : null}
            </FeedbackPanel>
          )}
          {finished && (
            <FeedbackPanel variant="success" title="Drill complete!">
              <p>
                {score.correct}/{totalAttempts} correct
                {accuracy !== null ? ` (${accuracy}%)` : ""}
              </p>
            </FeedbackPanel>
          )}

          {/* Path so far — only the moves actually walked through this run */}
          <div className="min-h-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              Line
            </p>
            {pathSans.length === 0 ? (
              <p className="mt-1.5 text-xs italic text-zinc-400">Make a move to begin…</p>
            ) : (
              <div className="mt-2 grid grid-cols-[1.9rem_1fr_1fr] gap-x-1.5 gap-y-1 font-mono text-[13px] leading-5 tabular-nums">
                {(() => {
                  const rows: Array<{ num: number; w?: { san: string; ply: number }; b?: { san: string; ply: number } }> = [];
                  for (let i = 0; i < pathSans.length; i += 2) {
                    rows.push({
                      num: i / 2 + 1,
                      w: pathSans[i] != null ? { san: pathSans[i]!, ply: i } : undefined,
                      b: pathSans[i + 1] != null ? { san: pathSans[i + 1]!, ply: i + 1 } : undefined,
                    });
                  }
                  const lastPly = pathSans.length - 1;
                  const cellClass = (ply: number) =>
                    ply === lastPly
                      ? "rounded bg-emerald-100 px-1.5 font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                      : "px-1.5 font-semibold text-zinc-700 dark:text-zinc-200";
                  return rows.map((r) => (
                    <React.Fragment key={`drill-mv-${r.num}`}>
                      <span className="text-zinc-400 dark:text-zinc-500">{r.num}.</span>
                      <span className={r.w ? cellClass(r.w.ply) : ""}>{r.w?.san ?? ""}</span>
                      <span className={r.b ? cellClass(r.b.ply) : ""}>{r.b?.san ?? ""}</span>
                    </React.Fragment>
                  ));
                })()}
              </div>
            )}
          </div>

          <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-700/50">
            <SidebarButton variant="secondary" onClick={resetDrill}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Reset drill
            </SidebarButton>
            <SidebarButton variant="ghost" onClick={onExit}>
              Exit drill
            </SidebarButton>
          </div>
        </div>
      }
      right={
        <>
          <SidebarDominant label="Ply" value={plyPlayed} unit={`/ ${treeMaxDepth} max`} />
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <p className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              Main idea
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
              {quickStart.idea}
            </p>
          </div>
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
            position: fenToShow,
            boardOrientation: playAs,
            boardStyle: { borderRadius: 0, border: "none" },
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              handleDrop(sourceSquare, targetSquare ?? ""),
          }}
        />
      )}
    </BoardLayoutShell>
  );
}
