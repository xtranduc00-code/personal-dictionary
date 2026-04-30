"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { toast } from "react-toastify";
import {
  ArrowLeft, BookOpen, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Copy,
  Crown, Filter, Flag, Lightbulb, Loader2, MessageSquare, Mic, MicOff, Microscope, Play,
  RefreshCw, Send, Star, Swords, Trophy, Undo2, Users,
  Volume2, VolumeX, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { authFetch, useAuth } from "@/lib/auth-context";
import { incrementChessPuzzleCounter } from "@/components/daily-tasks/daily-tasks-auto-detect";
import {
  HINT_MAX_LEVEL,
  buildLevel1Hint,
  buildLevel2Hint,
  buildLevel3Hint,
  type PuzzleHint,
} from "@/lib/puzzleHints";
import { supabase } from "@/lib/supabase";
import { createChessGame, getChessGame, joinChessGame, updateChessGame, type ChessGame } from "@/lib/chess-storage";
import { useMeetCall } from "@/lib/meet-call-context";
import { type BuiltInPuzzle } from "@/lib/chess-puzzles-data";
function ChessSectionSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-zinc-400">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

const GameReview = dynamic(() => import("./game-review").then((m) => m.GameReview), {
  ssr: false,
  loading: () => <ChessSectionSkeleton label="Loading game review…" />,
});
const OpeningTrainer = dynamic(() => import("./opening-trainer").then((m) => m.OpeningTrainer), {
  ssr: false,
  loading: () => <ChessSectionSkeleton label="Loading opening trainer…" />,
});
const EndgameTrainer = dynamic(() => import("./endgame-trainer").then((m) => m.EndgameTrainer), {
  ssr: false,
  loading: () => <ChessSectionSkeleton label="Loading endgame trainer…" />,
});
const PuzzleRush = dynamic(() => import("./puzzle-rush").then((m) => m.PuzzleRush), {
  ssr: false,
  loading: () => <ChessSectionSkeleton label="Loading Puzzle Rush…" />,
});
import { ChessMoveAnnounceChip } from "@/components/chess-move-announce-chip";
import { useChessMoveAnnouncement } from "@/hooks/use-chess-move-announcement";
import type { Move } from "chess.js";
import type { Arrow as ChessboardArrow } from "react-chessboard";
import { defaultArrowOptions } from "react-chessboard";
import { ChessBoardWrapper, computeChessBoardSize, useChessBoardSize } from "@/components/chess/ChessBoardWrapper";
import { BoardLayoutShell } from "@/components/chess/board-layout-shell";
import {
  FeedbackPanel,
  SidebarTitle,
  SidebarState,
  SidebarStatGrid,
  SidebarStat,
  SidebarDominant,
  SidebarButton,
} from "@/components/chess/board-workspace";
import { ChessMoveHistoryPanel, historyFromPgn } from "@/components/chess/chess-move-history-panel";
import { squareStylesForLastMove } from "@/components/chess/move-highlight-styles";
import { useChessLegalMoves } from "@/hooks/use-chess-legal-moves";

const PUZZLE_ARROW_USER = "rgba(34, 197, 94, 0.95)";
const PUZZLE_ARROW_OPPONENT = "rgba(100, 116, 139, 0.9)";
const PUZZLE_ARROW_WRONG = "rgba(239, 68, 68, 0.95)";

// ─── Types ────────────────────────────────────────────────────────────────────

import type { LibraryPuzzle, PuzzleLevel } from "@/lib/chess-types";
export type { LibraryPuzzle };

type Mode = "home" | "play-lobby" | "play-game" | "puzzles" | "puzzle-solve" | "game-review" | "opening-trainer" | "endgame-trainer" | "puzzle-rush";

export type PuzzleSort = "popular" | "random" | "hardest" | "easiest";

/** Migrate legacy stored sort values (from sessionStorage / older URLs) onto
 *  the current set. "newest" was retired because Lichess puzzle IDs aren't
 *  time-ordered and "rating_*" duplicates "hardest"/"easiest". */
function normalizeSort(raw: string | null | undefined): PuzzleSort {
  switch (raw) {
    case "popular":
    case "random":
    case "hardest":
    case "easiest":
      return raw;
    case "rating_desc":
      return "hardest";
    case "rating_asc":
      return "easiest";
    case "newest":
    default:
      return "popular";
  }
}

/** Snapshot of puzzle list position for "Next puzzle" without losing filters across routes. */
export type LibraryPuzzleNav = {
  level: PuzzleLevel;
  /** Multi-select theme filter — comma-joined for the API. Single-select
   *  pages should pass a 0/1-element array. */
  themes: string[];
  /** Multi-select opening filter (family or variation keys). */
  openings: string[];
  sort: PuzzleSort;
  page: number;
  index: number;
  pageItems: LibraryPuzzle[];
  total: number;
};

const PUZZLE_NAV_STORAGE_KEY = "ken_chess_puzzle_library_nav";
/** Last chess feature used (for home “resume session”). */
const CHESS_LAST_ACTIVITY_KEY = "ken_chess_last_activity";

type ChessHomeActivity =
  | "play-lobby"
  | "puzzles"
  | "puzzle-rush"
  | "opening-trainer"
  | "endgame-trainer";

function mapModeToHomeActivity(mode: Mode): ChessHomeActivity | null {
  switch (mode) {
    case "play-lobby":
    case "play-game":
      return "play-lobby";
    case "puzzles":
    case "puzzle-solve":
      return "puzzles";
    case "puzzle-rush":
      return "puzzle-rush";
    case "opening-trainer":
      return "opening-trainer";
    case "endgame-trainer":
      return "endgame-trainer";
    default:
      return null;
  }
}

function formatChessRelativeTime(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function writePuzzleLibraryNav(nav: LibraryPuzzleNav) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PUZZLE_NAV_STORAGE_KEY, JSON.stringify(nav));
  } catch { /* ignore quota */ }
}

function readPuzzleLibraryNav(): LibraryPuzzleNav | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PUZZLE_NAV_STORAGE_KEY);
    if (!raw) return null;
    // The LibraryPuzzleNav shape evolved from { theme, q } singles to
    // { themes, openings, search } arrays/strings. Migrate the old shape
    // forward so existing session entries don't crash the next-puzzle flow.
    const parsed = JSON.parse(raw) as Partial<LibraryPuzzleNav> & {
      theme?: string;
      q?: string;
    };
    return {
      level: parsed.level ?? "beginner",
      themes: Array.isArray(parsed.themes)
        ? parsed.themes
        : parsed.theme
          ? [parsed.theme]
          : [],
      openings: Array.isArray(parsed.openings) ? parsed.openings : [],
      sort: normalizeSort(parsed.sort ?? null),
      page: parsed.page ?? 1,
      index: parsed.index ?? 0,
      pageItems: parsed.pageItems ?? [],
      total: parsed.total ?? 0,
    };
  } catch {
    return null;
  }
}

function clearPuzzleLibraryNav() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PUZZLE_NAV_STORAGE_KEY);
  } catch { /* ignore */ }
}

export type TimeControl = { label: string; mins: number; inc: number };

