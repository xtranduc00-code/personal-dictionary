"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  FlipVertical2,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";

import { authFetch } from "@/lib/auth-context";
import { ChessBoardWrapper } from "@/components/chess/ChessBoardWrapper";
import { SidebarDominant, SidebarTitle } from "@/components/chess/board-workspace";
import { ClassificationBadge, CLASSIFICATION_STYLES } from "@/components/chess/analysis/ClassificationBadge";
import { EvaluationBar } from "@/components/chess/analysis/EvaluationBar";
import { ChessComLoader } from "@/components/chess/analysis/ChessComLoader";
import PieceColour from "@/lib/chess/analysis/wintrchess/constants/PieceColour";
import {
  clearAnalysis,
  loadAnalysis,
  saveAnalysis,
  stripParents,
} from "@/lib/chess/analysis/persistence";

import { parsePgnToStateTree } from "@/lib/chess/analysis/pgn-to-tree";
import { createGameEvaluator } from "@/lib/chess/analysis/evaluate";
import { getGameAnalysis } from "@/lib/chess/analysis/wintrchess/report";
import { getGameAccuracy } from "@/lib/chess/analysis/wintrchess/accuracy";
import { loadOpenings } from "@/lib/chess/analysis/wintrchess/utils/opening";
import {
  getNodeChain,
  type StateTreeNode,
} from "@/lib/chess/analysis/wintrchess/types/StateTreeNode";
import { getTopEngineLine, type EngineLine } from "@/lib/chess/analysis/wintrchess/types/EngineLine";
import { STARTING_FEN } from "@/lib/chess/analysis/wintrchess/constants/pieces";
import type { Evaluation } from "@/lib/chess/analysis/wintrchess/types/Evaluation";
import { Classification } from "@/lib/chess/analysis/wintrchess/constants/Classification";

const DEFAULT_DEPTH = 14;

/** Recursively clear `engineLines` and analysis-derived fields so we don't
 *  show stale eval/accuracy without a fresh Stockfish run. */
function stripEngineLines(node: StateTreeNode): StateTreeNode {
  return {
    ...node,
    state: {
      ...node.state,
      engineLines: [],
      classification: undefined,
      accuracy: undefined,
      opening: undefined,
    },
    children: node.children.map(stripEngineLines),
  };
}

interface AnalysisStats {
  /** White player accuracy 0-100. */
  white: number;
  /** Black player accuracy 0-100. */
  black: number;
}

interface PlayerInfo {
  whiteName: string;
  blackName: string;
  whiteElo?: string;
  blackElo?: string;
}

const DEFAULT_PLAYERS: PlayerInfo = { whiteName: "White", blackName: "Black" };

/** Cheap regex extraction so we can show real names *before* analysis runs.
 *  Chess.js parses PGN headers but is async-imported; this avoids needing to
 *  await an import on the synchronous `loadPgnString` path. */
function extractPgnHeaders(pgn: string): PlayerInfo {
  const get = (key: string) => {
    const m = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
    return m?.[1];
  };
  return {
    whiteName: get("White") || "White",
    blackName: get("Black") || "Black",
    whiteElo: get("WhiteElo"),
    blackElo: get("BlackElo"),
  };
}

