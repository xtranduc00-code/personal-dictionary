"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { toast } from "react-toastify";
import {
  ArrowLeft, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Crown, Flag,
  History, LibraryBig, Lightbulb, Loader2, MessageSquare, Mic, MicOff, Pause, Play,
  RefreshCw, Send, Square, Star, Swords, Trophy, Undo2, Users, Volume2, VolumeX, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authFetch, useAuth } from "@/lib/auth-context";
import { incrementChessPuzzleCounter } from "@/components/daily-tasks/daily-tasks-auto-detect";
import { supabase } from "@/lib/supabase";
import { createChessGame, getChessGame, joinChessGame, updateChessGame, type ChessGame } from "@/lib/chess-storage";
import { useMeetCall } from "@/lib/meet-call-context";
import { BUILT_IN_PUZZLES, type BuiltInPuzzle } from "@/lib/chess-puzzles-data";
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

export type PuzzleSort = "newest" | "rating_asc" | "rating_desc";

/** Snapshot of puzzle list position for "Next puzzle" without losing filters across routes. */
export type LibraryPuzzleNav = {
  level: PuzzleLevel;
  theme: string;
  q: string;
  sort: PuzzleSort;
  page: number;
  index: number;
  pageItems: LibraryPuzzle[];
  total: number;
};