type ChatMsg = { id: string; sender: "white" | "black"; text: string; ts: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<PuzzleLevel, string> = {
  beginner:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  intermediate: "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400",
  hard:         "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  expert:       "bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400",
};
const LEVEL_LABELS: Record<PuzzleLevel, string> = {
  beginner: "Beginner", intermediate: "Intermediate", hard: "Hard", expert: "Expert",
};

// ─── Puzzle library card visuals ──────────────────────────────────────────────

/**
 * Tag pill styling for puzzle cards.
 * Default: a single neutral pill — keeps cards quiet even with 3 tags.
 * Exception: anything mate-related stays subtle red so the mate hint stands out.
 */
/** Tag colour by theme group, not by substring. The earlier substring rule
 *  ("any theme containing 'mate' is red") false-matched things like
 *  "mateInOne" + the literal "mate" eyebrow but also drifted onto unrelated
 *  themes once new keys were added. Group-based is unambiguous and stable
 *  as the catalogue grows. */
const TAG_GROUP_COLORS: Record<string, string> = {
  recommended: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  phases:      "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300",
  motifs:      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  advanced:    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300",
  mates:       "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  lengths:     "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  origin:      "bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300",
};
const TAG_NEUTRAL = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

function puzzleTagAccentClasses(
  theme: string,
  themeToGroup?: Map<string, string>,
): string {
  const groupId = themeToGroup?.get(theme);
  if (groupId && TAG_GROUP_COLORS[groupId]) return TAG_GROUP_COLORS[groupId];
  return TAG_NEUTRAL;
}

const PUZZLE_PIECE_GLYPH: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

/**
 * Static FEN preview rendered as a CSS grid — lightweight (no chessboard chunk).
 *
 * Memoized: a typical puzzle library page renders 20 of these (1280 cells), so
 * any parent re-render (filter / search / hover / sort) without memoization would
 * rebuild the entire grid. The component is purely a function of `fen` + `size`.
 */
const PuzzleMiniBoard = React.memo(function PuzzleMiniBoard({
  fen,
  size = 120,
}: {
  fen: string;
  size?: number;
}) {
  const board: (string | null)[][] = [];
  const boardField = fen.split(" ")[0] ?? "";
  for (const row of boardField.split("/")) {
    const r: (string | null)[] = [];
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) r.push(null);
      } else {
        r.push(ch);
      }
    }
    while (r.length < 8) r.push(null);
    board.push(r);
  }
  while (board.length < 8) board.push(Array(8).fill(null));

  const cellPx = size / 8;
  return (
    <div
      className="overflow-hidden rounded shadow-sm ring-1 ring-zinc-900/70 dark:ring-zinc-700"
      style={{ width: size, height: size }}
    >
      <div
        className="grid grid-cols-8 grid-rows-8"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {board.flatMap((row, r) =>
          row.map((piece, f) => {
            const isLight = (r + f) % 2 === 0;
            const isWhite = piece && piece === piece.toUpperCase();
            return (
              <div
                key={`${r}-${f}`}
                style={{
                  backgroundColor: isLight ? "#EEEED2" : "#4a7c3f",
                  fontSize: cellPx * 0.95,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isWhite ? "#fafafa" : "#1a1a1a",
                  textShadow: isWhite
                    ? "0 1px 1px rgba(0,0,0,0.55)"
                    : "0 1px 1px rgba(255,255,255,0.35)",
                }}
              >
                {piece ? PUZZLE_PIECE_GLYPH[piece] ?? "" : ""}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
});

export const TIME_CONTROLS_POPULAR: TimeControl[] = [
  { label: "Bullet 1+0",  mins: 1,  inc: 0 },
  { label: "Blitz 3+2",   mins: 3,  inc: 2 },
  { label: "Blitz 5+0",   mins: 5,  inc: 0 },
  { label: "Rapid 10+0",  mins: 10, inc: 0 },
  { label: "Unlimited",   mins: 0,  inc: 0 },
];

const TIME_CONTROLS_MORE: TimeControl[] = [
  { label: "Bullet 2+1",    mins: 2,  inc: 1 },
  { label: "Blitz 3+0",     mins: 3,  inc: 0 },
  { label: "Rapid 10+5",    mins: 10, inc: 5 },
  { label: "Classical 30+0",mins: 30, inc: 0 },
];

const TIME_CONTROLS = [...TIME_CONTROLS_POPULAR, ...TIME_CONTROLS_MORE];

// ─── Sound ────────────────────────────────────────────────────────────────────

const audioCache = new Map<string, HTMLAudioElement>();
function playSound(type: "move" | "capture" | "check" | "castle" | "notify" | "wrong", muted: boolean) {
  if (muted || typeof window === "undefined") return;
  const cacheKey = type === "wrong" ? "wrong" : type;
  const src = type === "wrong" ? "/sounds/chess/move.mp3" : `/sounds/chess/${type}.mp3`;
  let el = audioCache.get(cacheKey);
  if (!el) {
    el = new Audio(src);
    if (type === "wrong") el.volume = 0.42;
    audioCache.set(cacheKey, el);
  }
  el.currentTime = 0;
  el.play().catch(() => {});
}

// ─── Clock helpers ────────────────────────────────────────────────────────────

function formatClock(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const LIBRARY_PAGE_SIZE = 20;

export function ChessWorkspace({
  initialLibraryPuzzleId,
  initialRoom,
  initialMode,
}: {
  initialLibraryPuzzleId?: string;
  initialRoom?: ChessGame;
  initialMode?: Mode;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [mode, setMode]           = useState<Mode>(() =>
    initialMode
      ? initialMode
      : initialRoom
        ? "play-game"
        : initialLibraryPuzzleId
          ? "puzzle-solve"
          : "home",
  );
  const [game, setGame]           = useState<ChessGame | null>(initialRoom ?? null);
  const [createdGame, setCreatedGame] = useState<ChessGame | null>(null); // waiting in lobby
  const [joinCode, setJoinCode]   = useState("");
  const [joining, setJoining]     = useState(false);
  const [creating, setCreating]   = useState(false);
  const [tc, setTc]               = useState<TimeControl>(TIME_CONTROLS_POPULAR[2]); // Blitz 5+0
  const [color, setColor]         = useState<"white" | "black" | "random">("random");
  const [activePuzzle, setActivePuzzle] = useState<LibraryPuzzle | BuiltInPuzzle | null>(null);
  const [puzzleNav, setPuzzleNav] = useState<LibraryPuzzleNav | null>(null);
  const [puzzleRouteLoading, setPuzzleRouteLoading] = useState(!!initialLibraryPuzzleId);
  const [puzzleRouteError, setPuzzleRouteError] = useState<string | null>(null);
  const [reviewPgn, setReviewPgn]         = useState("");
  const [reviewGameId, setReviewGameId]   = useState<string | undefined>(undefined);
  const [reviewPlayers, setReviewPlayers] = useState<{ white: string; black: string }>({ white: "White", black: "Black" });

  async function handleCreateGame() {
    setCreating(true);
    try {
      const g = await createChessGame();
      // Navigate to the room route — this makes the URL shareable and refresh-safe
      router.push(`/chess/room/${g.roomCode}`);
    } catch { toast.error("Failed to create game"); }
    finally { setCreating(false); }
  }

  function handleEnterGame(g: ChessGame) {
    setGame(g);
    setCreatedGame(null);
    setMode("play-game");
  }

  async function handleJoinGame() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    try {
      // Navigate to room route — the room page handles joining
      router.push(`/chess/room/${code}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Game not found"); }
    finally { setJoining(false); }
  }

  function goHome() {
    if (pathname?.startsWith("/chess/puzzles/") || pathname?.startsWith("/chess/room/")) {
      router.push("/chess");
    }
    setMode("home");
    setGame(null);
    setCreatedGame(null);
    setActivePuzzle(null);
    setPuzzleNav(null);
    clearPuzzleLibraryNav();
  }

  const advanceToNextLibraryPuzzle = useCallback(async () => {
    const nav = readPuzzleLibraryNav();
    if (!nav) {
      toast.error("Open puzzles from the list to chain to the next puzzle.");
      return;
    }

    let newNav: LibraryPuzzleNav;
    let nextId: string;

    if (nav.index + 1 < nav.pageItems.length) {
      const next = nav.pageItems[nav.index + 1]!;
      newNav = { ...nav, index: nav.index + 1 };
      nextId = next.id;
    } else {
      const totalPages = Math.max(1, Math.ceil(nav.total / LIBRARY_PAGE_SIZE));
      const nextPage = nav.page >= totalPages ? 1 : nav.page + 1;
      const offset = (nextPage - 1) * LIBRARY_PAGE_SIZE;
      const params = new URLSearchParams({
        level: nav.level,
        limit: String(LIBRARY_PAGE_SIZE),
        offset: String(offset),
        sort: nav.sort,
      });
      if (nav.themes.length) params.set("themes", nav.themes.join(","));
      if (nav.openings.length) params.set("openings", nav.openings.join(","));

      const res = await authFetch(`/api/chess/puzzles/library?${params}`);
      const data = (await res.json()) as { items: LibraryPuzzle[]; total: number; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not load the next page.");
        return;
      }
      const filtered = data.items.filter((p) => p.level === nav.level);
      if (filtered.length === 0) {
        toast.error("No more puzzles in this filter.");
        return;
      }
      const next = filtered[0]!;
      newNav = { ...nav, page: nextPage, index: 0, pageItems: filtered, total: data.total };
      nextId = next.id;
    }

    writePuzzleLibraryNav(newNav);
    router.replace(`/chess/puzzles/${encodeURIComponent(nextId)}`);
  }, [router]);

  useEffect(() => {
    const act = mapModeToHomeActivity(mode);
    if (!act) return;
    try {
      localStorage.setItem(
        CHESS_LAST_ACTIVITY_KEY,
        JSON.stringify({ mode: act, at: Date.now() }),
      );
    } catch {
      /* ignore quota */
    }
  }, [mode]);

  useEffect(() => {
    if (!initialLibraryPuzzleId) {
      setPuzzleRouteLoading(false);
      setPuzzleRouteError(null);
      return;
    }

    setActivePuzzle(null);
    let cancelled = false;
    setPuzzleRouteLoading(true);
    setPuzzleRouteError(null);

    void (async () => {
      try {
        const res = await authFetch(
          `/api/chess/puzzles/by-id?id=${encodeURIComponent(initialLibraryPuzzleId)}`,
        );
        const data = (await res.json()) as { puzzle?: LibraryPuzzle; error?: string };

        let p: LibraryPuzzle | null = null;

        if (res.ok && data.puzzle) {
          p = data.puzzle;
        } else if (res.status === 404) {
          // Fall back to Lichess so daily puzzles + any Lichess id work even
          // when our local mirror doesn't have the entry.
          p = await fetchLichessPuzzleAsLibraryShape(initialLibraryPuzzleId);
        }

        if (!p) throw new Error(data.error ?? "Puzzle not found");
        if (cancelled) return;

        setActivePuzzle(p);

        const nav = readPuzzleLibraryNav();
        if (nav) {
          if (nav.pageItems[nav.index]?.id === p.id) {
            setPuzzleNav(nav);
          } else {
            const idx = nav.pageItems.findIndex((x) => x.id === p.id);
            if (idx >= 0) setPuzzleNav({ ...nav, index: idx });
            else setPuzzleNav(null);
          }
        } else {
          setPuzzleNav(null);
        }
        setMode("puzzle-solve");
      } catch (e) {
        if (!cancelled) {
          setPuzzleRouteError(e instanceof Error ? e.message : "Failed to load puzzle");
          setActivePuzzle(null);
          setPuzzleNav(null);
        }
      } finally {
        if (!cancelled) setPuzzleRouteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialLibraryPuzzleId]);

  function handleReview(pgn: string, white: string, black: string, gameId?: string) {
    setReviewPgn(pgn);
    setReviewGameId(gameId);
    setReviewPlayers({ white, black });
    setMode("game-review");
  }

  const headerTitle = {
    home:               "Chess",
    "play-lobby":       "Play with Friend",
    "play-game":        `Room: ${game?.roomCode ?? ""}`,
    puzzles:            "Puzzles",
    "puzzle-solve":     activePuzzle ? ("title" in activePuzzle ? activePuzzle.title : `Puzzle • ${activePuzzle.rating}`) : "Puzzle",
    "game-review":      "Game Review",
    "opening-trainer":  "Opening Trainer",
    "endgame-trainer":  "Endgame Trainer",
    "puzzle-rush":      "Puzzle Rush",
  }[mode];

  const playGameActive = mode === "play-game" && game;
  const puzzleSolveFill =
    mode === "puzzle-solve" &&
    Boolean(activePuzzle) &&
    (!initialLibraryPuzzleId || (!puzzleRouteLoading && !puzzleRouteError));

  // All board-showing modes use overflow-hidden (they handle scroll internally).
  // The home view is also self-contained — it sizes itself to fit the viewport.
  const boardModeActive =
    playGameActive ||
    puzzleSolveFill ||
    mode === "home" ||
    mode === "opening-trainer" ||
    mode === "endgame-trainer" ||
    mode === "puzzle-rush";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={
          boardModeActive
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain"
        }
      >
        {mode === "home" && (
          <HomeView
            onPlay={() => router.push("/chess/play")}
            // Navigate to /chess/puzzles instead of just flipping internal
            // mode state — keeps the URL meaningful so deep-links and the
            // browser back button work as the user expects.
            onPuzzles={() => router.push("/chess/puzzles")}
            onOpenings={() => router.push("/chess/openings")}
            onEndgames={() => setMode("endgame-trainer")}
            onRush={() => setMode("puzzle-rush")}
          />
        )}
        {mode === "play-lobby" && (
          <PlayLobby
            joinCode={joinCode} setJoinCode={setJoinCode}
            creating={creating} joining={joining}
            tc={tc} setTc={setTc}
            color={color} setColor={setColor}
            createdGame={createdGame}
            onCreate={handleCreateGame}
            onEnterGame={handleEnterGame}
            onJoin={handleJoinGame}
            onBack={goHome}
          />
        )}
        {mode === "play-game" && game && user && (
          <PlayGame
            initialGame={game} userId={user.id} userName={user.username}
            tc={tc} onBack={goHome}
            onReview={(pgn, white, black, gameId) => handleReview(pgn, white, black, gameId)}
          />
        )}
        {mode === "game-review" && reviewPgn && (
          <GameReview
            pgn={reviewPgn}
            gameId={reviewGameId}
            whitePlayer={reviewPlayers.white}
            blackPlayer={reviewPlayers.black}
            onBack={() => setMode("play-game")}
          />
        )}
        {mode === "puzzles" && (
          <PuzzleLibrary
            // On /chess/puzzles the back arrow returns to the chess hub via
            // URL; on the legacy in-page mount (e.g. mobile flow that hasn't
            // been migrated yet) it falls back to the internal goHome.
            onBack={() => {
              if (pathname === "/chess/puzzles") {
                router.push("/chess");
              } else {
                goHome();
              }
            }}
            onSolve={(p, nav) => {
              writePuzzleLibraryNav(nav);
              router.push(`/chess/puzzles/${encodeURIComponent(p.id)}`);
            }}
          />
        )}
        {mode === "puzzle-solve" && initialLibraryPuzzleId && puzzleRouteLoading && (
          <ChessSectionSkeleton label="Loading puzzle…" />
        )}
        {mode === "puzzle-solve" && initialLibraryPuzzleId && puzzleRouteError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
            <p className="text-center text-sm font-medium text-red-600 dark:text-red-400">{puzzleRouteError}</p>
            <button
              type="button"
              onClick={() => router.push("/chess")}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Back to Chess
            </button>
          </div>
        )}
        {mode === "puzzle-solve" && activePuzzle && (!initialLibraryPuzzleId || (!puzzleRouteLoading && !puzzleRouteError)) && (
          <PuzzleSolve
            key={"id" in activePuzzle ? activePuzzle.id : "builtin"}
            puzzle={activePuzzle}
            onBack={() => {
              clearPuzzleLibraryNav();
              setPuzzleNav(null);
              setActivePuzzle(null);
              router.push("/chess");
            }}
            onNextPuzzle={puzzleNav ? advanceToNextLibraryPuzzle : undefined}
          />
        )}
        {mode === "opening-trainer" && <OpeningTrainer onBack={goHome} />}
        {mode === "endgame-trainer" && <EndgameTrainer onBack={goHome} />}
        {mode === "puzzle-rush" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PuzzleRush onBack={goHome} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────

/** Tailwind-safe accent maps (dynamic `bg-${color}-100` classes are purged and never applied). */
const HOME_ICON_SHELL: Record<
  "amber" | "orange" | "emerald" | "rose" | "teal" | "sky",
  { shell: string; icon: string }
> = {
  amber: {
    shell: "bg-amber-100 dark:bg-amber-950/45",
    icon: "text-amber-700 dark:text-amber-400",
  },
  orange: {
    shell: "bg-orange-100 dark:bg-orange-950/45",
    icon: "text-orange-700 dark:text-orange-400",
  },
  emerald: {
    shell: "bg-emerald-100 dark:bg-emerald-950/45",
    icon: "text-emerald-700 dark:text-emerald-400",
  },
  rose: {
    shell: "bg-rose-100 dark:bg-rose-950/45",
    icon: "text-rose-700 dark:text-rose-400",
  },
  teal: {
    shell: "bg-teal-100 dark:bg-teal-950/45",
    icon: "text-teal-700 dark:text-teal-400",
  },
  sky: {
    shell: "bg-zinc-100 dark:bg-zinc-950/45",
    icon: "text-zinc-700 dark:text-zinc-400",
  },
};

function HomeSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
      {children}
    </p>
  );
}

// ─── Mini board (SVG, FEN-driven) ────────────────────────────────────────────

const MINI_BOARD_GLYPHS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function MiniBoard({ fen, size = 120 }: { fen: string; size?: number }) {
  const positionPart = fen.split(" ")[0] ?? "";
  const ranks = positionPart.split("/");
  const cell = size / 8;
  const elements: React.ReactNode[] = [];

  for (let r = 0; r < 8; r++) {
    let f = 0;
    const rankStr = ranks[r] ?? "";
    for (const c of rankStr) {
      if (/\d/.test(c)) {
        const skip = parseInt(c, 10);
        for (let i = 0; i < skip; i++) {
          const dark = (r + f) % 2 === 1;
          elements.push(
            <rect
              key={`b-${r}-${f}`}
              x={f * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill={dark ? "#b58863" : "#f0d9b5"}
            />,
          );
          f++;
        }
      } else {
        const dark = (r + f) % 2 === 1;
        elements.push(
          <rect
            key={`b-${r}-${f}`}
            x={f * cell}
            y={r * cell}
            width={cell}
            height={cell}
            fill={dark ? "#b58863" : "#f0d9b5"}
          />,
        );
        elements.push(
          <text
            key={`p-${r}-${f}`}
            x={f * cell + cell / 2}
            y={r * cell + cell * 0.78}
            fontSize={cell * 0.92}
            textAnchor="middle"
            fill={c === c.toUpperCase() ? "#fafafa" : "#1a1a1a"}
            stroke={c === c.toUpperCase() ? "#1a1a1a" : "transparent"}
            strokeWidth={0.6}
            style={{
              fontFamily:
                '"Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", system-ui, sans-serif',
            }}
          >
            {MINI_BOARD_GLYPHS[c] ?? ""}
          </text>,
        );
        f++;
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rounded-md ring-1 ring-zinc-300/60 dark:ring-zinc-700/60"
      role="img"
      aria-hidden
    >
      {elements}
    </svg>
  );
}

// ─── Lichess daily puzzle ────────────────────────────────────────────────────
//
// https://lichess.org/api/puzzle/daily — public, CORS-enabled, refreshes
// once per UTC day. We cache the response in localStorage keyed by YYYY-MM-DD
// so navigating back to /chess does not refetch.

interface LichessDailyPuzzle {
  puzzle: {
    id: string;
    rating: number;
    plays: number;
    initialPly: number;
    solution: string[];
    themes: string[];
  };
  game: {
    id: string;
    pgn: string;
    perf: { key: string; name: string };
    rated: boolean;
    players: { name: string; color: string; rating?: number }[];
    clock?: string;
  };
}

const LICHESS_DAILY_CACHE_KEY = "lichess-daily-puzzle-v1";

function todayDateStamp(): string {
  const d = new Date();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

function readDailyPuzzleCache(): LichessDailyPuzzle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LICHESS_DAILY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date: string; payload: LichessDailyPuzzle };
    if (parsed.date !== todayDateStamp()) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeDailyPuzzleCache(payload: LichessDailyPuzzle): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LICHESS_DAILY_CACHE_KEY,
      JSON.stringify({ date: todayDateStamp(), payload }),
    );
  } catch {
    // ignore quota errors
  }
}

/** Replay the PGN up to `initialPly` and return the resulting FEN. */
function fenAtPly(pgn: string, initialPly: number): string {
  const board = new Chess();
  try {
    board.loadPgn(pgn, { strict: false });
  } catch {
    return new Chess().fen();
  }
  const history = board.history({ verbose: true });
  const replay = new Chess();
  for (let i = 0; i < Math.min(initialPly, history.length); i++) {
    const m = history[i];
    replay.move({ from: m.from, to: m.to, promotion: m.promotion });
  }
  return replay.fen();
}

/** Map Lichess rating to our four library levels. */
function ratingToPuzzleLevel(rating: number): PuzzleLevel {
  if (rating < 1500) return "beginner";
  if (rating < 1800) return "intermediate";
  if (rating < 2100) return "hard";
  return "expert";
}

/**
 * Fetch a Lichess puzzle by id and shape it as a LibraryPuzzle so the existing
 * PuzzleSolve flow can render it. The Lichess API:
 *   GET https://lichess.org/api/puzzle/{id}
 * returns a payload where `puzzle.solution[0]` is the user's first move and
 * the position at `puzzle.initialPly` is the puzzle position. We synthesize
 * a `LibraryPuzzle` with `moves[0]` as a NO-OP-shaped sentinel so the solver
 * starts at the synthesized FEN with the user to move.
 *
 * IMPORTANT: our LibraryPuzzle convention has `moves[0]` as the opponent's
 * setup move (auto-played) and `moves[1..]` as the alternating user/opponent
 * solution. The Lichess API response does NOT include a setup move — the
 * starting FEN already accounts for it. To match the LibraryPuzzle shape we
 * pull the move played at `initialPly - 1` from the original PGN and use
 * that as `moves[0]`, with the FEN computed at `initialPly - 1` (one ply
 * earlier, before the setup is played).
 */
async function fetchLichessPuzzleAsLibraryShape(
  id: string,
): Promise<LibraryPuzzle | null> {
  try {
    const res = await fetch(
      `https://lichess.org/api/puzzle/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as LichessDailyPuzzle;

    const initialPly = data.puzzle.initialPly;
    if (typeof initialPly !== "number" || initialPly < 1) return null;

    // FEN at initialPly - 1 (one ply BEFORE the puzzle position)
    const setupBoard = new Chess();
    setupBoard.loadPgn(data.game.pgn, { strict: false });
    const history = setupBoard.history({ verbose: true });
    if (initialPly - 1 >= history.length) return null;

    const replay = new Chess();
    for (let i = 0; i < initialPly - 1; i++) {
      const m = history[i];
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    }
    const fenBeforeSetup = replay.fen();

    const setup = history[initialPly - 1];
    const setupUci = `${setup.from}${setup.to}${setup.promotion ?? ""}`;

    return {
      id: data.puzzle.id,
      fen: fenBeforeSetup,
      moves: [setupUci, ...data.puzzle.solution],
      rating: data.puzzle.rating,
      themes: data.puzzle.themes ?? [],
      level: ratingToPuzzleLevel(data.puzzle.rating),
    };
  } catch {
    return null;
  }
}

const HOME_LAST_ACTIVITY_LABELS: Record<ChessHomeActivity, string> = {
  "play-lobby": "Play with Friend",
  puzzles: "Puzzle library",
  "puzzle-rush": "Puzzle Rush",
  "opening-trainer": "Opening Trainer",
  "endgame-trainer": "Endgame Trainer",
};

function HomeView({
  onPlay,
  onPuzzles,
  onOpenings,
  onEndgames,
  onRush,
}: {
  onPlay: () => void;
  onPuzzles: () => void;
  onOpenings: () => void;
  onEndgames: () => void;
  onRush: () => void;
}) {
  const router = useRouter();
  const [resumePuzzleId, setResumePuzzleId] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState<{ mode: ChessHomeActivity; at: number } | null>(
    null,
  );

  useEffect(() => {
    const nav = readPuzzleLibraryNav();
    const id = nav?.pageItems[nav.index]?.id;
    setResumePuzzleId(id ?? null);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHESS_LAST_ACTIVITY_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { mode?: string; at?: number };
      if (
        p.at == null ||
        typeof p.at !== "number" ||
        !p.mode ||
        !(p.mode in HOME_LAST_ACTIVITY_LABELS)
      ) {
        return;
      }
      setLastActivity({ mode: p.mode as ChessHomeActivity, at: p.at });
    } catch {
      setLastActivity(null);
    }
  }, []);

  function resumeLastSession() {
    if (!lastActivity) return;
    switch (lastActivity.mode) {
      case "play-lobby":
        onPlay();
        break;
      case "puzzles":
        onPuzzles();
        break;
      case "puzzle-rush":
        onRush();
        break;
      case "opening-trainer":
        onOpenings();
        break;
      case "endgame-trainer":
        onEndgames();
        break;
    }
  }

  // Endgame Trainer / Opening Trainer / Play with Friend were removed —
  // they're "nice to have" affordances I never reach for. Keeping only the
  // one I actually use after analysing a game: train my own mistakes.
  const secondary = [
    {
      label: "From my games",
      sub: "Train mistakes from your analysed games",
      icon: Microscope,
      accent: "emerald" as const,
      onClick: () => router.push("/chess/games"),
    },
  ];

  /** Avoid duplicating “puzzles” when we already show Continue puzzle. */
  const showResumeSession = Boolean(
    lastActivity && !(resumePuzzleId && lastActivity.mode === "puzzles"),
  );

  // Hero pickup — only render if there's something concrete to resume.
  const hero =
    resumePuzzleId
      ? {
          title: "Continue your puzzle",
          subtitle: "Pick up where you stopped",
          ctaLabel: "Continue",
          onClick: () =>
            router.push(`/chess/puzzles/${encodeURIComponent(resumePuzzleId)}`),
          when: null as string | null,
        }
      : showResumeSession && lastActivity
        ? {
            title: HOME_LAST_ACTIVITY_LABELS[lastActivity.mode],
            subtitle: "Resume last session",
            ctaLabel: "Continue",
            onClick: resumeLastSession,
            when: formatChessRelativeTime(lastActivity.at),
          }
        : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full px-4 pb-8 pt-2 sm:px-6" style={{ maxWidth: 1280 }}>
        <div className="flex flex-col gap-8">
          {/* ─── Hero ────────────────────────────────────────────────── */}
          {hero ? (
            <section>
              <button
                type="button"
                onClick={hero.onClick}
                className="group flex w-full items-center gap-4 rounded-2xl border border-zinc-200 border-l-2 border-l-emerald-500 bg-gradient-to-r from-emerald-50/80 via-white to-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:border-l-emerald-500 dark:from-emerald-950/25 dark:via-zinc-900 dark:to-zinc-900 sm:p-5"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-500/30 sm:h-16 sm:w-16">
                  <Play className="h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                    {hero.subtitle}
                  </p>
                  <h2 className="mt-1 truncate text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl">
                    {hero.title}
                  </h2>
                  {hero.when ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{hero.when}</p>
                  ) : null}
                </div>
                <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-emerald-700 sm:inline-flex">
                  {hero.ctaLabel}
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-emerald-500 transition group-hover:translate-x-0.5 sm:hidden" aria-hidden />
              </button>
            </section>
          ) : null}

          {/* ─── Main ────────────────────────────────────────────────── */}
          <section>
            <HomeSectionLabel>Main</HomeSectionLabel>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <MainTile
                title="Puzzles"
                subtitle="Lichess library — levels, themes."
                cta="Open library"
                accent="amber"
                icon={BookOpen}
                onClick={onPuzzles}
              />
              <MainTile
                title="Puzzle Rush"
                subtitle="Timed · 3 lives or relaxed."
                cta="Start run"
                accent="orange"
                icon={Zap}
                onClick={onRush}
              />
              <MainTile
                title="Game Analysis"
                subtitle="PGN → Stockfish review."
                cta="Analyse PGN"
                accent="teal"
                icon={Microscope}
                href="/chess/analysis"
              />
            </div>
          </section>

          {/* ─── Training ─────────────────────────────────────────────────
               Section was "Play & Study" with 4 cards (Play / Openings /
               Endgames / From-my-games). Trimmed to just the one card I
               actually use post-analysis; renamed accordingly. Single
               card is left-aligned at sm:max-w-md so it doesn't stretch
               edge-to-edge on wide screens. */}
          <section>
            <HomeSectionLabel>Training</HomeSectionLabel>
            <ul className="grid grid-cols-1 gap-6 sm:max-w-md">
              {secondary.map(({ label, sub, icon: Icon, accent, onClick }) => {
                const shell = HOME_ICON_SHELL[accent];
                return (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={onClick}
                      className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200/90 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${shell.shell}`}>
                        <Icon className={`h-4 w-4 ${shell.icon}`} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {label}
                        </p>
                        <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                          {sub}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 dark:group-hover:text-zinc-300" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ─── Daily puzzle (Lichess) ──────────────────────────────── */}
          <DailyPuzzleSection />
        </div>
      </div>
    </div>
  );
}

// ─── Main tile (used in the 3-up Main row) ───────────────────────────────────

const MAIN_TILE_ACCENTS: Record<
  "amber" | "orange" | "teal",
  { borderL: string; gradient: string; ctaText: string; pill: string }
> = {
  amber: {
    borderL: "border-l-amber-500 dark:border-l-amber-500",
    gradient:
      "from-amber-50/80 via-white to-white dark:from-amber-950/25 dark:via-zinc-900 dark:to-zinc-900",
    ctaText: "text-amber-800 dark:text-amber-300",
    pill: "bg-amber-100 text-amber-700 dark:bg-amber-950/45 dark:text-amber-400",
  },
  orange: {
    borderL: "border-l-orange-500 dark:border-l-orange-500",
    gradient:
      "from-orange-50/80 via-white to-white dark:from-orange-950/25 dark:via-zinc-900 dark:to-zinc-900",
    ctaText: "text-orange-800 dark:text-orange-300",
    pill: "bg-orange-100 text-orange-700 dark:bg-orange-950/45 dark:text-orange-400",
  },
  teal: {
    borderL: "border-l-teal-500 dark:border-l-teal-500",
    gradient:
      "from-teal-50/80 via-white to-white dark:from-teal-950/25 dark:via-zinc-900 dark:to-zinc-900",
    ctaText: "text-teal-800 dark:text-teal-300",
    pill: "bg-teal-100 text-teal-700 dark:bg-teal-950/45 dark:text-teal-400",
  },
};

function MainTile({
  title,
  subtitle,
  cta,
  accent,
  icon: Icon,
  onClick,
  href,
}: {
  title: string;
  subtitle: string;
  cta: string;
  accent: "amber" | "orange" | "teal";
  icon: React.ElementType;
  onClick?: () => void;
  href?: string;
}) {
  const a = MAIN_TILE_ACCENTS[accent];
  const className = `group flex h-full flex-col rounded-xl border border-zinc-200 border-l-2 ${a.borderL} bg-gradient-to-br ${a.gradient} p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-700`;

  const inner = (
    <>
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.pill}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      </div>
      <span className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${a.ctaText}`}>
        {cta}
        <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
      </span>
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

// ─── Daily puzzle (Lichess) ──────────────────────────────────────────────────

interface DailyPuzzleViewModel {
  id: string;
  fen: string;
  rating: number;
  themes: string[];
  initialPly: number;
}

function DailyPuzzleSection() {
  const [data, setData] = useState<DailyPuzzleViewModel | null | "error">(
    () => {
      const cached = readDailyPuzzleCache();
      return cached ? buildDailyPuzzleViewModel(cached) : null;
    },
  );

  useEffect(() => {
    if (data) return; // cache already supplied

    let cancelled = false;
    fetch("https://lichess.org/api/puzzle/daily", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`lichess daily ${res.status}`);
        return (await res.json()) as LichessDailyPuzzle;
      })
      .then((payload) => {
        if (cancelled) return;
        writeDailyPuzzleCache(payload);
        setData(buildDailyPuzzleViewModel(payload));
      })
      .catch(() => {
        if (!cancelled) setData("error");
      });

    return () => {
      cancelled = true;
    };
  }, [data]);

  if (data === "error") return null; // hide entirely on fetch failure

  return (
    <section>
      <HomeSectionLabel>Daily puzzle</HomeSectionLabel>
      {data === null ? (
        <DailyPuzzleSkeleton />
      ) : (
        <Link
          href={dailyPuzzleHref(data)}
          className="group flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 sm:flex-row sm:items-center sm:p-5"
        >
          <div className="shrink-0 self-center sm:self-start">
            <MiniBoard fen={data.fen} size={160} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Today · Lichess
              </p>
            </div>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Puzzle of the day
            </h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Rating <span className="font-mono tabular-nums">{data.rating}</span>
            </p>
            {data.themes.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {data.themes.slice(0, 5).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Solve
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </Link>
      )}
    </section>
  );
}

function DailyPuzzleSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:p-5">
      <div className="h-40 w-40 shrink-0 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-5 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-3 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="flex gap-1 pt-1">
          <div className="h-4 w-12 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-14 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

function buildDailyPuzzleViewModel(p: LichessDailyPuzzle): DailyPuzzleViewModel {
  return {
    id: p.puzzle.id,
    fen: fenAtPly(p.game.pgn, p.puzzle.initialPly),
    rating: p.puzzle.rating,
    themes: p.puzzle.themes ?? [],
    initialPly: p.puzzle.initialPly,
  };
}

/** Daily puzzle deep-link — open the actual Lichess puzzle by id. The puzzle
 *  viewer falls back to the Lichess API when the id isn't in our local mirror. */
function dailyPuzzleHref(d: DailyPuzzleViewModel): string {
  return `/chess/puzzles/${encodeURIComponent(d.id)}`;
}

// ─── Play Lobby ───────────────────────────────────────────────────────────────

export function PlayLobby({ joinCode, setJoinCode, creating, joining, tc, setTc, color, setColor, createdGame, onCreate, onEnterGame, onJoin, onBack }: {
  joinCode: string; setJoinCode: (v: string) => void;
  creating: boolean; joining: boolean;
  tc: TimeControl; setTc: (t: TimeControl) => void;
  color: "white" | "black" | "random"; setColor: (c: "white" | "black" | "random") => void;
  createdGame: ChessGame | null;
  onCreate: () => void;
  onEnterGame: (g: ChessGame) => void;
  onJoin: () => void;
  onBack?: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [copied, setCopied]     = useState(false);

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const visibleTCs = showMore ? TIME_CONTROLS : TIME_CONTROLS_POPULAR;

  const COLOR_OPTIONS: { value: "white" | "black" | "random"; label: string; icon: string }[] = [
    { value: "white",  label: "White",  icon: "♔" },
    { value: "random", label: "Random", icon: "🎲" },
    { value: "black",  label: "Black",  icon: "♚" },
  ];

  const joinReady = joinCode.length >= 4 && !joining;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-y-auto bg-zinc-100 dark:bg-[#1e1e1e]">
      <div className="my-auto flex w-full max-w-[640px] flex-col gap-4 px-6 py-8">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}

        <div
          className="w-full rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          style={{ padding: 32 }}
        >
          {/* Decorative header — same anatomy as Puzzle Rush setup */}
          <div className="text-center">
            <p className="text-4xl" aria-hidden>♟</p>
            <h2 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Play with Friend</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Create a private room and share the code with a friend
            </p>
          </div>

          {/* ── Time control ── */}
          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Time Control</p>
            <div className="flex flex-wrap gap-2">
              {visibleTCs.map((t) => {
                const selected = tc.label === t.label;
                const disabled = !!createdGame;
                return (
                  <button
                    key={t.label}
                    onClick={() => { if (!disabled) setTc(t); }}
                    disabled={disabled && !selected}
                    style={
                      selected
                        ? { backgroundColor: "#769656", borderColor: "#769656" }
                        : undefined
                    }
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? "text-white"
                        : disabled
                          ? "border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-600"
                          : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
              {!createdGame && (
                <button
                  type="button"
                  onClick={() => setShowMore((s) => !s)}
                  className="rounded-xl border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  {showMore ? "Less" : "More…"}
                </button>
              )}
            </div>
          </div>

          {/* ── Main action area ── */}
          {createdGame ? (
            <div className="mt-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Room created</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Share this code with your friend, then enter when ready.</p>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
                <span className="font-mono text-2xl font-bold tracking-[0.2em] text-zinc-900 dark:text-zinc-100">
                  {createdGame.roomCode}
                </span>
                <button onClick={() => copyCode(createdGame.roomCode)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700">
                  {copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
              </div>
              <button
                onClick={() => onEnterGame(createdGame)}
                style={{ backgroundColor: "#769656" }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-95"
              >
                <Swords className="h-4 w-4" /> Enter Game
              </button>
            </div>
          ) : (
            <>
              <div className="mt-5 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Play As</p>
                <div className="grid grid-cols-3 gap-2">
                  {COLOR_OPTIONS.map(({ value, label, icon }) => {
                    const selected = color === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setColor(value)}
                        style={
                          selected
                            ? { backgroundColor: "#769656", borderColor: "#769656" }
                            : undefined
                        }
                        className={`flex flex-col items-center rounded-xl border py-3 text-xs font-semibold transition ${
                          selected
                            ? "text-white"
                            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span className="mb-1 text-lg">{icon}</span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={onCreate}
                disabled={creating}
                style={{ backgroundColor: "#769656" }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:brightness-90"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                Create Room
              </button>
            </>
          )}

          {/* ── Join — divider + compact section ── */}
          {!createdGame && (
            <>
              <div className="mt-5 mb-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">or join</span>
                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && onJoin()}
                  placeholder="Room code"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-mono text-sm tracking-widest placeholder:font-sans placeholder:text-xs placeholder:tracking-normal dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  maxLength={6}
                />
                <button
                  onClick={onJoin}
                  disabled={!joinReady}
                  style={
                    joinReady
                      ? { backgroundColor: "#769656" }
                      : undefined
                  }
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    joinReady
                      ? "text-white shadow-sm hover:brightness-95"
                      : "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
                  }`}
                >
                  {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                  Join
                </button>
              </div>
            </>
          )}

          {/* Tip */}
          <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
            Tip: Voice chat is optional — invite a friend over any chat app.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Clock Component ──────────────────────────────────────────────────────────

function Clock({ ms, active, low, compact }: { ms: number; active: boolean; low: boolean; compact?: boolean }) {
  const [display, setDisplay] = useState(ms);
  const ref = useRef(ms);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { ref.current = ms; setDisplay(ms); }, [ms]);

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!active || ms <= 0) return;
    const start = Date.now();
    const startMs = ref.current;
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, startMs - elapsed);
      setDisplay(remaining);
      if (remaining <= 0 && tickRef.current) clearInterval(tickRef.current);
    }, 100);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [active, ms]);

  const urgent = display <= 10000;
  const box = compact
    ? "rounded-lg px-2.5 py-1 font-mono text-base font-bold tabular-nums min-w-[3.25rem] text-center"
    : "rounded-xl px-5 py-3 font-mono text-3xl font-bold tabular-nums";
  return (
    <div className={`flex shrink-0 items-center justify-center transition-colors ${box} ${
      active
        ? urgent ? "bg-red-500 text-white" : low ? "bg-amber-400 text-white" : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
    }`}>
      {ms === 0 ? "∞" : formatClock(display)}
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  roomCode,
  myColor,
  expanded,
  onToggle,
}: {
  roomCode: string;
  myColor: "white" | "black" | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [msgs, setMsgs]   = useState<ChatMsg[]>([]);
  const [text, setText]   = useState("");
  const bottomRef         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ch = supabase.channel(`chess-chat:${roomCode}`)
      .on("broadcast", { event: "msg" }, ({ payload }) => {
        setMsgs((prev) => [...prev, payload as ChatMsg]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomCode]);

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, expanded]);

  function send() {
    const t = text.trim();
    if (!t || !myColor) return;
    const msg: ChatMsg = { id: Date.now().toString(), sender: myColor, text: t, ts: Date.now() };
    supabase.channel(`chess-chat:${roomCode}`).send({ type: "broadcast", event: "msg", payload: msg });
    setMsgs((prev) => [...prev, msg]);
    setText("");
  }

  const recent = msgs.slice(-5);

  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 border-b border-zinc-100 px-2.5 py-1.5 text-left dark:border-zinc-800"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
          <MessageSquare className="h-3 w-3 shrink-0" />
          Chat
          {msgs.length > 0 && <span className="font-normal text-zinc-400">({msgs.length})</span>}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <>
          <div className="max-h-28 space-y-1 overflow-y-auto px-2.5 py-2">
            {recent.length === 0 && (
              <p className="text-center text-[11px] text-zinc-400">No messages yet.</p>
            )}
            {recent.map((m) => (
              <div key={m.id} className={`flex ${m.sender === myColor ? "justify-end" : "justify-start"}`}>
                <span className={`max-w-[85%] rounded-lg px-2 py-0.5 text-[11px] leading-snug ${
                  m.sender === myColor
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                }`}>{m.text}</span>
              </div>
            ))}
            <div ref={bottomRef} className="h-px" aria-hidden />
          </div>
          <div className="flex gap-1 border-t border-zinc-100 p-1.5 dark:border-zinc-800">
            <input
              value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message…"
              className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
            <button type="button" onClick={send} className="shrink-0 rounded-md bg-zinc-900 p-1.5 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
              <Send className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Play Game ────────────────────────────────────────────────────────────────

function PlayGame({ initialGame, userId, userName, tc, onBack, onReview }: {
  initialGame: ChessGame; userId: string; userName: string; tc: TimeControl;
  onBack: () => void;
  onReview: (pgn: string, white: string, black: string, gameId: string) => void;
}) {
  const [gameState, setGameState] = useState<ChessGame>(initialGame);
  const [chess]    = useState(() => new Chess(initialGame.fen));
  const [fen, setFen]               = useState(initialGame.fen);
  const [lastMove, setLastMove]     = useState<[string, string] | null>(null);
  const [lastMoveBy, setLastMoveBy] = useState<"self" | "opponent" | null>(null);
  const [status, setStatus]         = useState("");
  const [copied, setCopied]         = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [muted, setMuted]           = useState(false);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const [drawOffer, setDrawOffer]   = useState<"sent" | "received" | null>(null);
  const [rematch, setRematch]       = useState<"sent" | "received" | null>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // ── Waiting room: measure the board height in pixels and apply it as the
  //    fixed height of the left panel so they line up perfectly. CSS flex
  //    height matching was unreliable across the resize observers the board
  //    component does internally; a JS measurement is more deterministic.
  const waitingBoardRef = useRef<HTMLDivElement>(null);
  const [waitingPanelHeight, setWaitingPanelHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = waitingBoardRef.current;
    if (!el) return;
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setWaitingPanelHeight(h);
    };
    sync();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(sync);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [gameState.status]);

  const { requestJoin, connecting: voiceConnecting, error: voiceError, session: voiceSession } = useMeetCall();
  const livekitConfigured = Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL);
  const voiceRoom         = gameState.roomCode;
  const voiceConnected    = voiceSession?.displayName === voiceRoom;
  const voiceErrRef       = useRef<string | null>(null);

  const startTimeRef = useRef<number | null>(null);
  const { chip: moveAnnounceChip, announce: announceMove } = useChessMoveAnnouncement();
  const prevPgnMoveCountRef = useRef(0);

  useEffect(() => {
    const c = new Chess();
    try {
      c.loadPgn(initialGame.pgn ?? "");
    } catch {
      /* noop */
    }
    prevPgnMoveCountRef.current = c.history().length;
  }, [initialGame.roomCode, initialGame.pgn]);

  useEffect(() => {
    const c = new Chess();
    try {
      c.loadPgn(initialGame.pgn ?? "");
    } catch {
      setLastMove(null);
      setLastMoveBy(null);
      return;
    }
    const hist = c.history({ verbose: true }) as Move[];
    if (hist.length === 0) {
      setLastMove(null);
      setLastMoveBy(null);
      return;
    }
    const last = hist[hist.length - 1];
    setLastMove([last.from, last.to]);
    const imWhite = initialGame.whiteUserId === userId;
    const imBlack = initialGame.blackUserId === userId;
    if (!imWhite && !imBlack) {
      setLastMoveBy(null);
      return;
    }
    const selfMoved = imWhite ? last.color === "w" : last.color === "b";
    setLastMoveBy(selfMoved ? "self" : "opponent");
  }, [initialGame.pgn, initialGame.roomCode, userId, initialGame.whiteUserId, initialGame.blackUserId]);

  const boardSize = useChessBoardSize();
  const [sidePanelMaxH, setSidePanelMaxH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const PLAYER_ROW = 40;
    const BOARD_GAPS = 18;
    const ANNOUNCE_RESERVE = 48;
    const mqMd = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      const s = computeChessBoardSize();
      setSidePanelMaxH(mqMd.matches && s > 0 ? s + PLAYER_ROW * 2 + BOARD_GAPS + ANNOUNCE_RESERVE : undefined);
    };
    apply();
    mqMd.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      mqMd.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
    };
  }, []);

  // Timers — unlimited = 0 means ∞; prefer server values if available (refresh-safe)
  const initMs = tc.mins * 60 * 1000;
  const [whiteMs, setWhiteMs] = useState(initialGame.whiteTimeMs ?? initMs);
  const [blackMs, setBlackMs] = useState(initialGame.blackTimeMs ?? initMs);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(Date.now());
  const chessRef = useRef(chess);
  chessRef.current = chess;

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const isWhite   = gameState.whiteUserId === userId;
  const isBlack   = gameState.blackUserId === userId;
  const myColor   = isWhite ? "white" : isBlack ? "black" : null;
  const isMyTurn  = myColor === (gameState.turn === "w" ? "white" : "black");
  const isWaiting = gameState.status === "waiting";
  const isOver    = ["finished", "resigned", "draw", "timeout"].includes(gameState.status);

  // ── Timer tick ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isOver || isWaiting || initMs === 0 || gameState.status !== "active") return;

    lastTickRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      if (gameState.turn === "w") {
        setWhiteMs((prev) => {
          const next = Math.max(0, prev - delta);
          if (next <= 0) handleTimeout("white");
          return next;
        });
      } else {
        setBlackMs((prev) => {
          const next = Math.max(0, prev - delta);
          if (next <= 0) handleTimeout("black");
          return next;
        });
      }
    }, 200);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.turn, gameState.status, isOver, isWaiting]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`chess:${gameState.roomCode}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "chess_games",
        filter: `room_code=eq.${gameState.roomCode}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const prevSnap = gameStateRef.current;
        const nextPgn = String(row.pgn ?? prevSnap.pgn);

        setGameState((prev) => ({
          ...prev,
          fen:          String(row.fen ?? prev.fen),
          pgn:          nextPgn,
          turn:         (row.turn ?? prev.turn) as "w" | "b",
          status:       (row.status ?? prev.status) as ChessGame["status"],
          winner:       (row.winner ?? null) as ChessGame["winner"],
          whiteUserId:  row.white_user_id ? String(row.white_user_id) : prev.whiteUserId,
          blackUserId:  row.black_user_id ? String(row.black_user_id) : prev.blackUserId,
          updatedAt:    String(row.updated_at ?? prev.updatedAt),
        }));

        // Sync clocks from Realtime
        if (row.white_time_ms != null) setWhiteMs(Number(row.white_time_ms));
        if (row.black_time_ms != null) setBlackMs(Number(row.black_time_ms));

        if (typeof row.fen === "string") {
          const newChess = new Chess();
          try {
            newChess.loadPgn(nextPgn);
          } catch {
            /* noop */
          }
          const hist = newChess.history({ verbose: true }) as Move[];
          const len = hist.length;
          if (len < prevPgnMoveCountRef.current) {
            prevPgnMoveCountRef.current = len;
          } else if (len > prevPgnMoveCountRef.current) {
            const last = hist[len - 1];
            if (last) {
              const oppMoved =
                myColor == null
                  ? true
                  : myColor === "white"
                    ? last.color === "b"
                    : last.color === "w";
              if (oppMoved) announceMove(last, newChess);
            }
            prevPgnMoveCountRef.current = len;
          }
          try {
            if (hist.length > 0) {
              const last = hist[hist.length - 1];
              setLastMove([last.from, last.to]);
              if (myColor == null) setLastMoveBy(null);
              else {
                const selfMoved = myColor === "white" ? last.color === "w" : last.color === "b";
                setLastMoveBy(selfMoved ? "self" : "opponent");
              }
            } else {
              setLastMove(null);
              setLastMoveBy(null);
            }
          } catch {
            /* noop */
          }
          chessRef.current.load(row.fen as string);
          setFen(row.fen as string);
        }
      })
      .on("broadcast", { event: "draw_offer" }, ({ payload }) => {
        if ((payload as { from: string }).from !== myColor) setDrawOffer("received");
      })
      .on("broadcast", { event: "draw_decline" }, () => setDrawOffer(null))
      .on("broadcast", { event: "rematch_offer" }, ({ payload }) => {
        const from = (payload as { from: string }).from;
        if (from === "accepted") return;
        if (from !== myColor) setRematch("received");
      })
      .on("broadcast", { event: "hello" }, ({ payload }) => {
        const p = payload as { name: string; color: string };
        if (p.color !== myColor) setOpponentName(p.name);
      })
      .subscribe(() => {
        // Announce yourself once subscribed
        channel.send({ type: "broadcast", event: "hello", payload: { name: userName, color: myColor ?? "spectator" } });
      });
    return () => { supabase.removeChannel(channel); };
  }, [gameState.roomCode, myColor, userName, announceMove]);

  // Poll game state as Realtime fallback (waiting + active play)
  const lastPollPgnRef = useRef(gameState.pgn);
  useEffect(() => {
    if (isOver) return;
    const ms = isWaiting ? 3000 : 1500;
    const interval = setInterval(async () => {
      try {
        const g = await getChessGame(gameState.roomCode);
        if (!g) return;

        // Waiting → active transition
        if (isWaiting && g.status !== "waiting") {
          setGameState((prev) => ({
            ...prev,
            status: g.status,
            blackUserId: g.blackUserId,
            whiteUserId: g.whiteUserId,
            updatedAt: g.updatedAt,
          }));
          // Re-announce ourselves so opponent learns our name
          try {
            supabase.channel(`chess:${gameState.roomCode}`).send({
              type: "broadcast", event: "hello",
              payload: { name: userName, color: myColor ?? "spectator" },
            });
          } catch { /* ignore */ }
          return;
        }

        // Always sync status changes (resign, timeout, draw don't change PGN)
        const statusChanged = g.status !== gameStateRef.current.status;
        if (statusChanged) {
          setGameState((prev) => ({
            ...prev,
            status: g.status,
            winner: g.winner,
            updatedAt: g.updatedAt,
          }));
        }

        // Skip move sync if PGN hasn't changed
        if (g.pgn === lastPollPgnRef.current) return;
        lastPollPgnRef.current = g.pgn;

        // Parse the server PGN
        const serverChess = new Chess();
        try { serverChess.loadPgn(g.pgn); } catch { return; }
        const serverHist = serverChess.history({ verbose: true }) as Move[];
        const localHist = chess.history({ verbose: true }) as Move[];

        // Only apply if server has more moves than local (opponent moved)
        if (serverHist.length <= localHist.length) {
          // Server caught up to our own move — just sync updatedAt
          setGameState((prev) => ({ ...prev, updatedAt: g.updatedAt }));
          prevPgnMoveCountRef.current = serverHist.length;
          return;
        }

        // Opponent made a move — sync board + clocks
        try { chess.loadPgn(g.pgn); } catch { return; }
        const newFen = chess.fen();
        setFen(newFen);

        // Sync clocks from server
        if (g.whiteTimeMs != null) setWhiteMs(g.whiteTimeMs);
        if (g.blackTimeMs != null) setBlackMs(g.blackTimeMs);

        const last = serverHist[serverHist.length - 1];
        if (last) {
          setLastMove([last.from, last.to]);
          setLastMoveBy("opponent");
          announceMove(last, serverChess);
          if (serverChess.isCheck()) playSound("check", mutedRef.current);
          else if (last.flags.includes("c")) playSound("capture", mutedRef.current);
          else playSound("move", mutedRef.current);
        }
        prevPgnMoveCountRef.current = serverHist.length;

        setGameState((prev) => ({
          ...prev,
          fen: g.fen,
          pgn: g.pgn,
          turn: g.turn,
          status: g.status,
          winner: g.winner,
          updatedAt: g.updatedAt,
        }));
      } catch { /* ignore */ }
    }, ms);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.roomCode, isOver, isWaiting]);

  // Track game start time when game becomes active
  useEffect(() => {
    if (gameState.status === "active" && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
  }, [gameState.status]);

  useEffect(() => {
    if (!voiceError || voiceError === voiceErrRef.current) return;
    voiceErrRef.current = voiceError;
    if (voiceError === "no_url") toast.error("Voice chat is not configured on this site.");
    else if (voiceError === "invalid_room") toast.error("This room cannot be used for voice.");
    else toast.error("Could not start voice call.");
  }, [voiceError]);

  useEffect(() => {
    if (!voiceError) voiceErrRef.current = null;
  }, [voiceError]);

  // Helper: builds extra fields to persist when a game ends
  function endMeta(): { white_player: string; black_player: string; time_control: string; duration_seconds: number } {
    const whiteName = isWhite ? userName : (opponentName ?? "Guest");
    const blackName = isBlack ? userName : (opponentName ?? "Guest");
    return {
      white_player: whiteName,
      black_player: blackName,
      time_control: tc.label,
      duration_seconds: startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current) / 1000)
        : 0,
    };
  }

  // ── Status text ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isWaiting)               setStatus("Waiting for opponent…");
    else if (gameState.status === "resigned") setStatus(gameState.winner === "white" ? "Black resigned — White wins!" : "White resigned — Black wins!");
    else if (gameState.status === "timeout") setStatus(gameState.winner === "white" ? "Black ran out of time — White wins!" : "White ran out of time — Black wins!");
    else if (gameState.status === "finished" || gameState.status === "draw") {
      if (gameState.winner === "draw") setStatus("Draw by agreement");
      else setStatus(`${gameState.winner === "white" ? "White" : "Black"} wins by checkmate!`);
    }
    else if (chess.isCheck())   setStatus(`${gameState.turn === "w" ? "White" : "Black"} is in check!`);
    else                        setStatus(`${gameState.turn === "w" ? "White" : "Black"} to move`);
  }, [gameState, chess, isWaiting]);

  // ── Legal move indicators + click-to-move ─────────────────────────────────
  const { legalMoveStyles: playLegalStyles, handlers: playLegalHandlers, clearSelection: clearPlaySelection } = useChessLegalMoves(chessRef, onDrop, isMyTurn && !isOver);

  // ── Move ──────────────────────────────────────────────────────────────────
  function onDrop(sourceSquare: string, targetSquare: string): boolean {
    if (sourceSquare === targetSquare) return false;
    if (!isMyTurn || gameState.status !== "active") return false;

    const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    if (!move) return false;

    announceMove(move, chess);

    // Sound
    if (chess.isCheck())          playSound("check",   muted);
    else if (move.flags.includes("c")) playSound("capture", muted);
    else if (move.flags.includes("k") || move.flags.includes("q")) playSound("castle", muted);
    else                               playSound("move",    muted);

    const newFen = chess.fen();
    setFen(newFen);
    setLastMove([sourceSquare, targetSquare]);
    setLastMoveBy("self");

    // Increment time after move
    if (initMs > 0) {
      if (myColor === "white") setWhiteMs((p) => p + tc.inc * 1000);
      else                     setBlackMs((p) => p + tc.inc * 1000);
    }

    let newStatus: ChessGame["status"] = "active";
    let winner: ChessGame["winner"] = null;
    const isTerminal = chess.isCheckmate() || chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition();
    if (chess.isCheckmate())                                   { newStatus = "finished"; winner = myColor === "white" ? "white" : "black"; }
    else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) { newStatus = "draw"; winner = "draw"; }

    const extra = isTerminal ? endMeta() : {};
    // Include clock times so opponent can sync
    const clockPatch: { white_time_ms?: number; black_time_ms?: number } = {};
    if (initMs > 0) {
      // Read the latest values after increment
      if (myColor === "white") {
        clockPatch.white_time_ms = whiteMs + tc.inc * 1000;
        clockPatch.black_time_ms = blackMs;
      } else {
        clockPatch.white_time_ms = whiteMs;
        clockPatch.black_time_ms = blackMs + tc.inc * 1000;
      }
    }
    updateChessGame(gameState.roomCode, { fen: newFen, pgn: chess.pgn(), turn: chess.turn(), status: newStatus, winner, ...clockPatch, ...extra })
      .catch(() => { chess.undo(); setFen(chess.fen()); toast.error("Failed to sync move"); });

    return true;
  }

  async function handleResign() {
    if (!confirm("Resign this game?")) return;
    await updateChessGame(gameState.roomCode, {
      status: "resigned",
      winner: myColor === "white" ? "black" : "white",
      ...endMeta(),
    }).catch(() => toast.error("Failed to resign"));
  }

  async function handleTimeout(side: "white" | "black") {
    if (timerRef.current) clearInterval(timerRef.current);
    await updateChessGame(gameState.roomCode, {
      status: "timeout" as ChessGame["status"],
      winner: side === "white" ? "black" : "white",
      ...endMeta(),
    }).catch(() => {});
  }

  function offerDraw() {
    setDrawOffer("sent");
    supabase.channel(`chess:${gameState.roomCode}`).send({ type: "broadcast", event: "draw_offer", payload: { from: myColor } });
  }

  function acceptDraw() {
    setDrawOffer(null);
    updateChessGame(gameState.roomCode, { status: "draw", winner: "draw", ...endMeta() });
  }

  function declineDraw() {
    setDrawOffer(null);
    supabase.channel(`chess:${gameState.roomCode}`).send({ type: "broadcast", event: "draw_decline", payload: {} });
  }

  async function handleRematch() {
    const newChess = new Chess();
    chess.load(newChess.fen());
    setFen(newChess.fen());
    setLastMove(null);
    setLastMoveBy(null);
    prevPgnMoveCountRef.current = 0;
    setWhiteMs(initMs); setBlackMs(initMs);
    setRematch(null); setDrawOffer(null);
    startTimeRef.current = Date.now();
    await updateChessGame(gameState.roomCode, { fen: newChess.fen(), pgn: "", turn: "w", status: "active", winner: null })
      .catch(() => toast.error("Failed to reset"));
    supabase.channel(`chess:${gameState.roomCode}`).send({ type: "broadcast", event: "rematch_offer", payload: { from: "accepted" } });
  }

  function copyCode() {
    navigator.clipboard.writeText(gameState.roomCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function copyLink() {
    const url = `${window.location.origin}/chess/room/${gameState.roomCode}`;
    navigator.clipboard.writeText(url).then(() => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); });
  }

  const opponentLabel = opponentName ?? "Opponent";
  const blackLabel = isBlack ? `${userName} (You)` : `${opponentLabel}`;
  const whiteLabel = isWhite ? `${userName} (You)` : `${opponentLabel}`;

  const opponentDisplay = isWaiting ? "Waiting…" : opponentLabel;
  const topIsBlack = myColor === "white" || myColor === null;
  const topName = myColor === null ? blackLabel.replace(" (You)", "") : opponentDisplay;
  const bottomName = myColor === null ? whiteLabel.replace(" (You)", "") : `${userName} (You)`;

  const topMs = topIsBlack ? blackMs : whiteMs;
  const topClockActive =
    (topIsBlack ? gameState.turn === "b" : gameState.turn === "w") && !isOver && !isWaiting;
  const topLow = topIsBlack ? blackMs < 30000 : whiteMs < 30000;

  const bottomMs = topIsBlack ? whiteMs : blackMs;
  const bottomClockActive =
    (topIsBlack ? gameState.turn === "w" : gameState.turn === "b") && !isOver && !isWaiting;
  const bottomLow = topIsBlack ? whiteMs < 30000 : blackMs < 30000;

  const playMoveHistoryVerbose = useMemo(
    () => historyFromPgn(gameState.pgn ?? ""),
    [gameState.pgn],
  );

  // ── Waiting-room lobby ────────────────────────────────────────────────
  //
  // Two-column composition: a wider info card on the left (360px) and a
  // slightly tighter board on the right (max 500px) so the two sides feel
  // visually balanced. The left card's height is JS-measured against the
  // board so both columns line up exactly. Internal spacing follows a 4/8/16
  // rhythm: gap-1.5 for inline rows, my-4 for major sections, p-6 outer.
  if (isWaiting) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-y-auto bg-zinc-100 dark:bg-[#1e1e1e]">
        <div
          className="mx-auto flex w-full flex-col gap-6 px-6 py-8 lg:flex-row lg:items-start lg:gap-8"
          style={{ maxWidth: 1000 }}
        >
          {/* ── Left column: info card ─────────────────────────────────── */}
          <div
            className="flex w-full shrink-0 flex-col gap-3 lg:w-[360px]"
            style={waitingPanelHeight ? { height: waitingPanelHeight } : undefined}
          >
            <button
              type="button"
              onClick={onBack}
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <ArrowLeft className="h-4 w-4" /> Back to lobby
            </button>

            <div className="flex flex-1 flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              {/* ── Status row ── */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                    style={{ backgroundColor: "#769656" }}
                  />
                  <span
                    className="relative inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: "#769656" }}
                  />
                </span>
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Waiting for opponent…
                </span>
              </div>

              {/* ── Room code (clickable) ── */}
              <button
                type="button"
                onClick={copyCode}
                className="group mt-5 block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-5 text-center transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:border-zinc-600"
                title={copied ? "Copied!" : "Click to copy room code"}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                  Room code
                </p>
                <span
                  className="mt-1.5 block font-mono font-black tabular-nums text-zinc-900 dark:text-zinc-100"
                  style={{ fontSize: 40, letterSpacing: "0.1em", lineHeight: 1.1 }}
                >
                  {gameState.roomCode}
                </span>
                <p className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                  {copied ? (
                    <><Check className="h-3 w-3 text-emerald-500" /> Copied!</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Click to copy</>
                  )}
                </p>
              </button>

              {/* ── Copy invite link — primary action ── */}
              <button
                onClick={copyLink}
                style={{ backgroundColor: "#769656" }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
              >
                {copiedLink ? (
                  <><Check className="h-4 w-4" /> Link copied!</>
                ) : (
                  <><Copy className="h-4 w-4" /> Copy invite link</>
                )}
              </button>

              {/* ── Meta pills ── */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  ⏱ {tc.label}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: "rgba(118,150,86,0.12)",
                    color: "#5d8a4e",
                  }}
                >
                  {(myColor ?? "random") === "black" ? "♚" : "♔"} Playing as {myColor ?? "random"}
                </span>
              </div>

              {/* ── Bottom helper — pinned via mt-auto + soft top border ── */}
              <div className="mt-auto flex flex-col items-center gap-2 border-t border-zinc-100 pt-5 text-center dark:border-zinc-800">
                <span className="chess-gentle-pulse text-4xl" aria-hidden>
                  ♞
                </span>
                <p className="text-[13px] font-medium leading-snug text-zinc-700 dark:text-zinc-200">
                  Share the code with your opponent
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  Most games start within 30 seconds
                </p>
              </div>
            </div>
          </div>

          {/* ── Right column: board (anchored, slightly tighter) ──────── */}
          <div className="flex min-h-0 flex-1 items-start justify-center">
            <div
              ref={waitingBoardRef}
              className="w-full max-w-[500px] opacity-70 transition-opacity"
            >
              <ChessBoardWrapper
                className="overflow-hidden"
                fixedEdgeNotation={false}
                options={{
                  position: fen,
                  boardOrientation: myColor ?? "white",
                  allowDragging: false,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active game / game over ─────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-zinc-100 p-2 dark:bg-zinc-950 sm:gap-3 sm:p-3 md:flex-row md:items-stretch md:justify-center md:gap-4">
      {/* ── Board column (opponent above, you below) ─────────────────────── */}
      <div
        className={
          boardSize > 0
            ? "flex min-h-0 min-w-0 flex-1 flex-col items-stretch gap-1.5 md:flex-none"
            : "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col items-stretch gap-1.5 md:min-w-0 md:flex-1"
        }
        style={boardSize > 0 ? { width: boardSize, maxWidth: "100%" } : undefined}
      >
        <div className="flex h-10 shrink-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ${
                topIsBlack ? "bg-zinc-800 ring-zinc-600" : "bg-zinc-100 ring-zinc-300"
              }`}
            />
            <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {topIsBlack ? "♚" : "♔"} {topName}
            </span>
            {topClockActive && (
              <span className="shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                ●
              </span>
            )}
          </div>
          <Clock ms={topMs} active={topClockActive} low={topLow} compact />
        </div>

        <div className="flex min-h-0 w-full shrink-0 justify-center overflow-hidden md:justify-start">
          <ChessBoardWrapper
            className="shrink-0 overflow-hidden rounded-lg"
            fixedEdgeNotation={false}
            options={{
              position: fen,
              onPieceDrop: ({ sourceSquare, targetSquare }) => { clearPlaySelection(); return onDrop(sourceSquare, targetSquare ?? ""); },
              boardOrientation: myColor ?? "white",
              allowDragging: isMyTurn && !isOver,
              squareStyles: {
                ...(lastMove != null
                  ? squareStylesForLastMove(
                      lastMove[0],
                      lastMove[1],
                      lastMoveBy === "self" ? "user" : "opponent",
                    )
                  : {}),
                ...playLegalStyles,
              },
              ...playLegalHandlers,
            }}
          />
        </div>

        <div className="flex h-10 shrink-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ${
                topIsBlack ? "bg-zinc-100 ring-zinc-300" : "bg-zinc-800 ring-zinc-600"
              }`}
            />
            <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {topIsBlack ? "♔" : "♚"} {bottomName}
            </span>
            {bottomClockActive && (
              <span className="shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                ●
              </span>
            )}
          </div>
          <Clock ms={bottomMs} active={bottomClockActive} low={bottomLow} compact />
        </div>
        <ChessMoveAnnounceChip text={moveAnnounceChip} />
      </div>

      {/* ── Side panel (height-capped to board column on md+) ───────────── */}
      <div
        className="flex min-h-0 w-full min-w-0 flex-col gap-2 overflow-y-auto overflow-x-hidden md:w-[17.5rem] md:max-w-[17.5rem] md:shrink-0"
        style={sidePanelMaxH !== undefined ? { maxHeight: sidePanelMaxH } : undefined}
      >
        {/* 1. Room code — compact */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="font-mono text-sm font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
            {gameState.roomCode}
          </span>
          <button
            type="button"
            onClick={copyCode}
            title="Copy code"
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* 2. Status */}
        <div
          className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium ${
            isOver
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
              : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          }`}
        >
          <div className="flex items-start gap-2">
            {isOver && <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>{status}</span>
          </div>
        </div>

        {/* Draw / rematch — compact */}
        {drawOffer === "received" && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="min-w-0 flex-1 text-xs text-zinc-700 dark:text-zinc-200">Draw offered</p>
            <button type="button" onClick={acceptDraw} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700">
              Accept
            </button>
            <button type="button" onClick={declineDraw} className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
              Decline
            </button>
          </div>
        )}
        {rematch === "received" && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="min-w-0 flex-1 text-xs text-zinc-700 dark:text-zinc-200">Rematch?</p>
            <button type="button" onClick={handleRematch} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700">
              Accept
            </button>
            <button type="button" onClick={() => setRematch(null)} className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
              Decline
            </button>
          </div>
        )}
        {rematch === "sent" && isOver && (
          <p className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            Waiting for opponent to accept…
          </p>
        )}

        {/* Action row */}
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            title={muted ? "Unmute" : "Mute"}
            className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          {!isWaiting && !isOver && (
            <>
              {drawOffer === null && (
                <button
                  type="button"
                  onClick={offerDraw}
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  ½ Draw
                </button>
              )}
              {drawOffer === "sent" && (
                <span className="flex items-center rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-400">
                  Draw sent…
                </span>
              )}
              <button
                type="button"
                onClick={handleResign}
                className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Flag className="h-3.5 w-3.5" /> Resign
              </button>
            </>
          )}
          {isOver && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRematch("sent");
                  supabase.channel(`chess:${gameState.roomCode}`).send({
                    type: "broadcast",
                    event: "rematch_offer",
                    payload: { from: myColor },
                  });
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <RefreshCw className="h-3 w-3" /> Again
              </button>
              {gameState.pgn && (
                <button
                  type="button"
                  onClick={() =>
                    onReview(
                      gameState.pgn,
                      whiteLabel.replace(" (You)", ""),
                      blackLabel.replace(" (You)", ""),
                      gameState.id,
                    )
                  }
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-300 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <BookOpen className="h-3 w-3" /> Review
                </button>
              )}
            </>
          )}
        </div>

        {/* 3. Moves — fills remaining space */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:min-h-[4rem]">
          <ChessMoveHistoryPanel
            fillHeight
            className="min-h-0 flex-1"
            historyVerbose={playMoveHistoryVerbose}
            userSide={myColor ?? "spectator"}
          />
        </div>

        {/* 4. Chat — collapsible */}
        {myColor ? (
          <ChatPanel
            roomCode={gameState.roomCode}
            myColor={myColor}
            expanded={chatOpen}
            onToggle={() => setChatOpen((o) => !o)}
          />
        ) : null}

        {/* 5. Voice — compact */}
        {!livekitConfigured ? (
          <p className="shrink-0 text-[10px] text-zinc-400">Voice unavailable.</p>
        ) : voiceConnected ? (
          <button
            type="button"
            onClick={() => {
              // Open call in a new tab so the chess game is not lost
              window.open(`/call/${encodeURIComponent(voiceRoom)}`, "_blank");
            }}
            className="shrink-0 flex items-center justify-center gap-1 rounded-lg border border-zinc-200 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Mic className="h-3 w-3" /> Call window
          </button>
        ) : (
          <button
            type="button"
            disabled={voiceConnecting}
            onClick={() => requestJoin(voiceRoom)}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
          >
            {voiceConnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <span aria-hidden>🎤</span>}
            {voiceConnecting ? "Connecting…" : "Voice Call"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Puzzle Library ───────────────────────────────────────────────────────────

/** Theme + opening catalogue fetched from /api/chess/themes & /api/chess/openings.
 *  Cached at module scope so the second time the user opens the library page
 *  (or remounts the component) we don't re-hit the network. */
type ThemeMeta = { key: string; name: string; description: string; count: number };
type ThemeGroupMeta = { id: string; name: string; themes: ThemeMeta[] };
type OpeningMeta = {
  family: string;
  key: string;
  color: "white" | "black";
  count: number;
  variations: { key: string; name: string; count: number }[];
};
// Per-level caches — counts on each chip should reflect the *active*
// difficulty (Lichess does the same; "Fork (246K)" beginner ≠ 1.2M overall).
// Cache by level so flipping back and forth doesn't re-hit the network.
const _themesByLevel = new Map<string, Promise<ThemeGroupMeta[]>>();
const _openingsByLevel = new Map<string, Promise<OpeningMeta[]>>();

function fetchThemesMeta(level: PuzzleLevel): Promise<ThemeGroupMeta[]> {
  let p = _themesByLevel.get(level);
  if (!p) {
    p = fetch(`/api/chess/themes?level=${encodeURIComponent(level)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("themes fetch failed"))))
      .then((j) => (j.groups ?? []) as ThemeGroupMeta[])
      .catch((e) => {
        _themesByLevel.delete(level); // allow retry
        throw e;
      });
    _themesByLevel.set(level, p);
  }
  return p;
}
function fetchOpeningsMeta(level: PuzzleLevel): Promise<OpeningMeta[]> {
  let p = _openingsByLevel.get(level);
  if (!p) {
    p = fetch(`/api/chess/openings?level=${encodeURIComponent(level)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("openings fetch failed"))))
      .then((j) => (j.openings ?? []) as OpeningMeta[])
      .catch((e) => {
        _openingsByLevel.delete(level);
        throw e;
      });
    _openingsByLevel.set(level, p);
  }
  return p;
}

function puzzleVisiblePages(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 1 && i <= total) set.add(i);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push("gap");
    out.push(sorted[i]!);
  }
  return out;
}

/** Above which `totalPages` we drop the numbered jump-to control and show
 *  only Prev / Random / Next. 50 pages is the threshold because:
 *    - cap = 1000 (capped multi-theme totals) → exactly 50 pages, treated
 *      as "compact" mode anyway because the count is fuzzy.
 *    - 50 numbered buttons fit on a row at desktop; 84 K do not. */
const PAGINATION_NUMBERED_LIMIT = 50;

/** Sticky-header pagination control — always visible without scrolling
 *  past the grid. Adapts to result-set size:
 *    small (≤ 50 pages, exact): Prev / [1 2 … N] / Next
 *    large (> 50 pages, or capped): Prev / Random / Next + "Showing 1–20 of …"
 *  The Random button matters more than numbered jumps for the personal-
 *  training use-case ("give me a different puzzle"). */
function PaginationStrip({
  rangeStart,
  rangeEnd,
  total,
  totalIsCapped,
  safePage,
  totalPages,
  loading,
  onPrev,
  onNext,
  onRandom,
  onJump,
  puzzlesOnPage,
  pageSize,
}: {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  totalIsCapped: boolean;
  safePage: number;
  totalPages: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRandom: () => void;
  /** Used only in the small-result numbered branch; ignored when compact. */
  onJump: (page: number) => void;
  puzzlesOnPage: number;
  pageSize: number;
}) {
  if (total === 0) return null;
  const compact = totalIsCapped || totalPages > PAGINATION_NUMBERED_LIMIT;
  const visiblePages = puzzleVisiblePages(safePage, totalPages);
  const formattedTotal = totalIsCapped
    ? `${total.toLocaleString()}+`
    : total.toLocaleString();
  // For capped totals: enable Next while the last response was a full page
  // (more pages probably exist beyond the cap).
  const nextDisabled = loading
    ? true
    : totalIsCapped
      ? puzzlesOnPage < pageSize
      : safePage >= totalPages;
  const btn =
    "inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="hidden truncate text-[11px] text-zinc-500 dark:text-zinc-400 sm:block">
        {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {formattedTotal}
      </span>
      <button type="button" disabled={safePage <= 1 || loading} onClick={onPrev} className={btn} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Prev</span>
      </button>
      {compact ? (
        <button
          type="button"
          onClick={onRandom}
          disabled={loading || totalPages <= 1}
          className={`${btn} bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40`}
          title="Jump to a random page"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Random
        </button>
      ) : (
        <div className="hidden min-w-0 items-center gap-0.5 md:flex">
          {visiblePages.map((item, idx) =>
            item === "gap" ? (
              <span key={`g-${idx}`} className="px-1 text-zinc-400">…</span>
            ) : (
              <button
                key={item}
                type="button"
                disabled={loading}
                onClick={() => onJump(item)}
                className={`min-w-[2rem] rounded-lg px-1.5 py-1 text-xs font-medium transition ${
                  item === safePage
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {item.toLocaleString()}
              </button>
            ),
          )}
        </div>
      )}
      <button type="button" disabled={nextDisabled} onClick={onNext} className={btn} aria-label="Next page">
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