export default function AnalysisWorkspace() {
  const [pgn, setPgn] = useState("");
  const [rootNode, setRootNode] = useState<StateTreeNode | null>(null);
  const [initialFen, setInitialFen] = useState<string>(STARTING_FEN);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [players, setPlayers] = useState<PlayerInfo>(DEFAULT_PLAYERS);
  const [analyzed, setAnalyzed] = useState(false);
  // Source URL of the picked game (chess.com URL). Used as the
  // `source_url` for any game-puzzles extracted from this analysis so the
  // user can deep-link back to the source position.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  // Chess.com username being browsed. Persisted alongside the game so the
  // extract endpoint can identify which side belongs to the user when
  // deciding which mistakes to keep — independent of the app account.
  const [chessUsername, setChessUsername] = useState<string | null>(null);
  // Last extract result — fuels the small "✓ N trainable positions saved"
  // indicator AND the per-move "Train this" button (looked up by ply).
  const [extractInfo, setExtractInfo] = useState<{
    inserted: number;
    existed: number;
    extracted: number;
    gameId: string;
    puzzles: { id: string; ply: number; classification: "mistake" | "blunder"; swingCp: number }[];
  } | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  const cancellerRef = useRef<(() => void) | null>(null);

  // ── Load openings DB once (used for "Theory" classification) ─────────────
  useEffect(() => {
    loadOpenings().catch(() => {
      /* okay if it fails — classification just skips THEORY */
    });
  }, []);

  // ── Restore last loaded GAME (not analysis) on first mount ──────────────
  // We deliberately do NOT restore `stats` or `analyzed` so the user always
  // sees an explicit "Analyze" run that hits the engine. We also strip any
  // cached `engineLines` from the restored tree to avoid masking a missing
  // Stockfish run with stale evaluations.
  useEffect(() => {
    const persisted = loadAnalysis();
    if (!persisted) return;

    const stripped = stripEngineLines(persisted.rootNode);
    setPgn(persisted.pgn);
    setRootNode(stripped);
    setInitialFen(persisted.initialFen);
    setSelectedNodeId(persisted.selectedNodeId || stripped.id);
    setPlayers(extractPgnHeaders(persisted.pgn));
    setStats(null);
    setAnalyzed(false);
  }, []);

  // ── Derived: chain + selected node ───────────────────────────────────────
  const chain = useMemo(
    () => (rootNode ? getNodeChain(rootNode) : []),
    [rootNode],
  );

  const selectedIndex = useMemo(() => {
    if (!chain.length) return -1;
    return Math.max(0, chain.findIndex((n) => n.id === selectedNodeId));
  }, [chain, selectedNodeId]);

  const selectedNode = chain[selectedIndex] ?? null;

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!chain.length) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT"))
        return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedNodeId(
          chain[Math.max(0, selectedIndex - 1)]?.id ?? selectedNodeId,
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedNodeId(
          chain[Math.min(chain.length - 1, selectedIndex + 1)]?.id ??
            selectedNodeId,
        );
      } else if (e.key === "Home") {
        e.preventDefault();
        setSelectedNodeId(chain[0]?.id ?? selectedNodeId);
      } else if (e.key === "End") {
        e.preventDefault();
        setSelectedNodeId(chain.at(-1)?.id ?? selectedNodeId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chain, selectedIndex, selectedNodeId]);

  // ── Load PGN ─────────────────────────────────────────────────────────────
  // `gameUrl` is optional — the chess.com loader passes it through; manual
  // PGN paste leaves it unset. Stored so the extract endpoint can record a
  // back-link on each game-puzzle.
  const loadPgnString = useCallback((
    source: string,
    gameUrl?: string | null,
    pickedUsername?: string | null,
  ) => {
    setError(null);
    setStats(null);
    setAnalyzed(false);
    setExtractInfo(null);
    setSourceUrl(gameUrl ?? null);
    setChessUsername(pickedUsername?.trim() || null);
    try {
      const parsed = parsePgnToStateTree(source);
      if (parsed.moveCount === 0) {
        setError("PGN parsed but contains no moves.");
        return;
      }
      setRootNode(parsed.rootNode);
      setInitialFen(parsed.initialFen);
      setSelectedNodeId(parsed.rootNode.id);
      setPlayers(extractPgnHeaders(source));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not parse PGN: ${message}`);
    }
  }, []);

  // ── Run analysis ─────────────────────────────────────────────────────────
  async function analyze() {
    if (!rootNode || analyzing) return;
    setAnalyzing(true);
    setProgress(0);
    setError(null);
    setAnalyzed(false);

    try {
      // Make sure openings DB is ready before classify runs.
      try {
        await loadOpenings();
      } catch {
        // ignore
      }

      const evaluator = createGameEvaluator(rootNode, initialFen, {
        depth: DEFAULT_DEPTH,
        multiPv: 2,
        onProgress: setProgress,
      });
      cancellerRef.current = evaluator.cancel;

      await evaluator.evaluate();

      // Now classify + compute accuracy
      getGameAnalysis(rootNode);

      // Force re-render with cloned root reference so `chain`/MoveList recompute.
      setRootNode({ ...rootNode });

      const acc = getGameAccuracy(rootNode);
      const nextStats: AnalysisStats = { white: acc.white, black: acc.black };
      setStats(nextStats);
      setAnalyzed(true);

      // Persist for next visit. We keep player names out of persisted stats —
      // they're re-extracted from `pgn` on restore via `extractPgnHeaders`.
      saveAnalysis({
        pgn,
        initialFen,
        rootNode,
        selectedNodeId,
        stats: { ...nextStats, ...players },
        analyzed: true,
      });

      // Eager-extract trainable positions (mistakes + blunders) once the
      // analysis has finished cleanly. The server handles idempotency
      // via INSERT OR IGNORE on the synthetic ID, so re-analysing the
      // same PGN is a silent no-op. Failure here is non-fatal — the
      // game analysis UI still works without the train-this affordance.
      try {
        const stripped = stripParents(rootNode);
        const res = await authFetch("/api/chess/game-puzzles/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pgn,
            initialFen,
            rootNode: stripped,
            sourceUrl: sourceUrl ?? null,
            whiteName: players.whiteName,
            blackName: players.blackName,
            chessUsername: chessUsername ?? null,
          }),
        });
        if (res.ok) {
          const out = (await res.json()) as {
            gameId: string;
            extracted: number;
            inserted: number;
            existed: number;
            puzzles?: { id: string; ply: number; classification: "mistake" | "blunder"; swingCp: number }[];
          };
          setExtractInfo({ ...out, puzzles: out.puzzles ?? [] });
        } else {
          setExtractInfo(null);
        }
      } catch (e) {
        // Bury the error — the user still has a working analysis.
        console.warn("[analysis] extract trainable positions:", e);
        setExtractInfo(null);
      }
    } catch (err) {
      if (err !== "abort") {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Analysis failed: ${message}`);
      }
    } finally {
      setAnalyzing(false);
      cancellerRef.current = null;
    }
  }

  function cancelAnalysis() {
    cancellerRef.current?.();
    cancellerRef.current = null;
    setAnalyzing(false);
  }

  function reset() {
    cancelAnalysis();
    setRootNode(null);
    setSelectedNodeId("");
    setStats(null);
    setAnalyzed(false);
    setProgress(0);
    setError(null);
    setPgn("");
    clearAnalysis();
  }

  // ── Board props ──────────────────────────────────────────────────────────
  const boardFen = selectedNode?.state.fen ?? initialFen;
  const topLine =
    selectedNode &&
    getTopEngineLine(selectedNode.state.engineLines || []);
  const boardEvaluation: Evaluation | null = topLine?.evaluation ?? null;

  const moveSquares: Record<string, React.CSSProperties> = useMemo(() => {
    if (!selectedNode?.state.move) return {};
    const uci = selectedNode.state.move.uci;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const cls = selectedNode.state.classification;
    const color = cls
      ? CLASSIFICATION_STYLES[cls].squareColor
      : "rgba(255, 217, 102, 0.45)";
    return {
      [from]: { background: color },
      [to]: { background: color },
    };
  }, [selectedNode]);

  /** Destination square + classification for the board overlay badge. */
  const moveBadge = useMemo<
    | { square: string; classification: Classification }
    | null
  >(() => {
    if (!selectedNode?.state.move) return null;
    const cls = selectedNode.state.classification;
    if (!cls || !BOARD_BADGE_CLASSES.has(cls)) return null;
    return { square: selectedNode.state.move.uci.slice(2, 4), classification: cls };
  }, [selectedNode]);

  /** First move of the engine's top line at the current position — the best
   *  continuation. Returned as { uci, san, evaluation } so the panel + board
   *  arrow stay in sync. */
  const bestNext = useMemo<
    | { uci: string; san: string; evaluation: Evaluation }
    | null
  >(() => {
    const line = topLine as EngineLine | undefined;
    const head = line?.moves?.[0];
    if (!line || !head) return null;
    return { uci: head.uci, san: head.san, evaluation: line.evaluation };
  }, [topLine]);

  const arrows = useMemo(() => {
    if (!bestNext) return [];
    return [
      {
        startSquare: bestNext.uci.slice(0, 2),
        endSquare: bestNext.uci.slice(2, 4),
        // Amber/orange (Lichess convention for engine suggestion). Played-move
        // highlights use the classification colour palette — keeping these
        // distinct stops users from misreading the engine arrow as a played move.
        color: "rgba(245, 158, 11, 0.9)",
      },
    ];
  }, [bestNext]);

  return (
    <div className="flex w-full flex-1 flex-col">
      <AnalysisShell
        hasGame={!!rootNode}
        fen={boardFen}
        evaluation={boardEvaluation}
        squareStyles={moveSquares}
        arrows={arrows}
        badge={moveBadge}
        players={players}
        analyzed={analyzed}
        analyzing={analyzing}
        progress={progress}
        error={error}
        extractInfo={extractInfo}
        onLoadPgn={(p, url, name) => {
          setPgn(p);
          loadPgnString(p, url, name);
        }}
        onAnalyze={analyze}
        onCancel={cancelAnalysis}
        onReset={reset}
        selectedNode={selectedNode}
        chain={chain}
        selectedIndex={selectedIndex}
        stats={stats}
        onSelectIndex={(i) => {
          const n = chain[i];
          if (n) setSelectedNodeId(n.id);
        }}
        onSelectNodeId={setSelectedNodeId}
        orientation={orientation}
        onFlipBoard={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Single-line player chip: filled circle (piece colour) + username + ELO.
 *  Rendered touching the board top/bottom edges so [opponent + board + user]
 *  reads as one grouped unit. */
function PlayerLabel({
  name,
  elo,
  colour,
}: {
  name: string;
  elo?: string;
  colour: "white" | "black";
}) {
  const isWhite = colour === "white";
  // Outer gap-2 keeps the colour-dot snug against the username (it reads
  // as a single unit). Inner ml-3 gives the rating badge real breathing
  // room from the username so it doesn't look pasted on.
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span
        aria-hidden
        className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-zinc-300 dark:ring-zinc-600"
        style={{ background: isWhite ? "#f8fafc" : "#0a0a0a" }}
      />
      <span className="font-semibold text-zinc-800 dark:text-zinc-100">
        {name}
      </span>
      {elo ? (
        <span className="ml-3 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {elo}
        </span>
      ) : null}
    </div>
  );
}

/** Tiny green callout that shows after an analysis completes, summarising
 *  how many trainable positions were extracted from the game. Click-through
 *  to a filtered puzzle list so the user can start training right away. */
function ExtractIndicator({
  info,
}: {
  info: { inserted: number; existed: number; extracted: number; gameId: string };
}) {
  // Clean game: muted single line, no CTA. The user's mental model after
  // analysis is "tell me my mistakes" — for a clean game there's nothing
  // to do, so the affordance disappears entirely.
  if (info.extracted === 0) {
    return (
      <p className="rounded-md bg-zinc-50 px-2.5 py-2 text-[11px] text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
        Clean game — no mistakes or blunders to train.
      </p>
    );
  }
  const newly = info.inserted;
  const prev = info.existed;
  // Vertical card so the headline, sublabel, and Train button each get
  // their own row. Previous flex-row layout collapsed at 280px width and
  // pushed the button onto its own line with the parenthetical hanging
  // mid-sentence above it.
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
      <div>
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          ✓ {info.extracted} trainable position{info.extracted === 1 ? "" : "s"} saved
        </p>
        {prev > 0 ? (
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
            {newly} new this analysis · {prev} already saved
          </p>
        ) : (
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
            From the mistakes & blunders Stockfish flagged in this game.
          </p>
        )}
      </div>
      <Link
        href={`/chess/games?gameId=${encodeURIComponent(info.gameId)}`}
        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
      >
        <Play className="h-3 w-3" fill="currentColor" />
        Train these positions
      </Link>
    </div>
  );
}