const PUZZLE_NAV_STORAGE_KEY = "ken_chess_puzzle_library_nav";
const CHESS_OPEN_STORAGE_KEY = "ken_chess_open";
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
    return JSON.parse(raw) as LibraryPuzzleNav;
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
function puzzleTagAccentClasses(theme: string): string {
  const t = theme.toLowerCase();
  if (t.includes("mate")) {
    return "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300";
  }
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
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

export function ChessWorkspace({ initialLibraryPuzzleId, initialRoom }: { initialLibraryPuzzleId?: string; initialRoom?: ChessGame } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [mode, setMode]           = useState<Mode>(() => (initialRoom ? "play-game" : initialLibraryPuzzleId ? "puzzle-solve" : "home"));
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
      if (nav.theme) params.set("theme", nav.theme);
      if (nav.q) params.set("q", nav.q);

      const res = await fetch(`/api/chess/puzzles/library?${params}`);
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
    if (initialLibraryPuzzleId) return;
    try {
      const o = sessionStorage.getItem(CHESS_OPEN_STORAGE_KEY);
      if (o === "puzzles") {
        setMode("puzzles");
        sessionStorage.removeItem(CHESS_OPEN_STORAGE_KEY);
      }
    } catch { /* ignore */ }
  }, [initialLibraryPuzzleId]);

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
        const res = await fetch(
          `/api/chess/puzzles/by-id?id=${encodeURIComponent(initialLibraryPuzzleId)}`,
        );
        const data = (await res.json()) as { puzzle?: LibraryPuzzle; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Puzzle not found");
        if (cancelled) return;

        const p = data.puzzle!;
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
            onPuzzles={() => setMode("puzzles")}
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
            onBack={goHome}
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
              try {
                sessionStorage.setItem(CHESS_OPEN_STORAGE_KEY, "puzzles");
              } catch { /* ignore */ }
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
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
      {children}
    </p>
  );
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

  const secondary = [
    {
      label: "Play with Friend",
      sub: "Create or join a room · voice optional",
      icon: Users,
      accent: "emerald" as const,
      onClick: onPlay,
    },
    {
      label: "Opening Trainer",
      sub: "Lichess tree · explore & practice",
      icon: Crown,
      accent: "emerald" as const,
      onClick: onOpenings,
    },
    {
      label: "Endgame Trainer",
      sub: "15 lessons · tablebase-backed",
      icon: Swords,
      accent: "rose" as const,
      onClick: onEndgames,
    },
  ];

  const library = [
    {
      label: "Opening Repertoire",
      sub: "Your personal lines",
      icon: LibraryBig,
      accent: "teal" as const,
      href: "/chess/repertoire" as const,
    },
    {
      label: "Game History",
      sub: "Past games & review",
      icon: History,
      accent: "sky" as const,
      href: "/chess/history" as const,
    },
  ];

  /** Avoid duplicating “puzzles” when we already show Continue puzzle. */
  const showResumeSession = Boolean(
    lastActivity && !(resumePuzzleId && lastActivity.mode === "puzzles"),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/*
        Single inset panel: matches sidebar “card row” language (border, white surface, soft shadow)
        instead of a full-bleed marketing background + grid texture.
        Sized to fit the viewport in one screen — no inner scroll.
      */}
      <div
        className="mx-auto flex w-full flex-1 min-h-0 flex-col pb-3 pt-0 sm:pb-4"
        style={{ maxWidth: 1200 }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
          {resumePuzzleId || (showResumeSession && lastActivity) ? (
            <section>
              <HomeSectionLabel>Pick up</HomeSectionLabel>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {resumePuzzleId ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/chess/puzzles/${encodeURIComponent(resumePuzzleId)}`)}
                    className="group flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:hover:border-emerald-700 sm:w-auto sm:min-w-[240px]"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white dark:bg-emerald-500">
                        <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          Continue puzzle
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Same list · filters</span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-emerald-500 transition group-hover:translate-x-0.5 dark:text-emerald-400" aria-hidden />
                  </button>
                ) : null}
                {showResumeSession && lastActivity ? (
                  <button
                    type="button"
                    onClick={resumeLastSession}
                    className="group flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3.5 py-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-600 sm:w-auto sm:min-w-[220px]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Resume last session
                      </span>
                      <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {HOME_LAST_ACTIVITY_LABELS[lastActivity.mode]}
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {formatChessRelativeTime(lastActivity.at)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="flex min-h-0 flex-[2] flex-col">
            <HomeSectionLabel>Main</HomeSectionLabel>
            <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch">
              <button
                type="button"
                onClick={onPuzzles}
                className="group flex flex-1 flex-col justify-between rounded-xl border border-zinc-200 border-l-[3px] border-l-amber-500 bg-gradient-to-br from-amber-50/80 via-white to-white p-5 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-700 dark:border-l-amber-500 dark:from-amber-950/25 dark:via-zinc-900 dark:to-zinc-900"
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
                      Puzzles
                    </p>
                    <p className="mt-2 max-w-md text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                      Lichess library — levels, themes, thousands of positions.
                    </p>
                  </div>
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${HOME_ICON_SHELL.amber.shell}`}
                  >
                    <BookOpen className={`h-5 w-5 ${HOME_ICON_SHELL.amber.icon}`} aria-hidden />
                  </div>
                </div>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Open library
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </button>

              <button
                type="button"
                onClick={onRush}
                className="group flex w-full shrink-0 flex-col justify-between rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-4 text-left shadow-sm transition hover:border-zinc-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80 lg:w-[min(100%,260px)]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${HOME_ICON_SHELL.orange.shell}`}
                  >
                    <Zap className={`h-5 w-5 ${HOME_ICON_SHELL.orange.icon}`} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Puzzle Rush</p>
                    <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                      Timed · 3 lives or relaxed
                    </p>
                  </div>
                </div>
                <span className="mt-3 text-xs font-semibold text-orange-700 dark:text-orange-400">
                  Start run →
                </span>
              </button>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <HomeSectionLabel>Play &amp; study</HomeSectionLabel>
            <div className="grid min-h-0 flex-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {secondary.map(({ label, sub, icon: Icon, accent, onClick }) => {
                const shell = HOME_ICON_SHELL[accent];
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    className="group flex h-full items-center gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/40 px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/30 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60"
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${shell.shell}`}
                    >
                      <Icon className={`h-5 w-5 ${shell.icon}`} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
                      <p className="mt-0.5 text-xs leading-snug text-zinc-500 dark:text-zinc-400">{sub}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 dark:group-hover:text-zinc-300" aria-hidden />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <HomeSectionLabel>Library</HomeSectionLabel>
            <div className="grid min-h-0 flex-1 gap-2.5 sm:grid-cols-2">
              {library.map(({ label, sub, icon: Icon, accent, href }) => {
                const shell = HOME_ICON_SHELL[accent];
                return (
                  <Link
                    key={href}
                    href={href}
                    className="group flex h-full items-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/30 px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/20 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/40"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${shell.shell}`}
                    >
                      <Icon className={`h-4 w-4 ${shell.icon}`} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{label}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
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

const THEMES_POPULAR = [
  "fork", "pin", "skewer", "discoveredAttack", "backRankMate",
  "hangingPiece", "sacrifice", "deflection", "decoy", "quietMove",
];

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

type PuzzleProgressFilter = "all" | "unsolved" | "solved";

function PuzzleLibrary({ onBack, onSolve }: { onBack: () => void; onSolve: (p: LibraryPuzzle, nav: LibraryPuzzleNav) => void }) {
  const { user } = useAuth();
  const levels: PuzzleLevel[]  = ["beginner", "intermediate", "hard", "expert"];
  const [activeLevel, setActiveLevel] = useState<PuzzleLevel>("beginner");
  const [theme, setTheme]             = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort]               = useState<PuzzleSort>("newest");
  const [progressFilter, setProgressFilter] = useState<PuzzleProgressFilter>("all");
  const [page, setPage]               = useState(1);
  const [puzzles, setPuzzles]         = useState<LibraryPuzzle[]>([]);
  const [total, setTotal]             = useState(0);
  const [levelGrandTotal, setLevelGrandTotal] = useState(500);
  const [solvedCount, setSolvedCount] = useState(0);
  const [solvedIds, setSolvedIds]     = useState<Set<string>>(() => new Set());
  const [loading, setLoading]         = useState(false);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchEpochRef = useRef(0);

  useEffect(() => {
    if (!user && progressFilter !== "all") setProgressFilter("all");
  }, [user, progressFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(
    async (
      lvl: PuzzleLevel,
      th: string,
      q: string,
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
          progress: user ? progress : "all",
        });
        if (th) params.set("theme", th);
        if (q) params.set("q", q);
        const res = await authFetch(`/api/chess/puzzles/library?${params}`, { signal: ctrl.signal });
        const data = await res.json() as {
          items: LibraryPuzzle[];
          total: number;
          error?: string;
          levelGrandTotal?: number;
          solvedCount?: number;
          solvedPuzzleIds?: string[];
        };
        if (ctrl.signal.aborted || epoch !== fetchEpochRef.current) return;

        if (!res.ok) {
          setLoadError(data.error ?? "Could not load puzzles.");
          setTotal(0);
          return;
        }

        const filtered = data.items.filter((p) => p.level === lvl);
        setPuzzles(filtered);
        setTotal(data.total);
        if (typeof data.levelGrandTotal === "number") setLevelGrandTotal(data.levelGrandTotal);
        if (user && typeof data.solvedCount === "number") setSolvedCount(data.solvedCount);
        if (user && Array.isArray(data.solvedPuzzleIds)) setSolvedIds(new Set(data.solvedPuzzleIds));
        if (!user) {
          setSolvedCount(0);
          setSolvedIds(new Set());
        }
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

  const filterRef = useRef<{
    activeLevel: PuzzleLevel;
    theme: string;
    debouncedSearch: string;
    sort: PuzzleSort;
    progressFilter: PuzzleProgressFilter;
  } | null>(null);
  useEffect(() => {
    const prev = filterRef.current;
    const filtersChanged =
      prev === null ||
      prev.activeLevel !== activeLevel ||
      prev.theme !== theme ||
      prev.debouncedSearch !== debouncedSearch ||
      prev.sort !== sort ||
      prev.progressFilter !== progressFilter;

    if (filtersChanged && page !== 1) {
      setPage(1);
      return;
    }

    filterRef.current = { activeLevel, theme, debouncedSearch, sort, progressFilter };
    void load(activeLevel, theme, debouncedSearch, sort, page, user ? progressFilter : "all");
  }, [activeLevel, theme, debouncedSearch, sort, progressFilter, page, load, user]);

  useEffect(() => {
    if (total <= 0) return;
    const tp = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
    if (page > tp) setPage(tp);
  }, [total, page]);

  const totalPages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE) || 1);
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * LIBRARY_PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(safePage * LIBRARY_PAGE_SIZE, total);
  const visiblePages = puzzleVisiblePages(safePage, totalPages);

  const levelCounts: Record<PuzzleLevel, number> = { beginner: 500, intermediate: 500, hard: 500, expert: 500 };

  return (
    <div className="flex flex-1 flex-col">
      {/* Back + Level tabs */}
      <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        <button type="button" onClick={onBack} className="shrink-0 pl-4 pr-2 py-3 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {levels.map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => {
              setActiveLevel(lvl);
              setPage(1);
            }}
            className={`relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium transition ${
              activeLevel === lvl ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            {LEVEL_LABELS[lvl]}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_COLORS[lvl]}`}>{levelCounts[lvl]}</span>
            {activeLevel === lvl && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-zinc-900 dark:bg-zinc-100" />}
          </button>
        ))}
      </div>

      {user && levelGrandTotal > 0 && (
        <div className="border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <span>
              {solvedCount} / {levelGrandTotal} {LEVEL_LABELS[activeLevel]} puzzles solved
            </span>
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
              {Math.min(100, Math.round((solvedCount / levelGrandTotal) * 1000) / 10)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((solvedCount / levelGrandTotal) * 1000) / 10)}%` }}
            />
          </div>
        </div>
      )}

      {/* Theme filter */}
      <div className="flex gap-1.5 overflow-x-auto px-4 py-2">
        <button
          type="button"
          onClick={() => {
            setTheme("");
            setPage(1);
          }}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${!theme ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}
        >
          All themes
        </button>
        {THEMES_POPULAR.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTheme(theme === t ? "" : t);
              setPage(1);
            }}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${theme === t ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search + progress filter + sort */}
      <div className="flex flex-col gap-2 px-4 pb-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <label className="sr-only" htmlFor="puzzle-library-search">
          Search puzzles
        </label>
        <input
          id="puzzle-library-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by ID (#003YF) or theme keyword…"
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
          autoComplete="off"
        />
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/80">
          {(["all", "unsolved", "solved"] as const).map((pf) => (
            <button
              key={pf}
              type="button"
              disabled={!user && pf !== "all"}
              title={!user && pf !== "all" ? "Sign in to filter by progress" : undefined}
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
          <option value="newest">Newest</option>
          <option value="rating_asc">Rating (low → high)</option>
          <option value="rating_desc">Rating (high → low)</option>
        </select>
      </div>

      <p className="px-4 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
        {loading && total === 0
          ? "Loading…"
          : total === 0
            ? "No puzzles match your filters."
            : `Showing ${rangeStart}–${rangeEnd} of ${total} puzzle${total === 1 ? "" : "s"}${
                user ? ` (${solvedCount} solved)` : ""
              }`}
      </p>

      {loadError && (
        <div className="mx-4 flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-900/40 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              void load(activeLevel, theme, debouncedSearch, sort, 1, user ? progressFilter : "all");
            }}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Grid — single column on narrow phones */}
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {puzzles.map((p, i) => (
          <div
            key={p.id}
            className={`group flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-700 dark:bg-zinc-900 ${
              user && solvedIds.has(p.id) ? "opacity-70" : ""
            }`}
          >
            <div className="flex justify-center pb-1">
              <PuzzleMiniBoard fen={p.fen} size={120} />
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[p.level]}`}>
                  {LEVEL_LABELS[p.level]}
                </span>
                <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                  {p.rating}
                </p>
              </div>
              <div className="relative shrink-0 pt-0.5">
                {user && solvedIds.has(p.id) && (
                  <span
                    className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white dark:ring-zinc-900"
                    aria-label="Solved"
                  >
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                )}
                <span className="block text-[10px] text-zinc-300 dark:text-zinc-600">#{p.id}</span>
              </div>
            </div>
            {p.themes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {p.themes.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${puzzleTagAccentClasses(t)}`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                onSolve(p, {
                  level: activeLevel,
                  theme,
                  q: debouncedSearch,
                  sort,
                  page: safePage,
                  index: i,
                  pageItems: [...puzzles],
                  total,
                })
              }
              className="mt-auto flex items-center justify-center gap-1.5 rounded-xl bg-[#5d8a4e] py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4d7c3f]"
            >
              <span aria-hidden className="text-base leading-none">♞</span> Solve
            </button>
          </div>
        ))}
        {loading &&
          puzzles.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="mx-auto h-[120px] w-[120px] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mt-auto h-9 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" />
            </div>
          ))}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col items-center gap-3 border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <div className="flex w-full max-w-md items-center justify-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
              {visiblePages.map((item, idx) =>
                item === "gap" ? (
                  <span key={`g-${idx}`} className="px-1 text-zinc-400">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    disabled={loading}
                    onClick={() => setPage(item)}
                    className={`min-w-[2.25rem] rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                      item === safePage
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              disabled={safePage >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="text-center text-xs text-zinc-400 md:hidden">
            Page {safePage} of {totalPages}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Theme → human-readable description ──────────────────────────────────────

const THEME_DESC: Record<string, string> = {
  fork:              "A single piece attacks two of the opponent's pieces at the same time.",
  pin:               "A piece can't move because it would expose a more valuable piece behind it.",
  skewer:            "A high-value piece is attacked, and moving it reveals a lesser piece to be captured.",
  discoveredAttack:  "Moving one piece unmasks an attack from a different piece hiding behind it.",
  backRankMate:      "The king is stuck on its back rank with no escape — a rook or queen can deliver checkmate.",
  hangingPiece:      "An undefended piece can be captured for free with no recapture threat.",
  sacrifice:         "Giving up material (like a bishop or rook) to create a devastating follow-up.",
  deflection:        "A defending piece is lured or forced away from the square it's protecting.",
  decoy:             "The opponent's piece is drawn to a bad square where it can be exploited.",
  quietMove:         "A non-capture, non-check move that sets up an unstoppable threat.",
  mateIn1:           "There's one move that delivers immediate checkmate.",
  mateIn2:           "A two-move combination forces checkmate no matter how the opponent responds.",
  mateIn3:           "A three-move forced sequence leading to checkmate.",
  crushing:          "Look for a forcing tactic using your pieces against the opponent's king or a loose target — name a file, rank, or diagonal you can exploit.",
  trappedPiece:      "A piece has no safe squares to move — it's about to be captured.",
  advancedPawn:      "A passed pawn close to promotion creates a decisive threat.",
  exposedKing:       "The opponent's king is in an open position, vulnerable to attack.",
  xRayAttack:        "A piece attacks through another piece to hit a target behind it.",
  zwischenzug:       "An 'in-between' move that ignores the expected response to create a bigger threat.",
  zugzwang:          "The opponent is in a position where any move they make worsens their situation.",
};

function themeToHint(themes: string[]): string {
  for (const t of themes) {
    if (THEME_DESC[t]) return THEME_DESC[t];
  }
  return themes.length > 0
    ? `Look for a ${themes[0].replace(/([A-Z])/g, " $1").toLowerCase()} tactic.`
    : "Look for a forcing move that creates multiple threats.";
}

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
  const [showHint, setShowHint]           = useState(false);
  const [aiHint, setAiHint]               = useState("");
  const [loadingHint, setLoadingHint]     = useState(false);
  const hintReqRef = useRef(0);
  const [lastMove, setLastMove]           = useState<[string, string] | null>(null);
  const [wrongSquares, setWrongSquares]   = useState<[string, string] | null>(null);
  const [wrongExpl, setWrongExpl]         = useState("");
  const [wrongHint, setWrongHint]         = useState("");
  const [loadingWrong, setLoadingWrong]   = useState(false);
  const [explanation, setExplanation]     = useState("");
  const [loadingExpl, setLoadingExpl]     = useState(false);
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

  // Inactivity hint — surfaces a tip after 10s without a move so the player
  // doesn't sit staring at an empty panel.
  const [inactivityHintVisible, setInactivityHintVisible] = useState(false);
  useEffect(() => {
    setInactivityHintVisible(false);
    if (result === "solved") return;
    const t = setTimeout(() => setInactivityHintVisible(true), 10_000);
    return () => clearTimeout(t);
  }, [puzzle.fen, fen, result]);
  // TTS
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused]     = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
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

  // Fetch AI explanation after solving
  async function fetchExplanation() {
    setLoadingExpl(true);
    try {
      const res = await fetch("/api/chess/puzzles/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode:   "solve",
          fen:    puzzle.fen,
          moves:  isLibrary ? (puzzle as LibraryPuzzle).moves : solMoves,
          themes: isLibrary ? (puzzle as LibraryPuzzle).themes : [],
          level:  puzzle.level,
          rating: isLibrary ? (puzzle as LibraryPuzzle).rating : undefined,
        }),
      });
      const data = await res.json() as { explanation: string };
      setExplanation(data.explanation ?? "");
    } finally {
      setLoadingExpl(false);
    }
  }

  // Fetch wrong-move explanation from AI (non-blocking)
  async function fetchWrongExplanation(currentFen: string, wrongMove: string, attempt: number) {
    const requestId = ++wrongExplGenRef.current;
    setLoadingWrong(true);
    setWrongExpl("");
    setWrongHint("");
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
      setWrongHint(data.hint ?? "");
    } finally {
      if (requestId === wrongExplGenRef.current) setLoadingWrong(false);
    }
  }

  // ── TTS helpers ──────────────────────────────────────────────────────────
  function speakText(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.1;
    utter.pitch = 1.0;
    utter.lang  = "en-US";
    utter.onstart = () => { setSpeaking(true); setPaused(false); };
    utter.onend   = () => { setSpeaking(false); setPaused(false); };
    utter.onerror  = () => { setSpeaking(false); setPaused(false); };
    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
  }

  function pauseResumeSpeech() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (paused) { window.speechSynthesis.resume(); setPaused(false); }
    else        { window.speechSynthesis.pause();  setPaused(true);  }
  }

  function stopSpeech() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setPaused(false);
  }

  const libraryPuzzleId = isLibrary ? (puzzle as LibraryPuzzle).id : "";
  const libraryThemes = isLibrary ? (puzzle as LibraryPuzzle).themes : [];
  const libraryThemesKey = libraryThemes.join("\0");

  useEffect(() => {
    libraryWrongAttemptsRef.current = 0;
  }, [isLibrary, libraryPuzzleId]);

  async function recordLibraryProgressIfNeeded(attempts: number) {
    if (!isLibrary) return;
    const p = puzzle as LibraryPuzzle;
    await authFetch("/api/chess/puzzles/library/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId: p.id, level: p.level, attempts }),
    }).catch(() => {});
  }

  // Position-specific hint (library puzzles) when hint panel is visible
  useEffect(() => {
    if (!showHint || result === "solved") return;
    const builtInHintLocal = "hint" in puzzle ? (puzzle as BuiltInPuzzle).hint : "";
    if (builtInHintLocal || !isLibrary) return;

    let cancelled = false;
    const requestId = ++hintReqRef.current;
    setLoadingHint(true);
    setAiHint("");

    void (async () => {
      try {
        const res = await fetch("/api/chess/puzzles/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode:          "position_hint",
            fen,
            themes:        libraryThemes,
            level:         puzzle.level,
            studentColor:  playerColor,
          }),
        });
        const data = await res.json() as { explanation?: string };
        if (cancelled || requestId !== hintReqRef.current) return;
        setAiHint((data.explanation ?? "").trim());
      } finally {
        if (!cancelled && requestId === hintReqRef.current) setLoadingHint(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showHint, fen, moveIdx, result, isLibrary, libraryPuzzleId, libraryThemesKey, playerColor, puzzle.level]);

  // Auto-speak when explanation arrives (respect mute)
  useEffect(() => {
    if (explanation && result === "solved" && !muted) {
      speakText(explanation);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanation]);

  // Stop speech when muted or on unmount
  useEffect(() => {
    if (muted) stopSpeech();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  useEffect(() => () => stopSpeech(), []);

  // ── Legal move indicators + click-to-move ─────────────────────────────────
  const { legalMoveStyles: puzzleLegalStyles, handlers: puzzleLegalHandlers, clearSelection: clearPuzzleSelection } = useChessLegalMoves(chessRef, onDrop, result !== "solved");

  function onDrop(sourceSquare: string, targetSquare: string): boolean {
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
      setShowHint(true);
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
    setWrongHint("");
    setResult("idle");

    const nextIdx = moveIdx + 1;
    setMoveIdx(nextIdx);

    if (nextIdx >= solMoves.length) {
      setResult("solved");
      playSound("notify", muted);
      fetchExplanation();
      void recordLibraryProgressIfNeeded(libraryWrongAttemptsRef.current + 1);
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
    setWrongHint("");
    setShowHint(false);
    setAiHint("");
    const f = chessRef.current.fen();
    setFen(f);
    fenBeforeDropRef.current = f;
  }

  /**
   * Reveal the full solution: replays remaining solMoves on the board with a
   * 500ms delay between plies, then triggers the solved state so the
   * "Why this works" explanation and Next Puzzle button appear.
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
    setWrongHint("");
    setShowHint(false);
    setMoveArrows([]);
    setResult("idle");

    // Resync chess.js to the FEN before the user's wrong drop, in case it drifted.
    chessRef.current.load(fenBeforeDropRef.current);
    setFen(fenBeforeDropRef.current);

    const playOne = (idx: number) => {
      if (idx >= solMoves.length) {
        // Done — flip to solved state.
        setResult("solved");
        playSound("notify", mutedRef.current);
        fetchExplanation();
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
    stopSpeech();
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
    setShowHint(false);
    setAiHint("");
    setLastMove(null);
    setLastMoveSide(null);
    setWrongSquares(null);
    setWrongExpl("");
    setWrongHint("");
    setExplanation("");
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
  const builtInHint = "hint" in puzzle ? (puzzle as BuiltInPuzzle).hint : "";
  const hintText =
    wrongHint || builtInHint || (isLibrary ? (aiHint || (loadingHint ? "" : themeToHint(themes))) : themeToHint(themes));
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

                {result === "solved" && (
                  <div className="rounded-md border border-zinc-200/90 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="mb-1 flex items-center gap-1">
                      <BookOpen className="h-3 w-3 text-zinc-400" />
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">Why this works</p>
                      <div className="ml-auto flex items-center gap-px">
                        {speaking ? (
                          <>
                            <button onClick={pauseResumeSpeech} title={paused ? "Resume" : "Pause"} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800">
                              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                            </button>
                            <button onClick={stopSpeech} title="Stop" className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800">
                              <Square className="h-3 w-3" />
                            </button>
                          </>
                        ) : explanation && !loadingExpl ? (
                          <button onClick={() => speakText(explanation)} title="Read aloud" className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800">
                            <Volume2 className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {loadingExpl ? (
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
                      </div>
                    ) : explanation ? (
                      <p className="text-[10px] leading-snug text-zinc-700 dark:text-zinc-300 sm:text-[11px] sm:leading-relaxed">{explanation}</p>
                    ) : (
                      <p className="text-[10px] text-zinc-400">Solution: <span className="font-mono">{solMoves.join(" ")}</span></p>
                    )}
                  </div>
                )}

                {/* Inactivity hint — appears after 10s without a move while idle */}
                {inactivityHintVisible && result !== "solved" && result !== "wrong" && (
                  <div className="rounded-md border border-amber-200/80 bg-amber-50/70 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/25 dark:text-amber-300">
                    <p className="flex items-start gap-1.5">
                      <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      <span>{hintText || themeToHint(themes)}</span>
                    </p>
                  </div>
                )}

                {/* Give Up — always available during play (not when solved) */}
                {result !== "solved" && result !== "wrong" && (
                  <button
                    type="button"
                    onClick={handleGiveUp}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-transparent py-2 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <Flag className="h-3.5 w-3.5" /> Show solution
                  </button>
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
                  stopSpeech();
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