type PuzzleProgressFilter = "all" | "unsolved" | "solved";

function PuzzleLibrary({ onBack, onSolve }: { onBack: () => void; onSolve: (p: LibraryPuzzle, nav: LibraryPuzzleNav) => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const levels: PuzzleLevel[]  = ["beginner", "intermediate", "hard", "expert"];

  // ── URL state initialisation ─────────────────────────────────────────────
  // Read filter state from URL on first mount so deep-links work
  // (`/chess/puzzles?level=expert&themes=fork,middlegame`). After mount this
  // becomes one-way — state changes write to the URL, URL changes don't
  // pull back into state. Two-way binding adds feedback risk; for a personal
  // app the deep-link in / state out direction is what matters.
  const initialLevel = (() => {
    const raw = searchParams?.get("level");
    return raw && (levels as readonly string[]).includes(raw) ? (raw as PuzzleLevel) : "beginner";
  })();
  const csv = (s: string | null | undefined) =>
    (s ?? "").split(",").map((p) => p.trim()).filter(Boolean);

  const [activeLevel, setActiveLevel] = useState<PuzzleLevel>(initialLevel);
  // Multi-select theme/opening filters. The sidebar is the single source of
  // truth — every chip there is a checkbox, the active-pills strip in the
  // main header reflects this state too.
  const [selectedThemes, setSelectedThemes]     = useState<string[]>(() =>
    csv(searchParams?.get("themes")),
  );
  const [selectedOpenings, setSelectedOpenings] = useState<string[]>(() =>
    csv(searchParams?.get("openings")),
  );
  const [themeGroups, setThemeGroups]           = useState<ThemeGroupMeta[]>([]);
  const [openings, setOpenings]                 = useState<OpeningMeta[]>([]);
  // Sidebar groups: only Recommended starts expanded. Themes/openings keys
  // are `themes:<groupId>` and `openings:<color>`.
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    () => ({ "themes:recommended": true }),
  );
  // Mobile drawer toggle — sidebar is hidden < lg, opens as sheet on tap.
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  // Search state was removed in pass 6 polish — searching by puzzle ID is
  // rarely useful for personal training, and theme keyword search just
  // duplicates what the sidebar already exposes.
  const [sort, setSort]               = useState<PuzzleSort>(() =>
    normalizeSort(searchParams?.get("sort")),
  );
  const [progressFilter, setProgressFilter] = useState<PuzzleProgressFilter>("all");
  const [page, setPage]               = useState(() => {
    const n = parseInt(searchParams?.get("page") ?? "", 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  });
  const [puzzles, setPuzzles]         = useState<LibraryPuzzle[]>([]);
  const [total, setTotal]             = useState(0);
  const [totalIsCapped, setTotalIsCapped] = useState(false);
  const [levelGrandTotal, setLevelGrandTotal] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [solvedIds, setSolvedIds]     = useState<Set<string>>(() => new Set());
  const [loading, setLoading]         = useState(false);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchEpochRef = useRef(0);

  // Solved/unsolved progress filter is now single-user via progress.sqlite,
  // no auth required — the legacy reset-on-logout effect was removed.

  // Reload theme + opening counts whenever the active difficulty changes.
  // Counts on chips should reflect "Fork at beginner" not "Fork overall".
  useEffect(() => {
    let alive = true;
    fetchThemesMeta(activeLevel)
      .then((g) => { if (alive) setThemeGroups(g); })
      .catch((e) => console.warn("[puzzle-library] themes meta:", e));
    fetchOpeningsMeta(activeLevel)
      .then((o) => { if (alive) setOpenings(o); })
      .catch((e) => console.warn("[puzzle-library] openings meta:", e));
    return () => { alive = false; };
  }, [activeLevel]);

  // ── Push filter state to URL (one-way) ──────────────────────────────────
  // Avoid running on the very first render — the initial URL is already
  // canonical (we read from it). This prevents an unnecessary history entry
  // on mount.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    const params = new URLSearchParams();
    if (activeLevel !== "beginner") params.set("level", activeLevel);
    if (selectedThemes.length) params.set("themes", selectedThemes.join(","));
    if (selectedOpenings.length) params.set("openings", selectedOpenings.join(","));
    if (sort !== "popular") params.set("sort", sort);
    if (page !== 1) params.set("page", String(page));
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [activeLevel, selectedThemes, selectedOpenings, sort, page, pathname, router]);

  const load = useCallback(
    async (
      lvl: PuzzleLevel,
      themes: string[],
      ops: string[],
      sortKey: PuzzleSort,
      pageNum: number,
      progress: PuzzleProgressFilter,
    ) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const epoch = ++fetchEpochRef.current;
      const offset = (pageNum - 1) * LIBRARY_PAGE_SIZE;

      setLoading(true);
      setLoadError(null);
      setPuzzles([]);
      try {
        const params = new URLSearchParams({
          level: lvl,
          limit: String(LIBRARY_PAGE_SIZE),
          offset: String(offset),
          sort: sortKey,
          progress,
        });
        if (themes.length) params.set("themes", themes.join(","));
        if (ops.length) params.set("openings", ops.join(","));
        const res = await authFetch(`/api/chess/puzzles/library?${params}`, { signal: ctrl.signal });
        const data = await res.json() as {
          items: LibraryPuzzle[];
          total: number;
          totalIsCapped?: boolean;
          error?: string;
          levelGrandTotal?: number;
          solvedCount?: number;
          solvedPuzzleIds?: string[];
        };
        if (ctrl.signal.aborted || epoch !== fetchEpochRef.current) return;

        if (!res.ok) {
          setLoadError(data.error ?? "Could not load puzzles.");
          setTotal(0);
          setTotalIsCapped(false);
          return;
        }

        const filtered = data.items.filter((p) => p.level === lvl);
        setPuzzles(filtered);
        setTotal(data.total);
        setTotalIsCapped(!!data.totalIsCapped);
        if (typeof data.levelGrandTotal === "number") setLevelGrandTotal(data.levelGrandTotal);
        // Solved tracking is single-user via progress.sqlite, no auth required.
        if (typeof data.solvedCount === "number") setSolvedCount(data.solvedCount);
        if (Array.isArray(data.solvedPuzzleIds)) setSolvedIds(new Set(data.solvedPuzzleIds));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (epoch === fetchEpochRef.current) {
          setLoadError("Could not load puzzles. Check your connection and try again.");
          setTotal(0);
        }
      } finally {
        if (!ctrl.signal.aborted && epoch === fetchEpochRef.current) setLoading(false);
      }
    },
    [user],
  );

  // Stringified arrays for stable equality comparisons in filterRef.
  const themesKey = selectedThemes.slice().sort().join(",");
  const openingsKey = selectedOpenings.slice().sort().join(",");
  const filterRef = useRef<{
    activeLevel: PuzzleLevel;
    themesKey: string;
    openingsKey: string;
    sort: PuzzleSort;
    progressFilter: PuzzleProgressFilter;
  } | null>(null);
  useEffect(() => {
    const prev = filterRef.current;
    const filtersChanged =
      prev === null ||
      prev.activeLevel !== activeLevel ||
      prev.themesKey !== themesKey ||
      prev.openingsKey !== openingsKey ||
      prev.sort !== sort ||
      prev.progressFilter !== progressFilter;

    if (filtersChanged && page !== 1) {
      setPage(1);
      return;
    }

    filterRef.current = { activeLevel, themesKey, openingsKey, sort, progressFilter };
    void load(activeLevel, selectedThemes, selectedOpenings, sort, page, progressFilter);
  }, [activeLevel, selectedThemes, selectedOpenings, themesKey, openingsKey, sort, progressFilter, page, load, user]);

  useEffect(() => {
    if (total <= 0) return;
    const tp = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
    if (page > tp) setPage(tp);
  }, [total, page]);

  // ── Reload on tab/return-to-page ─────────────────────────────────────────
  // After solving a puzzle the user navigates back to the library and
  // expects to see the new solved checkmark + bumped progress count.
  // PuzzleLibrary's React state is preserved across browser back / bfcache
  // restore, so the existing filter-driven load() effect doesn't re-run.
  // Listen for visibilitychange + pageshow.persisted and force a fresh
  // fetch using the current filter state.
  const loadRef = useRef(load);
  loadRef.current = load;
  const filterStateRef = useRef({
    activeLevel,
    selectedThemes,
    selectedOpenings,
    sort,
    page,
    progressFilter,
  });
  filterStateRef.current = {
    activeLevel,
    selectedThemes,
    selectedOpenings,
    sort,
    page,
    progressFilter,
  };
  useEffect(() => {
    const refresh = () => {
      const s = filterStateRef.current;
      void loadRef.current(
        s.activeLevel,
        s.selectedThemes,
        s.selectedOpenings,
        s.sort,
        s.page,
        s.progressFilter,
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE) || 1);
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * LIBRARY_PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(safePage * LIBRARY_PAGE_SIZE, total);
  const visiblePages = puzzleVisiblePages(safePage, totalPages);

  const formattedTotal = totalIsCapped ? `${total.toLocaleString()}+` : total.toLocaleString();
  const progressPct =
    levelGrandTotal > 0
      ? Math.min(100, Math.round((solvedCount / levelGrandTotal) * 1000) / 10)
      : 0;

  // Map theme key → group id, derived from themeGroups state. Used by tag
  // colour lookup so a tag's chip colour reflects its group (mates=red,
  // phases=sky, motifs=zinc, etc.) rather than substring heuristics.
  const themeToGroup = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of themeGroups) for (const t of g.themes) m.set(t.key, g.id);
    return m;
  }, [themeGroups]);

  return (
    <div className="flex flex-1 flex-col">
      {/* Slim page header — Back + title + Stats link. Difficulty moved
           into the sidebar (a radio group at the top), so the level tabs
           that used to live here are gone. */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Puzzles
        </h1>
        <span className="font-mono text-[11px] text-zinc-400">
          ({LEVEL_LABELS[activeLevel]})
        </span>
        <Link
          href="/chess/stats"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Trophy className="h-3.5 w-3.5" />
          Stats
        </Link>
      </div>

      {/* ── 2-column layout: filter sidebar + puzzle grid main ───────────
           Sidebar is sticky-left at lg+, becomes a slide-in drawer on mobile.
           Filters live entirely in the sidebar; the main column header is
           reserved for the things you change *while* browsing (search,
           sort, status, active-filter pills you can dismiss). */}
      <div className="flex min-h-0 flex-1">
        {/* Mobile drawer backdrop */}
        {filtersDrawerOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setFiltersDrawerOpen(false)}
            aria-hidden
          />
        )}

        {/* SIDEBAR */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-zinc-200 bg-white px-4 py-4 transition-transform dark:border-zinc-800 dark:bg-zinc-900 lg:static lg:inset-auto lg:z-auto lg:flex lg:w-[280px] lg:translate-x-0 lg:flex-col ${
            filtersDrawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Filters
            </p>
            <div className="flex items-center gap-2">
              {(selectedThemes.length > 0 || selectedOpenings.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedThemes([]);
                    setSelectedOpenings([]);
                    setPage(1);
                  }}
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setFiltersDrawerOpen(false)}
                className="text-zinc-400 lg:hidden"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Difficulty — single-select radio group. Lives at the top of the
               sidebar (above the theme groups) so it's visually obvious it
               scopes everything below it. Switching difficulty re-fetches
               counts for the new bucket. */}
          <div className="border-t border-zinc-100 py-2 first:border-t-0 dark:border-zinc-800">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Difficulty
            </p>
            <div className="flex flex-col gap-0.5">
              {levels.map((lvl) => (
                <label
                  key={lvl}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs ${
                    activeLevel === lvl
                      ? "bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="difficulty"
                    checked={activeLevel === lvl}
                    onChange={() => {
                      setActiveLevel(lvl);
                      setPage(1);
                    }}
                    className="h-3.5 w-3.5 shrink-0 border-zinc-300 text-emerald-600 focus:ring-1 focus:ring-emerald-500"
                  />
                  <span>{LEVEL_LABELS[lvl]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Theme group sections */}
          {themeGroups.map((g) => {
            const sectionId = `themes:${g.id}`;
            const expanded = !!expandedSections[sectionId];
            const groupSelectedCount = g.themes.filter((t) =>
              selectedThemes.includes(t.key),
            ).length;
            return (
              <div key={g.id} className="border-t border-zinc-100 py-2 first:border-t-0 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSections((s) => ({ ...s, [sectionId]: !s[sectionId] }))
                  }
                  className="flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  <span className="flex items-center gap-1.5">
                    {g.name}
                    {groupSelectedCount > 0 && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {groupSelectedCount}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
                {expanded && (
                  <div className="mt-2 flex flex-col gap-0.5">
                    {g.themes.map((t) => {
                      const checked = selectedThemes.includes(t.key);
                      const disabled = t.count === 0 && !checked;
                      return (
                        <label
                          key={t.key}
                          title={t.description}
                          className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs ${
                            disabled
                              ? "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
                              : "cursor-pointer text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => {
                                setSelectedThemes((cur) =>
                                  checked
                                    ? cur.filter((k) => k !== t.key)
                                    : [...cur, t.key],
                                );
                                setPage(1);
                              }}
                              className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-800"
                            />
                            <span className="truncate">{t.name}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[10px] opacity-60">
                            {t.count.toLocaleString()}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Openings sections — split by colour, with variations nested */}
          {openings.length > 0 &&
            (["white", "black"] as const).map((color) => {
              const list = openings.filter((o) => o.color === color);
              if (list.length === 0) return null;
              const sectionId = `openings:${color}`;
              const expanded = !!expandedSections[sectionId];
              const allKeys = list.flatMap((o) => [o.key, ...o.variations.map((v) => v.key)]);
              const selectedCount = allKeys.filter((k) => selectedOpenings.includes(k)).length;
              return (
                <div key={color} className="border-t border-zinc-100 py-2 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSections((s) => ({ ...s, [sectionId]: !s[sectionId] }))
                    }
                    className="flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                  >
                    <span className="flex items-center gap-1.5">
                      Openings — {color === "white" ? "White" : "Black"}
                      {selectedCount > 0 && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {selectedCount}
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {expanded && (
                    <div className="mt-2 flex flex-col gap-2">
                      {list.map((o) => {
                        const checkedFamily = selectedOpenings.includes(o.key);
                        const disabledFamily = o.count === 0 && !checkedFamily;
                        return (
                          <div key={o.key} className="flex flex-col gap-0.5">
                            <label
                              className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs ${
                                disabledFamily
                                  ? "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
                                  : "cursor-pointer font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checkedFamily}
                                  disabled={disabledFamily}
                                  onChange={() => {
                                    setSelectedOpenings((cur) =>
                                      checkedFamily
                                        ? cur.filter((k) => k !== o.key)
                                        : [...cur, o.key],
                                    );
                                    setPage(1);
                                  }}
                                  className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-800"
                                />
                                <span className="truncate">{o.family}</span>
                              </span>
                              <span className="shrink-0 font-mono text-[10px] opacity-60">
                                {o.count.toLocaleString()}
                              </span>
                            </label>
                            {o.variations.length > 0 && (
                              <div className="flex flex-col gap-0.5 pl-5">
                                {o.variations.map((v) => {
                                  const checkedV = selectedOpenings.includes(v.key);
                                  const disabledV = v.count === 0 && !checkedV;
                                  return (
                                    <label
                                      key={v.key}
                                      className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-[11px] ${
                                        disabledV
                                          ? "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
                                          : "cursor-pointer text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                      }`}
                                    >
                                      <span className="flex min-w-0 items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={checkedV}
                                          disabled={disabledV}
                                          onChange={() => {
                                            setSelectedOpenings((cur) =>
                                              checkedV
                                                ? cur.filter((k) => k !== v.key)
                                                : [...cur, v.key],
                                            );
                                            setPage(1);
                                          }}
                                          className="h-3 w-3 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-800"
                                        />
                                        <span className="truncate">{v.name}</span>
                                      </span>
                                      <span className="shrink-0 font-mono text-[9px] opacity-50">
                                        {v.count.toLocaleString()}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </aside>

        {/* MAIN COLUMN */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Sticky header: Filters btn (mobile) + search + status + sort,
               then active-filter pills (only when there are active filters). */}
          <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={() => setFiltersDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 lg:hidden dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Filter className="h-4 w-4" />
                Filters
                {(selectedThemes.length + selectedOpenings.length) > 0 && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {selectedThemes.length + selectedOpenings.length}
                  </span>
                )}
              </button>
              {/* Pagination strip lives in the sticky header so the user
                  can move through 1.7 M beginner puzzles without scrolling
                  the grid first. Smart variant: when totalPages exceeds
                  PAGINATION_NUMBERED_LIMIT (50), the numbered jump-to is
                  replaced with Prev / Random / Next — 84 K page numbers
                  is noise, "give me a different puzzle" is the real
                  use-case. */}
              <PaginationStrip
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                total={total}
                totalIsCapped={totalIsCapped}
                safePage={safePage}
                totalPages={totalPages}
                loading={loading}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  setPage((p) => (totalIsCapped ? p + 1 : Math.min(totalPages, p + 1)))
                }
                onRandom={() => {
                  if (totalPages <= 1) return;
                  const r = 1 + Math.floor(Math.random() * totalPages);
                  setPage(r);
                }}
                onJump={(n) => setPage(n)}
                puzzlesOnPage={puzzles.length}
                pageSize={LIBRARY_PAGE_SIZE}
              />
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/80">
                {(["all", "unsolved", "solved"] as const).map((pf) => (
                  <button
                    key={pf}
                    type="button"
                    onClick={() => {
                      setProgressFilter(pf);
                      setPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      progressFilter === pf
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    }`}
                  >
                    {pf === "all" ? "All" : pf === "unsolved" ? "Unsolved" : "Solved"}
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="puzzle-library-sort">
                Sort puzzles
              </label>
              <select
                id="puzzle-library-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as PuzzleSort);
                  setPage(1);
                }}
                className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:ring-zinc-800"
              >
                <option value="popular">Popular</option>
                <option value="random">Random</option>
                <option value="hardest">Hardest</option>
                <option value="easiest">Easiest</option>
              </select>
            </div>

            {/* Active filter pills — click × to remove a single filter. */}
            {(selectedThemes.length > 0 || selectedOpenings.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedThemes.map((k) => {
                  const meta = themeGroups.flatMap((g) => g.themes).find((t) => t.key === k);
                  return (
                    <button
                      key={`t:${k}`}
                      type="button"
                      onClick={() => {
                        setSelectedThemes((cur) => cur.filter((x) => x !== k));
                        setPage(1);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                    >
                      {meta?.name ?? k}
                      <X className="h-3 w-3" />
                    </button>
                  );
                })}
                {selectedOpenings.map((k) => {
                  // Look up family or variation by key.
                  const flat = openings.flatMap((o) => [
                    { key: o.key, label: o.family },
                    ...o.variations.map((v) => ({ key: v.key, label: v.name })),
                  ]);
                  const meta = flat.find((x) => x.key === k);
                  return (
                    <button
                      key={`o:${k}`}
                      type="button"
                      onClick={() => {
                        setSelectedOpenings((cur) => cur.filter((x) => x !== k));
                        setPage(1);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50"
                    >
                      {meta?.label ?? k}
                      <X className="h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

      {/* Progress bar — always shown so the difficulty's grand total stays
           visible even before any attempts have been recorded. solvedCount
           wires to progress.sqlite in pass 5; until then it sits at 0. */}
      {levelGrandTotal > 0 && (
        <div className="px-4 pt-2 pb-1">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <span>
              {solvedCount.toLocaleString()} / {levelGrandTotal.toLocaleString()}{" "}
              {LEVEL_LABELS[activeLevel]} puzzles solved
            </span>
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
              {progressPct}%
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Showing-range + page info now lives in the sticky pagination
           strip up top, so this row only surfaces empty / loading state. */}
      {loading && total === 0 ? (
        <p className="px-4 pb-2 pt-2 text-xs text-zinc-500 dark:text-zinc-400">Loading…</p>
      ) : total === 0 ? (
        <p className="px-4 pb-2 pt-2 text-xs text-zinc-500 dark:text-zinc-400">No puzzles match your filters.</p>
      ) : null}

      {loadError && (
        <div className="mx-4 flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-900/40 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              void load(activeLevel, selectedThemes, selectedOpenings, sort, 1, progressFilter);
            }}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Compact text-only puzzle cards. The mini chess board preview was
           dropped per UX feedback — at thumbnail size it's not legible and
           consumes most of the card height. The whole card is now a single
           clickable button so the user doesn't have to aim at a sub-control. */}
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {puzzles.map((p, i) => {
          const isSolved = solvedIds.has(p.id);
          // Pick up to 3 representative themes (skip very generic ones if
          // we have specific themes to show). Then up to 1 opening tag.
          const themeTags = p.themes.slice(0, 3);
          // Decorated puzzle items from the new API include `openings`. Older
          // legacy paths might not — fall back to empty.
          const openingTags =
            (p as LibraryPuzzle & { openings?: string[] }).openings?.slice(0, 1) ?? [];
          // Look up display name for the opening tag. Most puzzle tags
          // are sub-variations our curated openings.json doesn't carry —
          // fall back to underscore-strip so the chip never reads
          // "Bishops_Opening_Bercus_Variation".
          const openingDisplay = openingTags.map((k) => {
            const flat = openings.flatMap((o) => [
              { key: o.key, label: o.family },
              ...o.variations.map((v) => ({ key: v.key, label: v.name })),
            ]);
            return flat.find((x) => x.key === k)?.label ?? k.replace(/_/g, " ");
          });
          return (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                onSolve(p, {
                  level: activeLevel,
                  themes: selectedThemes,
                  openings: selectedOpenings,
                  sort,
                  page: safePage,
                  index: i,
                  pageItems: [...puzzles],
                  total,
                })
              }
              className={`group flex min-h-[120px] flex-col items-stretch gap-2 rounded-xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:bg-zinc-900 ${
                isSolved
                  ? "border-emerald-200 dark:border-emerald-900/50"
                  : "border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                {/* Big rating badge — the dominant feature of the card. */}
                <span className="inline-flex items-baseline gap-1 font-mono text-2xl font-black leading-none text-zinc-800 dark:text-zinc-100">
                  <Star className="h-4 w-4 self-center fill-amber-400 text-amber-400" aria-hidden />
                  {p.rating}
                </span>
                {isSolved ? (
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-2 ring-white dark:ring-zinc-900"
                    aria-label="Solved"
                  >
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-zinc-300 dark:text-zinc-600">
                    #{p.id}
                  </span>
                )}
              </div>
              <div>
                <span
                  className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${LEVEL_COLORS[p.level]}`}
                >
                  {LEVEL_LABELS[p.level]}
                </span>
              </div>
              {themeTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {themeTags.map((t) => (
                    <span
                      key={t}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${puzzleTagAccentClasses(t, themeToGroup)}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {openingDisplay.length > 0 && (
                <p className="truncate text-[11px] italic text-zinc-500 dark:text-zinc-400">
                  {openingDisplay.join(", ")}
                </p>
              )}
            </button>
          );
        })}
        {loading &&
          puzzles.length === 0 &&
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[120px] flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="h-7 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-4 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-3 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          ))}
      </div>

        </main>
      </div>
    </div>
  );
}

// Hint copy now lives in lib/puzzleHints.ts (THEME_INFO) and powers the
// progressive 3-level hint flow inside PuzzleSolve.

// ─── Puzzle Solve ─────────────────────────────────────────────────────────────

function PuzzleSolve({ puzzle, onBack, onNextPuzzle }: {
  puzzle: LibraryPuzzle | BuiltInPuzzle;
  onBack: () => void;
  onNextPuzzle?: () => void | Promise<void>;
}) {
  const [nextPuzzleLoading, setNextPuzzleLoading] = useState(false);
  const isLibrary = !("title" in puzzle);
  const setupMove = isLibrary ? (puzzle as LibraryPuzzle).moves[0] : null;
  const solMoves  = isLibrary
    ? (puzzle as LibraryPuzzle).moves.slice(1)
    : (puzzle as BuiltInPuzzle).solutionMoves;

  const [chess]     = useState(() => new Chess(puzzle.fen));
  const [fen, setFen]                     = useState(puzzle.fen);
  const [moveIdx, setMoveIdx]             = useState(0);
  const [result, setResult]               = useState<"idle" | "wrong" | "solved">("idle");
  /** Progressive hint reveal: 0 = none, 1..HINT_MAX_LEVEL = revealed levels. */
  const [hintLevel, setHintLevel]         = useState(0);
  const [lastMove, setLastMove]           = useState<[string, string] | null>(null);
  const [wrongSquares, setWrongSquares]   = useState<[string, string] | null>(null);
  const [wrongExpl, setWrongExpl]         = useState("");
  // Wrong-move "why this is wrong" copy comes from /api/chess/puzzles/explain
  // and is no longer surfaced — the progressive hint flow handles guidance.
  const [loadingWrong, setLoadingWrong]   = useState(false);
  const [muted, setMuted]                 = useState(false);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  const [moveArrows, setMoveArrows]       = useState<ChessboardArrow[]>([]);
  const [lastMoveSide, setLastMoveSide]   = useState<"user" | "opponent" | null>(null);
  const [boardShake, setBoardShake]       = useState(false);
  const wrongArrowClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongExplGenRef = useRef(0);
  const libraryWrongAttemptsRef = useRef(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  // Used to compute durationMs in the attempt log: time from the first
  // render of this puzzle until the result is decided (solved or wrong).
  const startedAtRef = useRef<number>(Date.now());

  // FEN at the moment the player is about to move (before their drop)
  const fenBeforeDropRef = useRef(puzzle.fen);
  const chessRef = useRef(chess);
  chessRef.current = chess;
  const { chip: moveAnnounceChip, announce: announceMove } = useChessMoveAnnouncement();

  const fenTurn      = puzzle.fen.split(" ")[1] as "w" | "b";
  const playerColor  = (setupMove
    ? (fenTurn === "w" ? "black" : "white")
    : (fenTurn === "w" ? "white" : "black")) as "white" | "black";

  function clearWrongArrowTimer() {
    if (wrongArrowClearRef.current) {
      clearTimeout(wrongArrowClearRef.current);
      wrongArrowClearRef.current = null;
    }
  }

  /** Auto-clear move arrows after 1s so they fade out instead of lingering. */
  const moveArrowClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleMoveArrowClear() {
    if (moveArrowClearRef.current) clearTimeout(moveArrowClearRef.current);
    moveArrowClearRef.current = setTimeout(() => {
      setMoveArrows([]);
      moveArrowClearRef.current = null;
    }, 1000);
  }
  function clearMoveArrowTimer() {
    if (moveArrowClearRef.current) {
      clearTimeout(moveArrowClearRef.current);
      moveArrowClearRef.current = null;
    }
  }
  function clearShakeTimer() {
    if (shakeClearRef.current) {
      clearTimeout(shakeClearRef.current);
      shakeClearRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearWrongArrowTimer();
      clearShakeTimer();
      clearMoveArrowTimer();
    };
  }, []);

  // Auto-play setup move for Lichess puzzles
  useEffect(() => {
    if (!setupMove) return;
    const timer = setTimeout(() => {
      const m = chessRef.current.move({ from: setupMove.slice(0, 2), to: setupMove.slice(2, 4), promotion: setupMove[4] ?? "q" });
      if (m) {
        setFen(chessRef.current.fen());
        fenBeforeDropRef.current = chessRef.current.fen();
        setLastMove([setupMove.slice(0, 2), setupMove.slice(2, 4)]);
        setLastMoveSide("opponent");
        setMoveArrows([
          { startSquare: setupMove.slice(0, 2), endSquare: setupMove.slice(2, 4), color: PUZZLE_ARROW_OPPONENT },
        ]);
        scheduleMoveArrowClear();
        const mu = mutedRef.current;
        if (chessRef.current.isCheck()) playSound("check", mu);
        else if (m.flags.includes("c")) playSound("capture", mu);
        else playSound("move", mu);
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupMove]);

  // Fetch wrong-move explanation from AI (non-blocking)
  async function fetchWrongExplanation(currentFen: string, wrongMove: string, attempt: number) {
    const requestId = ++wrongExplGenRef.current;
    setLoadingWrong(true);
    setWrongExpl("");
    try {
      const res = await fetch("/api/chess/puzzles/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode:       "wrong_move",
          currentFen,
          wrongMove,
          themes:     isLibrary ? (puzzle as LibraryPuzzle).themes : [],
          level:      puzzle.level,
          attempt,
          solutionMoves: solMoves.slice(moveIdx),
        }),
      });
      const data = await res.json() as { explanation: string; hint?: string };
      if (requestId !== wrongExplGenRef.current) return;
      setWrongExpl(data.explanation ?? "");
    } finally {
      if (requestId === wrongExplGenRef.current) setLoadingWrong(false);
    }
  }

  const libraryPuzzleId = isLibrary ? (puzzle as LibraryPuzzle).id : "";
  const libraryThemes = isLibrary ? (puzzle as LibraryPuzzle).themes : [];
  const libraryThemesKey = libraryThemes.join("\0");

  useEffect(() => {
    libraryWrongAttemptsRef.current = 0;
    startedAtRef.current = Date.now();
  }, [isLibrary, libraryPuzzleId]);

  /** Persist a single attempt to progress.sqlite. Includes duration since
   *  this puzzle mounted and the highest hint level revealed. Called on
   *  both solved and wrong (give-up) paths. */
  async function recordAttempt(solved: boolean): Promise<void> {
    if (!isLibrary) return;
    const p = puzzle as LibraryPuzzle;
    const durationMs = Math.max(0, Date.now() - startedAtRef.current);
    try {
      await authFetch(`/api/chess/puzzles/${encodeURIComponent(p.id)}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solved,
          hintsUsed: hintLevel,
          durationMs,
        }),
      });
    } catch (e) {
      // Attempts log is best-effort — a network blip shouldn't break the
      // solve flow.
      console.warn("[puzzle attempt]", e);
    }
  }

  // Hints are now fully derived from puzzle themes + the solution UCI; no
  // server-side hint fetch is needed. See lib/puzzleHints.ts.

  // ── Legal move indicators + click-to-move ─────────────────────────────────
  const { legalMoveStyles: puzzleLegalStyles, handlers: puzzleLegalHandlers, clearSelection: clearPuzzleSelection } = useChessLegalMoves(chessRef, onDrop, result !== "solved");

  function onDrop(sourceSquare: string, targetSquare: string): boolean {
    if (sourceSquare === targetSquare) return false;
    if (result === "solved") return false;
    const expectedUci = solMoves[moveIdx];
    if (!expectedUci) return false;

    const actualUci = `${sourceSquare}${targetSquare}`;
    const match = actualUci === expectedUci || actualUci === expectedUci.slice(0, 4);

    if (!match) {
      if (isLibrary) libraryWrongAttemptsRef.current += 1;
      const newAttempts = wrongAttempts + 1;
      setWrongAttempts(newAttempts);
      clearWrongArrowTimer();
      clearShakeTimer();
      setMoveArrows([
        { startSquare: sourceSquare, endSquare: targetSquare, color: PUZZLE_ARROW_WRONG },
      ]);
      setBoardShake(true);
      playSound("wrong", muted);
      wrongArrowClearRef.current = setTimeout(() => {
        setMoveArrows([]);
        wrongArrowClearRef.current = null;
      }, 1000);
      shakeClearRef.current = setTimeout(() => {
        setBoardShake(false);
        shakeClearRef.current = null;
      }, 500);

      setResult("wrong");
      // After a wrong move, reveal at least the motif if no hints have been shown yet.
      setHintLevel((lvl) => Math.max(lvl, 1));
      setWrongSquares([sourceSquare, targetSquare]);
      const fenNow = fenBeforeDropRef.current;
      fetchWrongExplanation(fenNow, actualUci, newAttempts);
      return false;
    }

    clearWrongArrowTimer();

    const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: expectedUci[4] ?? "q" });
    if (!move) return false;

    setMoveArrows([
      { startSquare: sourceSquare, endSquare: targetSquare, color: PUZZLE_ARROW_USER },
    ]);
    scheduleMoveArrowClear();
    setLastMoveSide("user");

    announceMove(move, chess);

    if (chess.isCheck()) playSound("check", muted);
    else if (move.flags.includes("c")) playSound("capture", muted);
    else playSound("move", muted);

    setFen(chess.fen());
    fenBeforeDropRef.current = chess.fen();
    setLastMove([sourceSquare, targetSquare]);
    setWrongSquares(null);
    setWrongExpl("");
    setResult("idle");

    const nextIdx = moveIdx + 1;
    setMoveIdx(nextIdx);

    if (nextIdx >= solMoves.length) {
      setResult("solved");
      playSound("notify", muted);
      void recordAttempt(true);
      incrementChessPuzzleCounter();
      return true;
    }

    const opponentMove = solMoves[nextIdx];
    if (opponentMove) {
      setTimeout(() => {
        const from = opponentMove.slice(0, 2);
        const to   = opponentMove.slice(2, 4);
        const m    = chessRef.current.move({ from, to, promotion: opponentMove[4] ?? "q" });
        if (m) {
          setMoveArrows([{ startSquare: from, endSquare: to, color: PUZZLE_ARROW_OPPONENT }]);
          scheduleMoveArrowClear();
          setLastMoveSide("opponent");
          announceMove(m, chessRef.current);
          const ch = chessRef.current;
          if (ch.isCheck()) playSound("check", mutedRef.current);
          else if (m.flags.includes("c")) playSound("capture", mutedRef.current);
          else playSound("move", mutedRef.current);
          setFen(ch.fen());
          fenBeforeDropRef.current = ch.fen();
          setLastMove([from, to]);
          setMoveIdx(nextIdx + 1);
        }
      }, 400);
    }
    return true;
  }

  /** Wrong drops never apply to chess.js — sync FEN and clear feedback for another attempt. */
  function handleTryAgain() {
    wrongExplGenRef.current++;
    libraryWrongAttemptsRef.current = 0;
    clearWrongArrowTimer();
    clearShakeTimer();
    clearMoveArrowTimer();
    setMoveArrows([]);
    setBoardShake(false);
    setLoadingWrong(false);
    setResult("idle");
    setWrongSquares(null);
    setWrongExpl("");
    const f = chessRef.current.fen();
    setFen(f);
    fenBeforeDropRef.current = f;
  }

  /**
   * Reveal the full solution: replays remaining solMoves on the board with a
   * 500ms delay between plies, then triggers the solved state so the
   * Next Puzzle button appears.
   */
  const giveUpRunningRef = useRef(false);
  function handleGiveUp() {
    if (giveUpRunningRef.current) return;
    giveUpRunningRef.current = true;

    // Clear wrong-state UI before replaying.
    wrongExplGenRef.current++;
    clearWrongArrowTimer();
    clearShakeTimer();
    clearMoveArrowTimer();
    setBoardShake(false);
    setLoadingWrong(false);
    setWrongSquares(null);
    setWrongExpl("");
    setMoveArrows([]);
    setResult("idle");

    // Resync chess.js to the FEN before the user's wrong drop, in case it drifted.
    chessRef.current.load(fenBeforeDropRef.current);
    setFen(fenBeforeDropRef.current);

    const playOne = (idx: number) => {
      if (idx >= solMoves.length) {
        // Done — flip to solved state visually, but log this attempt as a
        // failure (`solved: false`) since the user asked for the solution
        // rather than finding it. Hint level is whatever they had revealed.
        setResult("solved");
        playSound("notify", mutedRef.current);
        void recordAttempt(false);
        giveUpRunningRef.current = false;
        return;
      }
      const uci = solMoves[idx]!;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const m = chessRef.current.move({ from, to, promotion: uci[4] ?? "q" });
      if (!m) {
        giveUpRunningRef.current = false;
        return;
      }
      setMoveArrows([
        {
          startSquare: from,
          endSquare: to,
          color: idx % 2 === 0 ? PUZZLE_ARROW_USER : PUZZLE_ARROW_OPPONENT,
        },
      ]);
      scheduleMoveArrowClear();
      setLastMoveSide(idx % 2 === 0 ? "user" : "opponent");
      const ch = chessRef.current;
      if (ch.isCheck()) playSound("check", mutedRef.current);
      else if (m.flags.includes("c")) playSound("capture", mutedRef.current);
      else playSound("move", mutedRef.current);
      setFen(ch.fen());
      fenBeforeDropRef.current = ch.fen();
      setLastMove([from, to]);
      setMoveIdx(idx + 1);
      setTimeout(() => playOne(idx + 1), 500);
    };

    // Tiny defer so the UI can repaint the cleared wrong-state first.
    setTimeout(() => playOne(moveIdx), 60);
  }

  function handleReset() {
    wrongExplGenRef.current++;
    libraryWrongAttemptsRef.current = 0;
    setWrongAttempts(0);
    clearWrongArrowTimer();
    clearShakeTimer();
    clearMoveArrowTimer();
    setMoveArrows([]);
    setBoardShake(false);
    setLoadingWrong(false);
    chess.load(puzzle.fen);
    setFen(puzzle.fen);
    fenBeforeDropRef.current = puzzle.fen;
    setMoveIdx(0);
    setResult("idle");
    setHintLevel(0);
    setLastMove(null);
    setLastMoveSide(null);
    setWrongSquares(null);
    setWrongExpl("");
    if (setupMove) {
      setTimeout(() => {
        const m = chessRef.current.move({ from: setupMove.slice(0, 2), to: setupMove.slice(2, 4), promotion: setupMove[4] ?? "q" });
        if (m) {
          setFen(chessRef.current.fen());
          fenBeforeDropRef.current = chessRef.current.fen();
          setLastMove([setupMove.slice(0, 2), setupMove.slice(2, 4)]);
          setLastMoveSide("opponent");
          setMoveArrows([
            { startSquare: setupMove.slice(0, 2), endSquare: setupMove.slice(2, 4), color: PUZZLE_ARROW_OPPONENT },
          ]);
          scheduleMoveArrowClear();
          const mu = mutedRef.current;
          if (chessRef.current.isCheck()) playSound("check", mu);
          else if (m.flags.includes("c")) playSound("capture", mu);
          else playSound("move", mu);
        }
      }, 600);
    }
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (result !== "wrong" && lastMove && lastMoveSide) {
    Object.assign(squareStyles, squareStylesForLastMove(lastMove[0], lastMove[1], lastMoveSide));
  }
  if (result === "wrong" && wrongSquares) {
    squareStyles[wrongSquares[0]] = { backgroundColor: "rgba(239, 68, 68, 0.5)" };
    squareStyles[wrongSquares[1]] = { backgroundColor: "rgba(239, 68, 68, 0.5)" };
  }

  const innerBoardShadow =
    result === "wrong"
      ? "0 0 0 2px rgba(239, 68, 68, 0.4)"
      : "0 0 0 1px rgba(0,0,0,0.08)";

  const title   = "title" in puzzle ? puzzle.title : `Puzzle #${(puzzle as LibraryPuzzle).id}`;
  const level   = puzzle.level;
  const themes  = isLibrary ? (puzzle as LibraryPuzzle).themes : [];

  // ── Progressive hints (theme-derived) ──────────────────────────────────
  // Level 1: motif name. Level 2: piece + origin. Level 3: file/rank hint.
  // After level 3, the button becomes "Show solution".
  const playerSolutionUci = solMoves[moveIdx] ?? solMoves[0] ?? "";
  const playerSolutionFen = useMemo(() => {
    try {
      const b = new Chess(puzzle.fen);
      // Walk solution moves up to (but not including) the user's current ply.
      for (let i = 0; i < moveIdx && i < solMoves.length; i++) {
        b.move(solMoves[i]);
      }
      return b.fen();
    } catch {
      return puzzle.fen;
    }
  }, [puzzle.fen, moveIdx, solMoves]);

  const builtHints = useMemo<PuzzleHint[]>(() => {
    if (!playerSolutionUci) return [];
    return [
      buildLevel1Hint(themes),
      buildLevel2Hint(playerSolutionFen, playerSolutionUci),
      buildLevel3Hint(playerSolutionFen, playerSolutionUci),
    ];
  }, [themes, playerSolutionFen, playerSolutionUci]);
  const visibleHints = builtHints.slice(0, hintLevel);
  const totalPlayerMoves   = Math.ceil(solMoves.length / 2);
  const currentPlayerMove  = Math.min(Math.floor(moveIdx / 2) + 1, totalPlayerMoves);
  const progressPct        = result === "solved" ? 100 : Math.round((moveIdx / solMoves.length) * 100);

  const puzzleMoveHistoryVerbose = useMemo(
    () => chess.history({ verbose: true }) as Move[],
    [fen],
  );

  const sideToMove = chess.turn();

  return (
    <BoardLayoutShell
      left={
        <>
          {/* Left panel content moved into a fragment so the shared shell can host it. */}
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 items-center gap-1 px-4 pb-1 pt-3 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Back
          </button>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4">
              <div className="flex flex-col gap-3 py-2">
                <SidebarTitle eyebrow="Puzzle" title={title} />

                <SidebarState
                  tone={result === "solved" ? "done" : "user"}
                  label={result === "solved" ? "Solved" : "Your move"}
                  value={
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block shrink-0 rounded-full dark:shadow-none"
                        style={{
                          width: 14,
                          height: 14,
                          boxSizing: "border-box",
                          ...(sideToMove === "w"
                            ? { backgroundColor: "#ffffff", border: "2px solid #27272a" }
                            : { backgroundColor: "#18181b", border: "2px solid #18181b" }),
                        }}
                        aria-label={sideToMove === "w" ? "White to move" : "Black to move"}
                      />
                      <span>
                        Find best move for{" "}
                        <span className="capitalize">{playerColor}</span>
                      </span>
                    </span>
                  }
                />

                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${LEVEL_COLORS[level as PuzzleLevel]}`}>
                      {LEVEL_LABELS[level as PuzzleLevel]}
                    </span>
                    {isLibrary && (
                      <span className="font-mono text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{(puzzle as LibraryPuzzle).rating}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setMuted((m) => !m)}
                      className="ml-auto shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-700/50"
                      title={muted ? "Unmute" : "Mute"}
                    >
                      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                      <span>Move {currentPlayerMove}/{totalPlayerMoves}</span>
                      <span>{progressPct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${result === "solved" ? "bg-emerald-500" : "bg-amber-400"}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {result === "solved" && (
                  <div className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <Crown className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px] font-semibold">Solved!</span>
                  </div>
                )}
                {(result === "wrong" || (wrongExpl && result === "idle")) && (
                  <FeedbackPanel
                    variant="warning"
                    icon={<X className="h-3 w-3" />}
                    title="Not the best move"
                  >
                    {loadingWrong ? (
                      <span className="flex items-center gap-1 opacity-80">
                        <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
                      </span>
                    ) : wrongExpl ? (
                      <p>{wrongExpl}</p>
                    ) : (
                      <p className="opacity-80">Try a stronger threat.</p>
                    )}
                  </FeedbackPanel>
                )}

                {/* Progressive hints — derived from puzzle.themes + solution UCI */}
                {visibleHints.length > 0 && result !== "solved" && (
                  <div className="flex flex-col gap-1.5 rounded-md border border-amber-200/80 bg-amber-50/70 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/25 dark:text-amber-200">
                    {visibleHints.map((h) => (
                      <div key={h.level} className="flex items-start gap-1.5">
                        <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[9px] font-bold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          {h.level}
                        </span>
                        <span className="min-w-0 flex-1">
                          {h.level === 1 ? (
                            <>
                              <span className="font-semibold">Motif: {h.label}</span>
                              {" — "}
                              {h.description}
                            </>
                          ) : (
                            h.text
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Hint / Show solution — progressive button. Stays
                    available after a wrong move so the player can keep
                    learning instead of being forced to give up. */}
                {result !== "solved" && (
                  hintLevel < HINT_MAX_LEVEL ? (
                    <button
                      type="button"
                      onClick={() => setHintLevel((l) => Math.min(HINT_MAX_LEVEL, l + 1))}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 py-2 text-[12px] font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                      Hint ({hintLevel + 1}/{HINT_MAX_LEVEL})
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGiveUp}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-transparent py-2 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                      <Flag className="h-3.5 w-3.5" /> Show solution
                    </button>
                  )
                )}

              </div>
            </div>

            {result === "wrong" && (
              <div className="shrink-0 border-t border-zinc-200/80 px-4 pb-3 pt-3 dark:border-zinc-700/50">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleTryAgain}
                    style={{ backgroundColor: "#769656" }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:brightness-95"
                  >
                    <Undo2 className="h-4 w-4" /> Try again
                  </button>
                  <button
                    type="button"
                    onClick={handleGiveUp}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-transparent py-2.5 text-[13px] font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <Flag className="h-4 w-4" /> Give Up
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      }
      right={
        <>
          <SidebarDominant
            label={result === "solved" ? "Solved" : result === "wrong" ? "Retry" : "Puzzle"}
            value={currentPlayerMove}
            unit={`/ ${totalPlayerMoves} moves`}
          />

          <div className="mt-3">
            <SidebarStatGrid>
              <SidebarStat
                label="Wrong"
                value={wrongAttempts}
                tone={wrongAttempts > 0 ? "danger" : "muted"}
              />
              <SidebarStat label="Progress" value={`${progressPct}%`} tone="accent" />
            </SidebarStatGrid>
          </div>

          {/* Moves — 2-column White / Black grid */}
          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
            <p className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              Moves
            </p>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
              {puzzleMoveHistoryVerbose.length === 0 ? (
                <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
                  Make a move to see the line.
                </p>
              ) : (
                (() => {
                  type Pair = { num: number; white?: Move; black?: Move; wPly?: number; bPly?: number };
                  const pairs: Pair[] = [];
                  let i = 0;
                  let num = 1;
                  if (puzzleMoveHistoryVerbose[0]?.color === "b") {
                    pairs.push({ num, black: puzzleMoveHistoryVerbose[0], bPly: 0 });
                    i = 1;
                    num++;
                  }
                  while (i < puzzleMoveHistoryVerbose.length) {
                    const w = puzzleMoveHistoryVerbose[i];
                    const b = puzzleMoveHistoryVerbose[i + 1];
                    pairs.push({
                      num,
                      white: w,
                      black: b,
                      wPly: i,
                      bPly: b ? i + 1 : undefined,
                    });
                    i += 2;
                    num++;
                  }
                  const lastPly = puzzleMoveHistoryVerbose.length - 1;
                  return (
                    <div className="grid grid-cols-[1.9rem_1fr_1fr] gap-x-1.5 gap-y-1 font-mono text-[13px] leading-5 tabular-nums">
                      {pairs.map((p) => {
                        const wCurrent = p.wPly === lastPly;
                        const bCurrent = p.bPly === lastPly;
                        return (
                          <React.Fragment key={`mv-${p.num}`}>
                            <span className="text-zinc-400 dark:text-zinc-500">{p.num}.</span>
                            <span
                              className={
                                wCurrent
                                  ? "rounded bg-emerald-100 px-1.5 font-bold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                                  : "px-1.5 font-semibold text-zinc-700 dark:text-zinc-200"
                              }
                            >
                              {p.white?.san ?? ""}
                            </span>
                            <span
                              className={
                                bCurrent
                                  ? "rounded bg-emerald-100 px-1.5 font-bold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                                  : "px-1.5 font-semibold text-zinc-700 dark:text-zinc-200"
                              }
                            >
                              {p.black?.san ?? ""}
                            </span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Themes */}
          {themes.length > 0 && (
            <div className="mt-3 shrink-0 border-t border-zinc-200/80 pt-3 dark:border-zinc-700/50">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                Themes
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {themes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reset + Next puzzle (Next only after solving) */}
          <div className="mt-3 flex shrink-0 gap-1.5">
            <SidebarButton
              variant="secondary"
              onClick={handleReset}
              title="Reset puzzle"
              className={result === "solved" ? "" : "flex-1"}
            >
              <RefreshCw className="h-4 w-4" />
              {result !== "solved" && <span>Reset</span>}
            </SidebarButton>
            {result === "solved" && (
              <button
                type="button"
                disabled={nextPuzzleLoading}
                onClick={async () => {
                  if (onNextPuzzle) {
                    setNextPuzzleLoading(true);
                    try {
                      await onNextPuzzle();
                    } finally {
                      setNextPuzzleLoading(false);
                    }
                  } else {
                    onBack();
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#5d8a4e] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4d7c3f] disabled:opacity-60"
              >
                {nextPuzzleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Next Puzzle
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </>
      }
    >
      {(boardEdge) => (
        <>
          <ChessBoardWrapper
            useViewportSizeFallback={false}
            forcedBoardWidth={boardEdge > 0 ? boardEdge : undefined}
            fixedEdgeNotation={false}
            className={`shrink-0 overflow-hidden ${boardShake ? "puzzle-board-shake" : ""}`}
            options={{
              position: fen,
              onPieceDrop: ({ sourceSquare, targetSquare }) => {
                clearPuzzleSelection();
                return onDrop(sourceSquare, targetSquare ?? "");
              },
              boardOrientation: playerColor,
              allowDragging: result !== "solved",
              allowDrawingArrows: false,
              clearArrowsOnPositionChange: false,
              arrows: moveArrows,
              arrowOptions: {
                ...defaultArrowOptions,
                opacity: 0.4,
                activeOpacity: 0.4,
                arrowWidthDenominator: 12,
                arrowLengthReducerDenominator: 2,
              },
              boardStyle: {
                boxShadow:
                  result === "solved"
                    ? innerBoardShadow
                    : `${innerBoardShadow}, ${
                        playerColor === "white"
                          ? "inset 0 -4px 0 0 rgba(255,255,255,0.95), 0 6px 18px -6px rgba(255,255,255,0.5)"
                          : "inset 0 -4px 0 0 rgba(0,0,0,0.85), 0 6px 18px -6px rgba(0,0,0,0.45)"
                      }`,
                transition: "box-shadow 0.2s",
                borderRadius: 0,
                border: "none",
              },
              squareStyles: { ...squareStyles, ...puzzleLegalStyles },
              ...puzzleLegalHandlers,
            }}
          />
          {/* Turn indicator — pulsing corner badge over the board's bottom-left */}
          {result !== "solved" && (
            <div
              className="puzzle-turn-pulse pointer-events-none absolute bottom-1.5 left-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white dark:ring-zinc-900"
              style={{
                backgroundColor: playerColor === "white" ? "#ffffff" : "#1a1a1a",
                border: playerColor === "white" ? "1px solid #94a3b8" : "1px solid #000000",
              }}
              title={`${playerColor === "white" ? "White" : "Black"} to move`}
              aria-label={`${playerColor === "white" ? "White" : "Black"} to move`}
            />
          )}
        </>
      )}
    </BoardLayoutShell>
  );
}