/** Format a centipawn / mate Evaluation as a compact "+0.4" / "M3" string. */
function formatEval(ev: Evaluation | null | undefined): string | null {
  if (!ev) return null;
  if (ev.type === "mate") {
    if (ev.value === 0) return "M";
    return `${ev.value > 0 ? "+M" : "-M"}${Math.abs(ev.value)}`;
  }
  const cp = (ev.value ?? 0) / 100;
  if (Math.abs(cp) < 0.05) return "0.0";
  return `${cp > 0 ? "+" : ""}${cp.toFixed(1)}`;
}

/** "Bd5 is excellent" headline with move number + player + eval. When the
 *  move is a Mistake or Blunder that survived our extraction filter, we
 *  also surface a "Train this position" deep-link to the synthetic puzzle. */
function MoveTitleCard({
  selectedNode,
  moveNumber,
  trainPuzzleId,
}: {
  selectedNode: StateTreeNode | null;
  moveNumber: number;
  /** When non-null, the position before this move was extracted as a
   *  game-puzzle and clicking "Train this" routes to /chess/puzzles/<id>. */
  trainPuzzleId?: string | null;
}) {
  if (!selectedNode?.state.move) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
        Click a move on the graph below or use ←/→ to step through the game.
      </div>
    );
  }
  const cls = selectedNode.state.classification;
  const playedSan = selectedNode.state.move.san;
  const parent = selectedNode.parent;
  const parentTop = getTopEngineLine(parent?.state.engineLines || []);
  const bestSan = parentTop?.moves[0]?.san;
  const isBest = bestSan != null && playedSan === bestSan;
  const opening = selectedNode.state.opening;
  const sideLabel =
    selectedNode.state.moveColour === PieceColour.WHITE ? "White" : "Black";
  const isWhite = selectedNode.state.moveColour === PieceColour.WHITE;
  const topLine = getTopEngineLine(selectedNode.state.engineLines || []);
  const evalText = formatEval(topLine?.evaluation);

  // Eyebrow: "Move 12 · ● White · +0.4"
  const Eyebrow = (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
      <span>Move {moveNumber}</span>
      <span aria-hidden>·</span>
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full ring-1 ring-zinc-300 dark:ring-zinc-600"
          style={{ background: isWhite ? "#f8fafc" : "#0a0a0a" }}
        />
        {sideLabel}
      </span>
      {evalText ? (
        <>
          <span aria-hidden>·</span>
          <span className="font-mono normal-case tracking-normal">{evalText}</span>
        </>
      ) : null}
    </div>
  );

  if (!cls) {
    // No classification yet (e.g. analysis still computing for this ply).
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
        {Eyebrow}
        <h3 className="mt-1 font-mono text-base font-semibold text-zinc-700 dark:text-zinc-200">
          {playedSan}
        </h3>
        {opening ? (
          <p className="mt-1 text-xs italic text-zinc-500 dark:text-zinc-400">{opening}</p>
        ) : null}
      </div>
    );
  }

  const style = CLASSIFICATION_STYLES[cls];
  const Icon = style.icon;
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      {Eyebrow}
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: style.solid }}
        >
          <Icon className="h-3.5 w-3.5 text-white" aria-hidden />
        </span>
        <h3
          className="text-base font-semibold leading-tight"
          style={{ color: style.solid }}
        >
          <span className="font-mono">{playedSan}</span> is {style.label.toLowerCase()}
        </h3>
      </div>
      {!isBest && bestSan ? (
        <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          The best move was{" "}
          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            {bestSan}
          </span>
        </p>
      ) : null}
      {opening ? (
        <p className="mt-1.5 text-xs italic text-zinc-500 dark:text-zinc-400">
          {opening}
        </p>
      ) : null}
      {trainPuzzleId ? (
        <Link
          href={`/chess/puzzles/${encodeURIComponent(trainPuzzleId)}`}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
        >
          <Play className="h-3 w-3" fill="currentColor" />
          Train this position
        </Link>
      ) : null}
    </div>
  );
}

/** Move list — paired (white, black) rows down the right pane. Lichess-
 *  style compact layout: each row is `[ply-num] [white SAN + cls icon]
 *  [black SAN + cls icon]`. Active move highlighted; mistakes/blunders/
 *  inaccuracies get their classification icon inline so the user can
 *  spot trouble spots while scrolling.
 *
 *  Scrolling is the panel's own `overflow-y-auto`; on selection change we
 *  scrollIntoView the active button so it stays visible while
 *  arrow-keying through long games. */
function MoveList({
  chain,
  selectedNodeId,
  onSelect,
}: {
  chain: StateTreeNode[];
  selectedNodeId: string;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pair plies into (white, black) rows. chain[0] is the root (no move),
  // chain[1] = ply 1 (white), chain[2] = ply 2 (black), and so on.
  const rows: { num: number; white?: StateTreeNode; black?: StateTreeNode }[] = [];
  for (let i = 1; i < chain.length; i += 2) {
    rows.push({
      num: Math.floor((i - 1) / 2) + 1,
      white: chain[i],
      black: chain[i + 1],
    });
  }

  // Auto-scroll the active row into view on selection change. `nearest`
  // doesn't jolt the scroll position when the active move is already
  // visible — only nudges when it would otherwise leave the panel.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-node-id="${selectedNodeId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedNodeId]);

  if (chain.length <= 1) {
    return (
      <p className="px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Load a game to see its moves here.
      </p>
    );
  }

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
      <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((r) => (
          <li
            key={r.num}
            className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1 px-2 py-1 text-sm"
          >
            <span className="text-right font-mono text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {r.num}.
            </span>
            <MoveCell node={r.white} active={selectedNodeId === r.white?.id} onSelect={onSelect} />
            <MoveCell node={r.black} active={selectedNodeId === r.black?.id} onSelect={onSelect} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function MoveCell({
  node,
  active,
  onSelect,
}: {
  node?: StateTreeNode;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  if (!node?.state.move) {
    return <span className="px-1 text-zinc-300 dark:text-zinc-700">—</span>;
  }
  const cls = node.state.classification;
  const style = cls ? CLASSIFICATION_STYLES[cls] : null;
  const Icon = style?.icon;
  return (
    <button
      type="button"
      data-node-id={node.id}
      onClick={() => onSelect(node.id)}
      className={`flex items-center gap-1 rounded-r border-l-[3px] px-1.5 py-0.5 text-left font-mono text-[12px] transition ${
        active
          ? "border-l-emerald-500 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100"
          : "border-l-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      <span className="truncate">{node.state.move.san}</span>
      {style && Icon ? (
        <Icon
          className="h-3 w-3 shrink-0"
          style={{ color: style.solid }}
          aria-label={style.label}
        />
      ) : null}
    </button>
  );
}

/** Eval graph: white area on top, black on bottom, classification dots on the
 *  curve, vertical emerald marker for the current ply. Click anywhere to seek. */
function EvalGraph({
  chain,
  selectedIndex,
  onSelect,
}: {
  chain: StateTreeNode[];
  selectedIndex: number;
  onSelect: (i: number) => void;
}) {
  const data = useMemo(() => {
    return chain.map((node) => {
      const top = getTopEngineLine(node.state.engineLines || []);
      const ev = top?.evaluation;
      let val = 0;
      if (ev) {
        if (ev.type === "mate") val = ev.value > 0 ? 10 : -10;
        else val = Math.max(-10, Math.min(10, (ev.value ?? 0) / 100));
      }
      return { val, classification: node.state.classification };
    });
  }, [chain]);

  if (data.length < 2) return null;

  const W = 100;
  const H = 28;
  const xAt = (i: number) => (i / (data.length - 1)) * W;
  const yAt = (v: number) => H / 2 - (v / 10) * (H / 2);

  // White area: trace from top-left, follow eval curve, close at top-right.
  const curve = data.map((d, i) => `L ${xAt(i)},${yAt(d.val)}`).join(" ");
  const whitePath = `M 0,0 L 0,${yAt(data[0].val)} ${curve} L ${W},0 Z`;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.round((x / rect.width) * (data.length - 1));
    onSelect(Math.max(0, Math.min(data.length - 1, i)));
  };

  // Eval at the currently selected ply (used for the floating axis label).
  const currentEval = selectedIndex >= 0 && selectedIndex < data.length
    ? data[selectedIndex].val
    : null;

  // X-axis ticks: every 10 plies (≈5 fullmoves). Skip the first/last to
  // avoid clobbering the side labels.
  const xTicks: { i: number; ply: number }[] = [];
  for (let p = 10; p < data.length - 5; p += 10) {
    xTicks.push({ i: p, ply: p });
  }

  // Hover state for the tooltip + crosshair. We track ply index so the
  // tooltip text can read the same data array we plotted from. Falls
  // back to the active selection when the user isn't hovering.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.round((x / rect.width) * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, i)));
  };
  const tooltipIdx = hoverIdx ?? (selectedIndex >= 0 && selectedIndex < data.length ? selectedIndex : null);
  const tooltipPly = tooltipIdx != null ? tooltipIdx : null;
  const tooltipEval = tooltipIdx != null ? data[tooltipIdx].val : null;

  return (
    <div
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIdx(null)}
      className="cursor-pointer overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
      role="img"
      aria-label="Evaluation graph — click to seek"
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-24 w-full"
        >
          <rect width={W} height={H} fill="#18181b" />
          <path d={whitePath} fill="#f4f4f5" />
          {/* Mid-line at eval = 0 */}
          <line
            x1={0}
            y1={H / 2}
            x2={W}
            y2={H / 2}
            stroke="#71717a"
            strokeWidth={0.15}
            strokeDasharray="0.5 0.5"
            opacity={0.6}
          />
          {/* Quarter-lines at ±5 cp (half eval scale) — gives the eye a
               reference for "winning by a lot" vs "winning by a little" */}
          <line x1={0} y1={H / 4}     x2={W} y2={H / 4}     stroke="#71717a" strokeWidth={0.08} opacity={0.4} />
          <line x1={0} y1={(H * 3) / 4} x2={W} y2={(H * 3) / 4} stroke="#71717a" strokeWidth={0.08} opacity={0.4} />
          {/* X-axis tick marks every 10 plies */}
          {xTicks.map(({ i }) => (
            <line
              key={`xt-${i}`}
              x1={xAt(i)}
              y1={H - 1.5}
              x2={xAt(i)}
              y2={H}
              stroke="#71717a"
              strokeWidth={0.15}
              opacity={0.5}
            />
          ))}
          {data.map((d, i) => {
            if (!d.classification) return null;
            const style = CLASSIFICATION_STYLES[d.classification];
            return (
              <circle
                key={i}
                cx={xAt(i)}
                cy={yAt(d.val)}
                r={0.7}
                fill={style.solid}
              />
            );
          })}
          {selectedIndex >= 0 && selectedIndex < data.length ? (
            <line
              x1={xAt(selectedIndex)}
              y1={0}
              x2={xAt(selectedIndex)}
              y2={H}
              stroke="#10b981"
              strokeWidth={0.25}
            />
          ) : null}
          {/* Hover crosshair (slightly thinner than active marker so it's
               distinguishable from the selected ply). */}
          {hoverIdx != null && hoverIdx !== selectedIndex ? (
            <line
              x1={xAt(hoverIdx)}
              y1={0}
              x2={xAt(hoverIdx)}
              y2={H}
              stroke="#a3a3a3"
              strokeWidth={0.18}
              strokeDasharray="0.4 0.4"
            />
          ) : null}
        </svg>
        {/* Y-axis labels — implicit scale at top (+5), middle (0), bottom (-5).
            Positioned absolutely so the SVG viewBox can stay simple. */}
        <span className="pointer-events-none absolute left-1.5 top-0.5 font-mono text-[8px] text-zinc-500">+5</span>
        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 font-mono text-[8px] text-zinc-500">0</span>
        <span className="pointer-events-none absolute bottom-0.5 left-1.5 font-mono text-[8px] text-zinc-500">−5</span>
        {/* Side labels — anchored bottom-right so they don't clobber the
            tooltip pill at the top-right. */}
        <span className="pointer-events-none absolute right-1 bottom-0.5 text-[8px] font-semibold uppercase tracking-wider text-zinc-500">
          ply
        </span>
        {/* Tooltip / current eval pill — top-right. Reads hover state when
            hovering, falls back to the selected ply otherwise so the
            display always answers "what eval is shown right now". */}
        {tooltipPly != null && tooltipEval != null ? (
          <span className="pointer-events-none absolute right-1 top-1 rounded bg-emerald-600/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
            #{tooltipPly} {tooltipEval > 0 ? "+" : ""}{tooltipEval.toFixed(1)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Two-tile accuracies card: white tile (light) for white, black tile (dark)
 *  for black. Each tile shows the player's name beneath the percentage so the
 *  reader doesn't have to deduce which side is which from the tile colour. */
function AccuracyTiles({
  whiteAccuracy,
  blackAccuracy,
  whiteName,
  blackName,
}: {
  whiteAccuracy?: number;
  blackAccuracy?: number;
  whiteName: string;
  blackName: string;
}) {
  const fmt = (v?: number) => {
    if (v === undefined || !Number.isFinite(v)) return "—";
    return `${v.toFixed(1)}%`;
  };
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
      <header className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
        Accuracies
      </header>
      <div className="grid grid-cols-2">
        <div className="bg-white px-2 py-2.5 text-center text-zinc-900">
          <div className="text-2xl font-bold tabular-nums leading-none">
            {fmt(whiteAccuracy)}
          </div>
          <div className="mt-1 truncate text-[10px] font-medium text-zinc-500" title={whiteName}>
            {whiteName}
          </div>
        </div>
        <div className="bg-zinc-900 px-2 py-2.5 text-center text-zinc-50">
          <div className="text-2xl font-bold tabular-nums leading-none">
            {fmt(blackAccuracy)}
          </div>
          <div className="mt-1 truncate text-[10px] font-medium text-zinc-400" title={blackName}>
            {blackName}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Width reserved by the eval bar to the left of the board. */
// ─── Shell layout constants (mirroring `components/chess/board-layout-shell`)
const EVAL_BAR_RESERVE = 28;
const SHELL_LEFT_W = 260;
// 360 px (was 280) — at 280 the per-classification labels in the stats
// panel were getting clipped on the left ("illiant", "itical", "st",
// "cellent", "ay") because the label column collapsed below its content
// width. 360 gives Inaccuracy + Mistake + Blunder + every shorter label
// full breathing room and also lets the move list show longer SANs
// (Bxf7+, cxd4+, etc.) without truncating.
const SHELL_RIGHT_W = 360;
const SHELL_BOARD_PAD = 16;
// Tightened iteratively (720 → 600 → 520) so at default browser zoom on a
// typical 1280–1440 wide viewport the card sits centered with a visible
// gray gutter on each side, matching how the puzzle page looks. Larger
// caps make the card stretch wide enough that the rounded border drifts
// off-canvas and the layout feels uncontained.
const SHELL_BOARD_MAX = 520;
const SHELL_BOARD_MIN = 220;
/** Cap so the card doesn't span an ultrawide monitor edge-to-edge. The
 *  cap is sized so that, at maximum, the board still hits SHELL_BOARD_MAX
 *  (520) after subtracting LEFT_W + RIGHT_W + EVAL_RESERVE + 2*PAD. Bumped
 *  from 1060 → 1200 alongside the RIGHT_W widen so the board doesn't
 *  shrink to compensate. */
const SHELL_COMBO_MAX = 1200;
/** Classifications that warrant an icon overlay on the destination square.
 *  We hide the badge for OKAY/EXCELLENT/THEORY/FORCED — the square tint and the
 *  graph dot already convey them, so the overlay just clutters the played piece. */
const BOARD_BADGE_CLASSES: Set<Classification> = new Set([
  Classification.BRILLIANT,
  Classification.CRITICAL,
  Classification.BEST,
  Classification.INACCURACY,
  Classification.MISTAKE,
  Classification.BLUNDER,
]);

/** Three-column flush card: LEFT aside (Coach / pre-analyze) | CENTER (player
 *  chip → eval bar+board → player chip → nav) | RIGHT aside (graph, accuracies,
 *  classification). Same visual structure as `BoardLayoutShell` used by the
 *  puzzle/opening-trainer pages so analysis reads as part of the same family. */
function AnalysisShell({
  hasGame,
  fen,
  evaluation,
  squareStyles,
  arrows,
  badge,
  players,
  analyzed,
  analyzing,
  progress,
  error,
  extractInfo,
  onLoadPgn,
  onAnalyze,
  onCancel,
  onReset,
  selectedNode,
  chain,
  selectedIndex,
  stats,
  onSelectIndex,
  onSelectNodeId,
  orientation,
  onFlipBoard,
}: {
  hasGame: boolean;
  fen: string;
  evaluation: Evaluation | null;
  squareStyles: Record<string, React.CSSProperties>;
  arrows: { startSquare: string; endSquare: string; color: string }[];
  badge: { square: string; classification: Classification } | null;
  players: PlayerInfo;
  analyzed: boolean;
  analyzing: boolean;
  progress: number;
  error: string | null;
  extractInfo: {
    inserted: number;
    existed: number;
    extracted: number;
    gameId: string;
    puzzles: { id: string; ply: number; classification: "mistake" | "blunder"; swingCp: number }[];
  } | null;
  onLoadPgn: (
    pgn: string,
    sourceUrl?: string | null,
    chessUsername?: string | null,
  ) => void;
  onAnalyze: () => void;
  onCancel: () => void;
  onReset: () => void;
  selectedNode: StateTreeNode | null;
  chain: StateTreeNode[];
  selectedIndex: number;
  stats: AnalysisStats | null;
  onSelectIndex: (i: number) => void;
  onSelectNodeId: (id: string) => void;
  orientation: "white" | "black";
  onFlipBoard: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState(0);
  const [chrome, setChrome] = useState({ topH: 0, botH: 0 });

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (W <= 0 || H <= 0) return;
      const topH = topRef.current?.offsetHeight ?? 0;
      const botH = botRef.current?.offsetHeight ?? 0;
      const verticalChrome = topH + botH + SHELL_BOARD_PAD * 2;
      const horizontalChrome =
        SHELL_LEFT_W + SHELL_RIGHT_W + SHELL_BOARD_PAD * 2 + EVAL_BAR_RESERVE;
      const availW = W - horizontalChrome;
      const availH = H - verticalChrome;
      const next = Math.max(
        SHELL_BOARD_MIN,
        Math.floor(
          Math.min(Math.max(0, availW), Math.max(0, availH), SHELL_BOARD_MAX),
        ),
      );
      setEdge(next);
      setChrome({ topH, botH });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (topRef.current) ro.observe(topRef.current);
    if (botRef.current) ro.observe(botRef.current);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  const cardWidth =
    edge > 0
      ? SHELL_LEFT_W + EVAL_BAR_RESERVE + edge + SHELL_BOARD_PAD * 2 + SHELL_RIGHT_W
      : undefined;
  const cardHeight =
    edge > 0
      ? edge + SHELL_BOARD_PAD * 2 + chrome.topH + chrome.botH
      : undefined;

  return (
    <div
      ref={stageRef}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-hidden bg-zinc-100 dark:bg-[#1e1e1e]"
    >
      <div
        className="flex max-h-full shrink-0 flex-row overflow-hidden rounded-lg shadow-xl ring-1 ring-black/10 dark:shadow-2xl dark:ring-white/5"
        style={{
          width: cardWidth,
          height: cardHeight,
          maxWidth: `min(100%, ${SHELL_COMBO_MAX}px)`,
        }}
      >
        {/* ── LEFT: Back / title / picker (no game) or analyze tools ──
             Mirrors the puzzle page's left-aside structure exactly: Back
             link with its own px-4 padding, then a flex-1 column containing
             a scrollable content region and an optional bottom-pinned
             action bar — so the column reads as one cohesive panel rather
             than a stack of detached cards. */}
        <aside
          className="flex min-h-0 shrink-0 flex-col bg-white dark:bg-[#262421]"
          style={{ width: SHELL_LEFT_W }}
        >
          <Link
            href="/chess"
            className="flex shrink-0 items-center gap-1 px-4 pb-1 pt-3 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back
          </Link>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-4">
              <div className="flex flex-col gap-3 py-2">
                <SidebarTitle eyebrow="Analysis" title="Game Analysis" />

                {!hasGame ? (
                  <>
                    <ChessComLoader
                      onPick={(g, chessUsername) =>
                        onLoadPgn(g.pgn, g.url || null, chessUsername)
                      }
                    />
                    {error ? (
                      <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-200">
                        {error}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    {!analyzing ? (
                      <button
                        type="button"
                        onClick={onReset}
                        className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-zinc-500 underline-offset-4 transition hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        <RotateCcw className="h-3 w-3" /> Choose another game
                      </button>
                    ) : null}

                    {analyzed ? (
                      <MoveTitleCard
                        selectedNode={selectedNode}
                        moveNumber={Math.max(1, Math.ceil(selectedIndex / 2))}
                        trainPuzzleId={
                          extractInfo?.puzzles.find((p) => p.ply === selectedIndex)?.id ?? null
                        }
                      />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          Ready to analyze
                        </p>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                          <dt className="text-zinc-500 dark:text-zinc-400">Engine</dt>
                          <dd className="font-mono text-zinc-700 dark:text-zinc-200">
                            Stockfish 17 (lite)
                          </dd>
                          <dt className="text-zinc-500 dark:text-zinc-400">Depth</dt>
                          <dd className="font-mono text-zinc-700 dark:text-zinc-200">
                            {DEFAULT_DEPTH}
                          </dd>
                          <dt className="text-zinc-500 dark:text-zinc-400">MultiPV</dt>
                          <dd className="font-mono text-zinc-700 dark:text-zinc-200">2</dd>
                        </dl>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Plies list — fills the remaining vertical space and scrolls
                on its own so very long games don't push the bottom action
                off-screen. */}
            {hasGame ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-zinc-100 dark:border-zinc-800">
                <p className="shrink-0 px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {Math.max(0, chain.length - 1).toLocaleString()} plies
                </p>
                <MoveList
                  chain={chain}
                  selectedNodeId={selectedNode?.id ?? ""}
                  onSelect={onSelectNodeId}
                />
              </div>
            ) : null}

            {/* Bottom-pinned action: Analyze before/while running, then
                Train these positions once analysis completes. */}
            {hasGame && !analyzed ? (
              <div className="shrink-0 border-t border-zinc-200/80 px-4 pb-3 pt-3 dark:border-zinc-700/50">
                {analyzing ? (
                  <div className="flex flex-col gap-2">
                    <div className="h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full bg-emerald-500 transition-[width]"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-zinc-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Analyzing… {Math.round(progress * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={onCancel}
                        className="font-medium text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onAnalyze}
                    style={{ backgroundColor: "#769656" }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:brightness-95"
                  >
                    <Play className="h-4 w-4" fill="currentColor" />
                    Analyze
                  </button>
                )}
                {error ? (
                  <p className="mt-2 rounded-md bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-200">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}
            {hasGame && analyzed && extractInfo ? (
              <div className="shrink-0 border-t border-zinc-200/80 px-4 pb-3 pt-3 dark:border-zinc-700/50">
                <ExtractIndicator info={extractInfo} />
              </div>
            ) : null}
          </div>
        </aside>

        {/* ── CENTER: top chip → eval+board → bottom chip ──
             When orientation === "white" the bottom belongs to white (default
             chess view). Flipping swaps which player sits on each edge so the
             chip + board orientation always agree. */}
        <div
          className="flex min-h-0 min-w-0 flex-col items-stretch bg-white dark:bg-[#262421]"
          style={{ padding: SHELL_BOARD_PAD }}
        >
          <div ref={topRef} style={{ paddingLeft: EVAL_BAR_RESERVE }}>
            <PlayerLabel
              name={orientation === "white" ? players.blackName : players.whiteName}
              elo={orientation === "white" ? players.blackElo : players.whiteElo}
              colour={orientation === "white" ? "black" : "white"}
            />
          </div>

          {edge > 0 ? (
            <div className="flex" style={{ height: edge, width: edge + EVAL_BAR_RESERVE }}>
              <EvaluationBar
                evaluation={evaluation}
                height={edge}
                flipped={orientation === "black"}
              />
              <div
                className="relative shrink-0"
                style={{ width: edge, height: edge }}
              >
                <ChessBoardWrapper
                  className="overflow-hidden rounded-xl"
                  forcedBoardWidth={edge}
                  useViewportSizeFallback={false}
                  options={{
                    position: fen,
                    allowDragging: false,
                    squareStyles,
                    arrows,
                    boardOrientation: orientation,
                    // Disable react-chessboard's tween animations. Jumping
                    // a few plies (clicking a non-adjacent move) makes the
                    // diff drop pieces without a clean 1:1 candidate match
                    // for the duration of the animation, so the board
                    // appears to lose pieces.
                    showAnimations: false,
                  }}
                />
                {badge ? (
                  <BoardClassificationBadge
                    size={edge}
                    square={badge.square}
                    classification={badge.classification}
                    flipped={orientation === "black"}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            ref={botRef}
            className="flex items-center justify-between"
            style={{ paddingLeft: EVAL_BAR_RESERVE }}
          >
            <PlayerLabel
              name={orientation === "white" ? players.whiteName : players.blackName}
              elo={orientation === "white" ? players.whiteElo : players.blackElo}
              colour={orientation === "white" ? "white" : "black"}
            />
            <button
              type="button"
              onClick={onFlipBoard}
              title="Flip board"
              aria-label="Flip board"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <FlipVertical2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* ── RIGHT: analytics — eval graph + accuracies + classification
             counts. Glanced at occasionally; sized to its content. */}
        <aside
          className="flex min-h-0 shrink-0 flex-col bg-white dark:bg-[#262421]"
          style={{ width: SHELL_RIGHT_W }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="flex flex-col gap-3">
              {analyzed ? (
                <>
                  <EvalGraph
                    chain={chain}
                    selectedIndex={selectedIndex}
                    onSelect={onSelectIndex}
                  />
                  <AccuracyTiles
                    whiteAccuracy={stats?.white}
                    blackAccuracy={stats?.black}
                    whiteName={players.whiteName}
                    blackName={players.blackName}
                  />
                  <ClassificationStatsPanel
                    chain={chain}
                    analyzed
                    whiteName={players.whiteName}
                    blackName={players.blackName}
                  />
                </>
              ) : (
                <ClassificationStatsPanel
                  chain={chain}
                  analyzed={false}
                  analyzing={analyzing}
                  whiteName={players.whiteName}
                  blackName={players.blackName}
                />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Classification badge overlaid on the destination square of the played move,
 *  in the top-right corner. Sized at ~30% of the square (wintrchess style). */
function BoardClassificationBadge({
  size,
  square,
  classification,
  flipped = false,
}: {
  size: number;
  square: string;
  classification: Classification;
  flipped?: boolean;
}) {
  const style = CLASSIFICATION_STYLES[classification];
  const Icon = style.icon;

  // Square geometry. Default (white-orientation): file a→h is left→right,
  // rank 1→8 is bottom→top. When flipped (black-orientation) the board is
  // rotated 180°, so file a is on the right and rank 1 is at the top.
  const file = square.charCodeAt(0) - 97; // a=0
  const rank = parseInt(square[1] ?? "0", 10);
  if (Number.isNaN(rank) || file < 0 || file > 7 || rank < 1 || rank > 8) {
    return null;
  }
  const squareSize = size / 8;
  const badgeSize = Math.max(14, Math.round(squareSize * 0.34));
  const inset = Math.max(2, Math.round(squareSize * 0.06));

  // Top-right corner of the destination square (visual, after orientation).
  const visualFile = flipped ? 7 - file : file;
  const visualRowFromTop = flipped ? rank - 1 : 8 - rank;
  const left = (visualFile + 1) * squareSize - badgeSize - inset;
  const top = visualRowFromTop * squareSize + inset;

  return (
    <div
      className="pointer-events-none absolute z-20 flex items-center justify-center rounded-full shadow-md ring-2 ring-white/90 dark:ring-zinc-900/80"
      style={{
        left,
        top,
        width: badgeSize,
        height: badgeSize,
        background: style.solid,
      }}
      title={style.label}
      aria-label={style.label}
    >
      <Icon
        className="text-white drop-shadow"
        style={{ width: badgeSize * 0.6, height: badgeSize * 0.6 }}
        aria-hidden
      />
    </div>
  );
}

/** Per-player classification counts (replaces the long move list). */
// Theory is intentionally NOT in this list — both players follow the same
// opening line, so its per-side count is identical and meaningless as a
// comparison metric. Surfaced as a single-value metadata line above the
// table instead ("Followed theory through move N").
const STATS_CLASSIFICATIONS: Classification[] = [
  Classification.BRILLIANT,
  Classification.CRITICAL,
  Classification.BEST,
  Classification.EXCELLENT,
  Classification.OKAY,
  Classification.INACCURACY,
  Classification.MISTAKE,
  Classification.BLUNDER,
];

function ClassificationStatsPanel({
  chain,
  analyzed,
  analyzing = false,
  whiteName,
  blackName,
}: {
  chain: StateTreeNode[];
  analyzed: boolean;
  analyzing?: boolean;
  whiteName: string;
  blackName: string;
}) {
  const counts = useMemo(() => {
    // Walk every classification we know about — even Theory, which we
    // surface separately. Keeps the loop a single pass.
    const ALL_CLS = [...STATS_CLASSIFICATIONS, Classification.THEORY];
    const c: Record<string, { white: number; black: number }> = {};
    for (const cls of ALL_CLS) c[cls] = { white: 0, black: 0 };
    for (const node of chain) {
      const cls = node.state.classification;
      if (!cls || !c[cls]) continue;
      if (node.state.moveColour === PieceColour.WHITE) c[cls].white++;
      else if (node.state.moveColour === PieceColour.BLACK) c[cls].black++;
    }
    return c;
  }, [chain]);

  if (!analyzed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
        {analyzing ? (
          <Loader2
            className="h-8 w-8 animate-spin text-zinc-300 dark:text-zinc-600"
            aria-hidden
          />
        ) : (
          <BarChart3
            className="h-8 w-8 text-zinc-300 dark:text-zinc-600"
            aria-hidden
          />
        )}
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {analyzing
            ? "Analysing — counts and accuracies will appear here when Stockfish finishes."
            : "Run analysis to see per-player classification counts and accuracies."}
        </p>
      </div>
    );
  }

  // Theory ply count = white theory moves + black theory moves (both halves
  // of each "in-book" position). Surfaced as a single-line metadata above
  // the comparison table — value is identical for both players, so the
  // table row was meaningless.
  const theoryPlies = counts[Classification.THEORY].white + counts[Classification.THEORY].black;
  const theoryFullmove = Math.ceil(theoryPlies / 2);

  // Grid template:
  //   [label = minmax(8rem, 1fr)] [white# 2rem] [icon 1.25rem] [black# 2rem]
  // The minmax floor stops the label column from collapsing when the right
  // pane is at its narrowest — previous version used a bare `1fr` which
  // could shrink to 0 and clip the leading characters of "Brilliant" /
  // "Inaccuracy" / etc. 8rem (128px) comfortably fits "Inaccuracy" (the
  // longest label) plus a few px of breathing room.
  const ROW_COLS = "grid-cols-[minmax(8rem,1fr)_2rem_1.25rem_2rem]";
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-100">
      {theoryPlies > 0 ? (
        <p
          className="border-b border-zinc-100 bg-amber-50/50 px-3 py-1.5 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-amber-950/20 dark:text-zinc-300"
          title={`Both players followed opening theory through move ${theoryFullmove}`}
        >
          <span className="font-semibold text-amber-700 dark:text-amber-300">Theory</span>{" "}
          followed through move {theoryFullmove}
        </p>
      ) : null}
      {/* Header — chess-piece dot icons instead of usernames. Usernames
           truncated to "Pacan…" / "kentr…" looked like a render bug; the
           ○/● dots map directly to the piece colour each player controls. */}
      <div
        className={`grid ${ROW_COLS} items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400`}
      >
        <span aria-hidden />
        <span
          aria-label={`White (${whiteName})`}
          title={whiteName}
          className="flex justify-end"
        >
          <span
            className="inline-block h-3 w-3 rounded-full ring-1 ring-zinc-300 dark:ring-zinc-600"
            style={{ background: "#f8fafc" }}
          />
        </span>
        <span aria-hidden />
        <span
          aria-label={`Black (${blackName})`}
          title={blackName}
          className="flex justify-end"
        >
          <span
            className="inline-block h-3 w-3 rounded-full ring-1 ring-zinc-300 dark:ring-zinc-600"
            style={{ background: "#0a0a0a" }}
          />
        </span>
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {STATS_CLASSIFICATIONS.map((cls) => {
          const style = CLASSIFICATION_STYLES[cls];
          const row = counts[cls];
          return (
            <li
              key={cls}
              className={`grid ${ROW_COLS} items-center gap-2 px-3 py-1.5 text-sm`}
            >
              <span className={`whitespace-nowrap text-[13px] font-medium ${style.rowText}`}>
                {style.label}
              </span>
              <span className="text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-300">
                {row.white}
              </span>
              <span className="flex items-center justify-center">
                <ClassificationBadge classification={cls} size={18} />
              </span>
              <span className="text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-300">
                {row.black}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
