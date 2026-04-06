"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { toast } from "react-toastify";
import {
  ArrowLeft, BookOpen, Check, ChevronRight, Copy, Crown, Flag,
  History, LibraryBig, Lightbulb, Loader2, MessageSquare, Mic, MicOff, Pause, Play,
  RefreshCw, Send, Square, Swords, Trophy, Users, Volume2, VolumeX, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { createChessGame, joinChessGame, updateChessGame, type ChessGame } from "@/lib/chess-storage";
import { BUILT_IN_PUZZLES, type BuiltInPuzzle } from "@/lib/chess-puzzles-data";
import { GameReview } from "./game-review";
import { OpeningTrainer } from "./opening-trainer";
import { EndgameTrainer } from "./endgame-trainer";
import { PuzzleRush } from "./puzzle-rush";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false, loading: () => <div className="aspect-square w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" /> },
);

// ─── Types ────────────────────────────────────────────────────────────────────

type PuzzleLevel = "beginner" | "intermediate" | "hard" | "expert";
type Mode = "home" | "play-lobby" | "play-game" | "puzzles" | "puzzle-solve" | "game-review" | "opening-trainer" | "endgame-trainer" | "puzzle-rush";

export type LibraryPuzzle = {
  id: string; fen: string; moves: string[];
  rating: number; themes: string[]; level: PuzzleLevel;
};

type TimeControl = { label: string; mins: number; inc: number };

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

const TIME_CONTROLS_POPULAR: TimeControl[] = [
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
function playSound(type: "move" | "capture" | "check" | "castle" | "notify", muted: boolean) {
  if (muted || typeof window === "undefined") return;
  const src = `/sounds/chess/${type}.mp3`;
  let el = audioCache.get(type);
  if (!el) { el = new Audio(src); audioCache.set(type, el); }
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

export default function ChessPage() {
  const { user } = useAuth();
  const [mode, setMode]           = useState<Mode>("home");
  const [game, setGame]           = useState<ChessGame | null>(null);
  const [createdGame, setCreatedGame] = useState<ChessGame | null>(null); // waiting in lobby
  const [joinCode, setJoinCode]   = useState("");
  const [joining, setJoining]     = useState(false);
  const [creating, setCreating]   = useState(false);
  const [tc, setTc]               = useState<TimeControl>(TIME_CONTROLS_POPULAR[2]); // Blitz 5+0
  const [color, setColor]         = useState<"white" | "black" | "random">("random");
  const [activePuzzle, setActivePuzzle] = useState<LibraryPuzzle | BuiltInPuzzle | null>(null);
  const [reviewPgn, setReviewPgn]         = useState("");
  const [reviewGameId, setReviewGameId]   = useState<string | undefined>(undefined);
  const [reviewPlayers, setReviewPlayers] = useState<{ white: string; black: string }>({ white: "White", black: "Black" });

  async function handleCreateGame() {
    setCreating(true);
    try {
      const g = await createChessGame();
      setCreatedGame(g); // show code inline, don't navigate yet
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
      const g = await joinChessGame(code);
      setGame(g);
      setMode("play-game");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Game not found"); }
    finally { setJoining(false); }
  }

  function goHome() { setMode("home"); setGame(null); setCreatedGame(null); }

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-5 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        {mode !== "home" && (
          <button onClick={goHome} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{headerTitle}</span>
      </div>

      <div className="flex flex-1 flex-col">
        {mode === "home" && (
          <HomeView
            onPlay={() => setMode("play-lobby")}
            onPuzzles={() => setMode("puzzles")}
            onOpenings={() => setMode("opening-trainer")}
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
          <PuzzleLibrary onSolve={(p) => { setActivePuzzle(p); setMode("puzzle-solve"); }} />
        )}
        {mode === "puzzle-solve" && activePuzzle && (
          <PuzzleSolve puzzle={activePuzzle} onBack={() => { setMode("puzzles"); setActivePuzzle(null); }} />
        )}
        {mode === "opening-trainer" && <OpeningTrainer />}
        {mode === "endgame-trainer" && <EndgameTrainer />}
        {mode === "puzzle-rush" && <PuzzleRush />}
      </div>
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────

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
  const cards = [
    { label: "Play with Friend", sub: "Create or join a room", icon: Users, color: "emerald", action: onPlay, href: null },
    { label: "Puzzles", sub: "2000+ Lichess puzzles · 4 levels", icon: BookOpen, color: "amber", action: onPuzzles, href: null },
    { label: "Puzzle Rush", sub: "3 lives · solve as many as you can!", icon: Zap, color: "orange", action: onRush, href: null },
    { label: "Opening Trainer", sub: "Explore & practice openings with Lichess data", icon: Crown, color: "violet", action: onOpenings, href: null },
    { label: "Endgame Trainer", sub: "15 lessons · Beginner to Expert · tablebase-validated", icon: Swords, color: "rose", action: onEndgames, href: null },
    { label: "Opening Repertoire", sub: "Build & drill your personal opening lines", icon: LibraryBig, color: "teal", action: null, href: "/chess/repertoire" },
    { label: "Game History", sub: "Review past games and track progress", icon: History, color: "sky", action: null, href: "/chess/history" },
  ] as const;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="grid w-full max-w-sm gap-4">
        {cards.map(({ label, sub, icon: Icon, color, action, href }) => {
          const inner = (
            <>
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-${color}-100 dark:bg-${color}-900/30`}>
                <Icon className={`h-6 w-6 text-${color}-600 dark:text-${color}-400`} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
                <p className="text-sm text-zinc-500">{sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
            </>
          );
          const cls = "group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600";
          return href
            ? <Link key={label} href={href} className={cls}>{inner}</Link>
            : <button key={label} onClick={action ?? undefined} className={cls}>{inner}</button>;
        })}
      </div>
    </div>
  );
}

// ─── Play Lobby ───────────────────────────────────────────────────────────────

function PlayLobby({ joinCode, setJoinCode, creating, joining, tc, setTc, color, setColor, createdGame, onCreate, onEnterGame, onJoin }: {
  joinCode: string; setJoinCode: (v: string) => void;
  creating: boolean; joining: boolean;
  tc: TimeControl; setTc: (t: TimeControl) => void;
  color: "white" | "black" | "random"; setColor: (c: "white" | "black" | "random") => void;
  createdGame: ChessGame | null;
  onCreate: () => void;
  onEnterGame: (g: ChessGame) => void;
  onJoin: () => void;
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="w-full max-w-xs space-y-3">

        {/* ── Time control ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">Time Control</p>
          <div className="flex flex-wrap gap-1.5">
            {visibleTCs.map((t) => (
              <button key={t.label} onClick={() => setTc(t)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  tc.label === t.label
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >{t.label}</button>
            ))}
            <button onClick={() => setShowMore((s) => !s)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-400 underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300">
              {showMore ? "Less" : "More…"}
            </button>
          </div>
        </div>

        {/* ── Create ───────────────────────────────────────────────── */}
        {createdGame ? (
          /* Room created — show code inline */
          <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/30">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Room created!</p>
            <p className="mb-3 text-xs text-emerald-700 dark:text-emerald-500">Share this code with your friend, then enter when ready.</p>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-white px-4 py-3 dark:bg-zinc-900">
              <span className="font-mono text-3xl font-bold tracking-[0.25em] text-zinc-900 dark:text-zinc-100">
                {createdGame.roomCode}
              </span>
              <button onClick={() => copyCode(createdGame.roomCode)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                {copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
            <button onClick={() => onEnterGame(createdGame)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700">
              <Swords className="h-4 w-4" /> Enter Game
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="mb-3 font-semibold text-zinc-800 dark:text-zinc-200">Create a new game</p>

            {/* Color picker */}
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">Play as</p>
            <div className="mb-4 grid grid-cols-3 gap-1.5">
              {COLOR_OPTIONS.map(({ value, label, icon }) => (
                <button key={value} onClick={() => setColor(value)}
                  className={`flex flex-col items-center rounded-xl border py-2.5 text-xs font-medium transition ${
                    color === value
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <span className="mb-0.5 text-lg">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            <button onClick={onCreate} disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
              Create Room
            </button>
          </div>
        )}

        {/* ── Join ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-3 font-semibold text-zinc-800 dark:text-zinc-200">Join a game</p>
          <input
            value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && onJoin()}
            placeholder="Room code — e.g. AB3X7Y"
            className="mb-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-lg tracking-widest placeholder:font-sans placeholder:text-sm placeholder:tracking-normal dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            maxLength={6}
          />
          <button onClick={onJoin} disabled={joining || joinCode.length < 4}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2.5 font-semibold text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Join Room
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Clock Component ──────────────────────────────────────────────────────────

function Clock({ ms, active, low }: { ms: number; active: boolean; low: boolean }) {
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
  return (
    <div className={`flex items-center justify-center rounded-xl px-5 py-3 font-mono text-3xl font-bold tabular-nums transition-colors ${
      active
        ? urgent ? "bg-red-500 text-white" : low ? "bg-amber-400 text-white" : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
    }`}>
      {ms === 0 ? "∞" : formatClock(display)}
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ roomCode, myColor }: { roomCode: string; myColor: "white" | "black" | null }) {
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  function send() {
    const t = text.trim();
    if (!t || !myColor) return;
    const msg: ChatMsg = { id: Date.now().toString(), sender: myColor, text: t, ts: Date.now() };
    supabase.channel(`chess-chat:${roomCode}`).send({ type: "broadcast", event: "msg", payload: msg });
    setMsgs((prev) => [...prev, msg]);
    setText("");
  }

  return (
    <div className="flex h-52 flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-1.5 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
        <MessageSquare className="h-3 w-3 text-zinc-400" />
        <span className="text-xs font-semibold text-zinc-400">Chat</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {msgs.length === 0 && (
          <p className="text-center text-xs text-zinc-300 dark:text-zinc-600 mt-4">Say something…</p>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.sender === myColor ? "justify-end" : "justify-start"}`}>
            <span className={`max-w-[80%] rounded-lg px-2.5 py-1 text-xs ${
              m.sender === myColor
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
            }`}>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-1.5 border-t border-zinc-100 p-2 dark:border-zinc-800">
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
        />
        <button onClick={send} className="rounded-lg bg-zinc-900 p-1.5 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Move History ─────────────────────────────────────────────────────────────

function MoveHistory({ pgn }: { pgn: string }) {
  const moves = pgn
    .replace(/\d+\./g, "")
    .replace(/\{[^}]*\}/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const pairs: [string, string | null][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1] ?? null]);
  }

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [pgn]);

  if (pairs.length === 0) return null;

  return (
    <div className="max-h-36 overflow-y-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <p className="sticky top-0 border-b border-zinc-100 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">Moves</p>
      <div className="px-1 py-1">
        {pairs.map(([w, b], i) => (
          <div key={i} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-0.5 rounded px-1 py-0.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <span className="text-[10px] font-medium text-zinc-300 dark:text-zinc-600">{i + 1}.</span>
            <span className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">{w}</span>
            {b && <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{b}</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
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
  const [status, setStatus]         = useState("");
  const [copied, setCopied]         = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [muted, setMuted]           = useState(false);
  const [drawOffer, setDrawOffer]   = useState<"sent" | "received" | null>(null);
  const [rematch, setRematch]       = useState<"sent" | "received" | null>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);

  const startTimeRef = useRef<number | null>(null);

  // ── Responsive board sizing ───────────────────────────────────────────────
  const [boardPx, setBoardPx] = useState(0);
  useEffect(() => {
    function updateBoard() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const HEADER      = 60;   // sticky header
      const PLAYER_ROWS = 80;   // two clock rows (~36px each + gap)
      const V_PAD       = 40;   // top + bottom padding of the flex container
      const PANEL       = vw >= 768 ? 420 : 0;  // right panel + gap (desktop only)
      const H_PAD       = 32;   // horizontal padding
      const byHeight = vh - HEADER - PLAYER_ROWS - V_PAD;
      const byWidth  = vw - PANEL - H_PAD;
      setBoardPx(Math.max(200, Math.min(byHeight, byWidth)));
    }
    updateBoard();
    window.addEventListener("resize", updateBoard);
    return () => window.removeEventListener("resize", updateBoard);
  }, []);

  // Timers — unlimited = 0 means ∞
  const initMs = tc.mins * 60 * 1000;
  const [whiteMs, setWhiteMs] = useState(initMs);
  const [blackMs, setBlackMs] = useState(initMs);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(Date.now());
  const chessRef = useRef(chess);
  chessRef.current = chess;

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
        setGameState((prev) => ({
          ...prev,
          fen:          String(row.fen ?? prev.fen),
          pgn:          String(row.pgn ?? prev.pgn),
          turn:         (row.turn ?? prev.turn) as "w" | "b",
          status:       (row.status ?? prev.status) as ChessGame["status"],
          winner:       (row.winner ?? null) as ChessGame["winner"],
          whiteUserId:  row.white_user_id ? String(row.white_user_id) : prev.whiteUserId,
          blackUserId:  row.black_user_id ? String(row.black_user_id) : prev.blackUserId,
          updatedAt:    String(row.updated_at ?? prev.updatedAt),
        }));
        if (typeof row.fen === "string") {
          // Extract last move from PGN history
          const newChess = new Chess();
          try {
            newChess.loadPgn(typeof row.pgn === "string" ? row.pgn : "");
            const hist = newChess.history({ verbose: true });
            if (hist.length > 0) {
              const last = hist[hist.length - 1];
              setLastMove([last.from, last.to]);
            }
          } catch { /* noop */ }
          chessRef.current.load(row.fen as string);
          setFen(row.fen as string);
        }
      })
      .on("broadcast", { event: "draw_offer" }, ({ payload }) => {
        if ((payload as { from: string }).from !== myColor) setDrawOffer("received");
      })
      .on("broadcast", { event: "draw_decline" }, () => setDrawOffer(null))
      .on("broadcast", { event: "rematch_offer" }, ({ payload }) => {
        if ((payload as { from: string }).from !== myColor) setRematch("received");
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
  }, [gameState.roomCode, myColor, userName]);

  // Track game start time when game becomes active
  useEffect(() => {
    if (gameState.status === "active" && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
  }, [gameState.status]);

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

  // ── Move ──────────────────────────────────────────────────────────────────
  function onDrop(sourceSquare: string, targetSquare: string): boolean {
    if (!isMyTurn || gameState.status !== "active") return false;

    const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    if (!move) return false;

    // Sound
    if (chess.isCheck())          playSound("check",   muted);
    else if (move.flags.includes("c")) playSound("capture", muted);
    else if (move.flags.includes("k") || move.flags.includes("q")) playSound("castle", muted);
    else                               playSound("move",    muted);

    const newFen = chess.fen();
    setFen(newFen);
    setLastMove([sourceSquare, targetSquare]);

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
    updateChessGame(gameState.roomCode, { fen: newFen, pgn: chess.pgn(), turn: chess.turn(), status: newStatus, winner, ...extra })
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
    setWhiteMs(initMs); setBlackMs(initMs);
    setRematch(null); setDrawOffer(null);
    await updateChessGame(gameState.roomCode, { fen: newChess.fen(), pgn: "", turn: "w", status: "active", winner: null })
      .catch(() => toast.error("Failed to reset"));
    supabase.channel(`chess:${gameState.roomCode}`).send({ type: "broadcast", event: "rematch_offer", payload: { from: "accepted" } });
  }

  function copyCode() {
    navigator.clipboard.writeText(gameState.roomCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function copyLink() {
    const url = `${window.location.origin}/chess?join=${gameState.roomCode}`;
    navigator.clipboard.writeText(url).then(() => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); });
  }

  const opponentLabel = opponentName ?? "Opponent";
  const blackLabel = isBlack ? `${userName} (You)` : `${opponentLabel}`;
  const whiteLabel = isWhite ? `${userName} (You)` : `${opponentLabel}`;

  const boardStyle: React.CSSProperties = boardPx
    ? { width: boardPx, height: boardPx, flexShrink: 0 }
    : { width: "min(calc(100vh - 180px), calc(100vw - 2rem))", flexShrink: 0 };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row md:items-start md:justify-center md:gap-4">
      {/* ── Board column ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-1.5" style={boardStyle}>
        {/* Black clock + label */}
        <div className="flex h-9 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 shrink-0 rounded-full bg-zinc-800 ring-1 ring-zinc-600" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              ♚ {blackLabel}
            </span>
            {gameState.turn === "b" && !isOver && !isWaiting && (
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">● TURN</span>
            )}
          </div>
          <Clock
            ms={blackMs}
            active={gameState.turn === "b" && !isOver && !isWaiting}
            low={blackMs < 30000}
          />
        </div>

        {/* Board fills the remaining space in the column */}
        <div className="flex-1">
          <Chessboard
            options={{
              position: fen,
              onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop(sourceSquare, targetSquare ?? ""),
              boardOrientation: myColor ?? "white",
              allowDragging: isMyTurn && !isOver && !isWaiting,
              boardStyle: { borderRadius: "12px", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" },
              squareStyles: lastMove ? {
                [lastMove[0]]: { backgroundColor: "rgba(255, 213, 0, 0.4)" },
                [lastMove[1]]: { backgroundColor: "rgba(255, 213, 0, 0.4)" },
              } : {},
            }}
          />
        </div>

        {/* White clock + label */}
        <div className="flex h-9 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 shrink-0 rounded-full bg-zinc-100 ring-1 ring-zinc-300" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              ♔ {whiteLabel}
            </span>
            {gameState.turn === "w" && !isOver && !isWaiting && (
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">● TURN</span>
            )}
          </div>
          <Clock
            ms={whiteMs}
            active={gameState.turn === "w" && !isOver && !isWaiting}
            low={whiteMs < 30000}
          />
        </div>
      </div>

      {/* ── Side panel ───────────────────────────────────────────────────── */}
      <div
        className="flex w-full flex-col gap-2.5 overflow-y-auto md:w-72 md:shrink-0"
        style={{ maxHeight: boardPx ? boardPx + 72 : "calc(100vh - 108px)" }}
      >

        {/* Room code + copy link */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Room Code</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold tracking-widest text-zinc-900 dark:text-zinc-100">{gameState.roomCode}</span>
            <button onClick={copyCode} title="Copy code" className="ml-auto rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {isWaiting && (
            <button onClick={copyLink}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {copiedLink ? <><Check className="h-3 w-3 text-emerald-500" /> Link copied!</> : <><Copy className="h-3 w-3" /> Copy invite link</>}
            </button>
          )}
        </div>

        {/* Status */}
        <div className={`rounded-xl border p-3 text-sm font-medium ${
          isOver ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                 : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        }`}>
          {isOver && <Trophy className="mb-1 h-4 w-4" />}
          {status}
        </div>

        {/* Draw offer banner */}
        {drawOffer === "received" && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">Opponent offers a draw</p>
            <button onClick={acceptDraw} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Accept</button>
            <button onClick={declineDraw} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">Decline</button>
          </div>
        )}

        {/* Rematch offer */}
        {rematch === "received" && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">Opponent wants a rematch!</p>
            <button onClick={handleRematch} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Accept</button>
            <button onClick={() => setRematch(null)} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">Decline</button>
          </div>
        )}

        {/* Action row — always visible */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMuted((m) => !m)} title={muted ? "Unmute" : "Mute"}
            className="flex items-center gap-1 rounded-xl border border-zinc-300 px-2.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>

          {!isWaiting && !isOver && (
            <>
              {drawOffer === null && (
                <button onClick={offerDraw}
                  className="flex items-center gap-1 rounded-xl border border-zinc-300 px-2.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  ½ Draw
                </button>
              )}
              {drawOffer === "sent" && (
                <span className="flex items-center rounded-xl border border-zinc-200 px-2.5 py-2 text-xs text-zinc-400">Draw offered…</span>
              )}
              <button onClick={handleResign}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-300 px-2.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
                <Flag className="h-3.5 w-3.5" /> Resign
              </button>
            </>
          )}
          {isOver && (
              <>
                <button onClick={() => {
                  setRematch("sent");
                  supabase.channel(`chess:${gameState.roomCode}`).send({ type: "broadcast", event: "rematch_offer", payload: { from: myColor } });
                }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  <RefreshCw className="h-3.5 w-3.5" /> Rematch
                </button>
                {gameState.pgn && (
                  <button
                    onClick={() => onReview(gameState.pgn, whiteLabel.replace(" (You)", ""), blackLabel.replace(" (You)", ""), gameState.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Review Game
                  </button>
                )}
              </>
            )}
        </div>

        {/* Move history */}
        <MoveHistory pgn={gameState.pgn} />

        {/* Chat — always open */}
        {!isWaiting && <ChatPanel roomCode={gameState.roomCode} myColor={myColor} />}

        {/* Voice */}
        <a href="/call" target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-zinc-300 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
          <Mic className="h-3.5 w-3.5" /> Voice Call
        </a>
      </div>
    </div>
  );
}

// ─── Puzzle Library ───────────────────────────────────────────────────────────

const THEMES_POPULAR = [
  "fork", "pin", "skewer", "discoveredAttack", "backRankMate",
  "hangingPiece", "sacrifice", "deflection", "decoy", "quietMove",
];

function PuzzleLibrary({ onSolve }: { onSolve: (p: LibraryPuzzle) => void }) {
  const levels: PuzzleLevel[]  = ["beginner", "intermediate", "hard", "expert"];
  const [activeLevel, setActiveLevel] = useState<PuzzleLevel>("beginner");
  const [theme, setTheme]             = useState("");
  const [puzzles, setPuzzles]         = useState<LibraryPuzzle[]>([]);
  const [loading, setLoading]         = useState(false);
  const [offset, setOffset]           = useState(0);
  const [hasMore, setHasMore]         = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const LIMIT = 20;

  const load = useCallback(async (lvl: PuzzleLevel, th: string, off: number, replace: boolean) => {
    // Cancel any in-flight request for a previous tab/theme
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    if (replace) setPuzzles([]); // clear immediately so stale cards never show
    try {
      const params = new URLSearchParams({ level: lvl, limit: String(LIMIT), offset: String(off), random: "true" });
      if (th) params.set("theme", th);
      const res = await fetch(`/api/chess/puzzles/library?${params}`, { signal: ctrl.signal });
      const data = await res.json() as { items: LibraryPuzzle[]; total: number };
      // Only apply if this request wasn't aborted
      if (!ctrl.signal.aborted) {
        // Double-check: only render cards that truly match the requested level
        const filtered = data.items.filter((p) => p.level === lvl);
        setPuzzles((prev) => replace ? filtered : [...prev, ...filtered]);
        setHasMore(filtered.length === LIMIT);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error(e);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    load(activeLevel, theme, 0, true);
  }, [activeLevel, theme, load]);

  function loadMore() {
    const next = offset + LIMIT;
    setOffset(next);
    load(activeLevel, theme, next, false);
  }

  const levelCounts: Record<PuzzleLevel, number> = { beginner: 500, intermediate: 500, hard: 500, expert: 500 };

  return (
    <div className="flex flex-1 flex-col">
      {/* Level tabs */}
      <div className="flex border-b border-zinc-200 px-4 dark:border-zinc-800 overflow-x-auto">
        {levels.map((lvl) => (
          <button key={lvl} onClick={() => setActiveLevel(lvl)}
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

      {/* Theme filter */}
      <div className="flex gap-1.5 overflow-x-auto px-4 py-2">
        <button onClick={() => setTheme("")}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${!theme ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}>
          All themes
        </button>
        {THEMES_POPULAR.map((t) => (
          <button key={t} onClick={() => setTheme(theme === t ? "" : t)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${theme === t ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {puzzles.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[p.level]}`}>
                  {LEVEL_LABELS[p.level]}
                </span>
                <p className="mt-1 text-xs font-mono text-zinc-400">Rating: {p.rating}</p>
              </div>
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600">#{p.id}</span>
            </div>
            {p.themes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {p.themes.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{t}</span>
                ))}
              </div>
            )}
            <button onClick={() => onSolve(p)}
              className="mt-auto flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600">
              <Swords className="h-3.5 w-3.5" /> Solve
            </button>
          </div>
        ))}
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>

      {/* Load more */}
      {!loading && hasMore && (
        <div className="flex justify-center pb-6">
          <button onClick={loadMore}
            className="rounded-xl bg-zinc-900 px-6 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
            Load more
          </button>
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
  crushing:          "The position has a move that gives a decisive material or positional advantage.",
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

function PuzzleSolve({ puzzle, onBack }: {
  puzzle: LibraryPuzzle | BuiltInPuzzle;
  onBack: () => void;
}) {
  const isLibrary = !("title" in puzzle);
  const setupMove = isLibrary ? (puzzle as LibraryPuzzle).moves[0] : null;
  const solMoves  = isLibrary
    ? (puzzle as LibraryPuzzle).moves.slice(1)
    : (puzzle as BuiltInPuzzle).solutionMoves;

  const [chess]     = useState(() => new Chess(puzzle.fen));
  const [fen, setFen]                     = useState(puzzle.fen);
  const [moveIdx, setMoveIdx]             = useState(0);
  const [result, setResult]               = useState<"idle" | "wrong" | "solved">("idle");
  const [wrongCount, setWrongCount]       = useState(0);
  const [showHint, setShowHint]           = useState(false);
  const [lastMove, setLastMove]           = useState<[string, string] | null>(null);
  const [wrongSquares, setWrongSquares]   = useState<[string, string] | null>(null);
  const [wrongExpl, setWrongExpl]         = useState("");
  const [loadingWrong, setLoadingWrong]   = useState(false);
  const [explanation, setExplanation]     = useState("");
  const [loadingExpl, setLoadingExpl]     = useState(false);
  const [muted, setMuted]                 = useState(false);
  // TTS
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused]     = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  // FEN at the moment the player is about to move (before their drop)
  const fenBeforeDropRef = useRef(puzzle.fen);
  const chessRef = useRef(chess);
  chessRef.current = chess;

  const fenTurn      = puzzle.fen.split(" ")[1] as "w" | "b";
  const playerColor  = (setupMove
    ? (fenTurn === "w" ? "black" : "white")
    : (fenTurn === "w" ? "white" : "black")) as "white" | "black";

  // Auto-play setup move for Lichess puzzles
  useEffect(() => {
    if (!setupMove) return;
    const timer = setTimeout(() => {
      const m = chessRef.current.move({ from: setupMove.slice(0, 2), to: setupMove.slice(2, 4), promotion: setupMove[4] ?? "q" });
      if (m) { setFen(chessRef.current.fen()); setLastMove([setupMove.slice(0, 2), setupMove.slice(2, 4)]); }
    }, 600);
    return () => clearTimeout(timer);
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
  async function fetchWrongExplanation(currentFen: string, wrongMove: string) {
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
        }),
      });
      const data = await res.json() as { explanation: string };
      setWrongExpl(data.explanation ?? "");
    } finally {
      setLoadingWrong(false);
    }
  }

  // ── TTS helpers ──────────────────────────────────────────────────────────
  function speakText(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate  = 0.9;
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

  function onDrop(sourceSquare: string, targetSquare: string): boolean {
    if (result === "solved") return false;
    const expectedUci = solMoves[moveIdx];
    if (!expectedUci) return false;

    const actualUci = `${sourceSquare}${targetSquare}`;
    const match = actualUci === expectedUci || actualUci === expectedUci.slice(0, 4);

    if (!match) {
      setResult("wrong");
      setWrongCount((c) => c + 1);
      setWrongSquares([sourceSquare, targetSquare]);
      // Capture current FEN before the wrong move for AI context
      const fenNow = fenBeforeDropRef.current;
      fetchWrongExplanation(fenNow, actualUci);
      return false;
    }

    const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: expectedUci[4] ?? "q" });
    if (!move) return false;

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
      fetchExplanation();
      return true;
    }

    // Auto-play opponent response
    const opponentMove = solMoves[nextIdx];
    if (opponentMove) {
      setTimeout(() => {
        const from = opponentMove.slice(0, 2);
        const to   = opponentMove.slice(2, 4);
        const m    = chessRef.current.move({ from, to, promotion: opponentMove[4] ?? "q" });
        if (m) {
          setFen(chessRef.current.fen());
          fenBeforeDropRef.current = chessRef.current.fen();
          setLastMove([from, to]);
          setMoveIdx(nextIdx + 1);
        }
      }, 400);
    }
    return true;
  }

  function handleReset() {
    stopSpeech();
    chess.load(puzzle.fen);
    setFen(puzzle.fen);
    fenBeforeDropRef.current = puzzle.fen;
    setMoveIdx(0);
    setResult("idle");
    setWrongCount(0);
    setShowHint(false);
    setLastMove(null);
    setWrongSquares(null);
    setWrongExpl("");
    setExplanation("");
    if (setupMove) {
      setTimeout(() => {
        const m = chessRef.current.move({ from: setupMove.slice(0, 2), to: setupMove.slice(2, 4), promotion: setupMove[4] ?? "q" });
        if (m) {
          setFen(chessRef.current.fen());
          fenBeforeDropRef.current = chessRef.current.fen();
          setLastMove([setupMove.slice(0, 2), setupMove.slice(2, 4)]);
        }
      }, 600);
    }
  }

  // Square highlights: yellow for last move, red for wrong move
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (result !== "wrong" && lastMove) {
    squareStyles[lastMove[0]] = { backgroundColor: "rgba(255, 213, 0, 0.45)" };
    squareStyles[lastMove[1]] = { backgroundColor: "rgba(255, 213, 0, 0.45)" };
  }
  if (result === "wrong" && wrongSquares) {
    squareStyles[wrongSquares[0]] = { backgroundColor: "rgba(239, 68, 68, 0.5)" };
    squareStyles[wrongSquares[1]] = { backgroundColor: "rgba(239, 68, 68, 0.5)" };
  }

  // Arrow hint after 2+ wrong attempts
  const hintArrows: { startSquare: string; endSquare: string; color: string }[] = [];
  const nextExpected = solMoves[moveIdx];
  if (wrongCount >= 2 && nextExpected && result !== "solved") {
    hintArrows.push({
      startSquare: nextExpected.slice(0, 2),
      endSquare:   nextExpected.slice(2, 4),
      color:       "rgba(255, 170, 0, 0.85)",
    });
  }

  const ringColor =
    result === "wrong"  ? "0 0 0 4px rgb(239 68 68)" :
    result === "solved" ? "0 0 0 4px rgb(34 197 94)"  :
                          "0 4px 24px rgba(0,0,0,0.12)";

  const title   = "title" in puzzle ? puzzle.title : `Puzzle #${(puzzle as LibraryPuzzle).id}`;
  const level   = puzzle.level;
  const themes  = isLibrary ? (puzzle as LibraryPuzzle).themes : [];
  const builtInHint = "hint" in puzzle ? (puzzle as BuiltInPuzzle).hint : "";
  const hintText  = builtInHint || themeToHint(themes);
  const totalPlayerMoves   = Math.ceil(solMoves.length / 2);
  const currentPlayerMove  = Math.min(Math.floor(moveIdx / 2) + 1, totalPlayerMoves);
  const progressPct        = result === "solved" ? 100 : Math.round((moveIdx / solMoves.length) * 100);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start lg:gap-6 lg:p-6">
      {/* ── Board: 60% on desktop ─────────────────────────────────────────── */}
      <div className="min-w-0 lg:flex-[3]">
        <div className="mx-auto w-full" style={{ maxWidth: "min(100%, calc(100vh - 10rem))" }}>
          <Chessboard
            options={{
              position: fen,
              onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop(sourceSquare, targetSquare ?? ""),
              boardOrientation: playerColor,
              allowDragging: result !== "solved",
              boardStyle: { borderRadius: "12px", boxShadow: ringColor, transition: "box-shadow 0.2s" },
              squareStyles,
              arrows: hintArrows,
            }}
          />
        </div>
      </div>

      {/* ── Info panel: 40% on desktop ────────────────────────────────────── */}
      <div className="w-full space-y-3 lg:flex-[2] lg:overflow-y-auto" style={{ maxHeight: "calc(100vh - 8rem)" }}>
        {/* Puzzle info */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
              <div className="mt-1 flex items-center gap-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[level as PuzzleLevel]}`}>
                  {LEVEL_LABELS[level as PuzzleLevel]}
                </span>
                {isLibrary && (
                  <span className="font-mono text-xs text-zinc-400">{(puzzle as LibraryPuzzle).rating}</span>
                )}
              </div>
            </div>
            <button onClick={() => setMuted((m) => !m)} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            Find the best move for <strong>{playerColor}</strong>.
          </p>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
              <span>Move {currentPlayerMove} of {totalPlayerMoves}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${result === "solved" ? "bg-emerald-500" : "bg-amber-400"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Feedback */}
        {result === "solved" && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            <Crown className="h-5 w-5 shrink-0" />
            <span className="font-semibold">Brilliant! Puzzle solved.</span>
          </div>
        )}
        {(result === "wrong" || (wrongExpl && result === "idle")) && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
            <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
              <X className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">Not the best move here.</span>
            </div>
            <div className="mt-2 text-sm leading-relaxed text-red-600 dark:text-red-400">
              {loadingWrong ? (
                <span className="flex items-center gap-1.5 text-xs text-red-400">
                  <Loader2 className="h-3 w-3 animate-spin" /> Analyzing your move…
                </span>
              ) : wrongExpl ? (
                <p>{wrongExpl}</p>
              ) : (
                <p className="text-xs text-red-400">Try looking for a move that creates multiple threats at once.</p>
              )}
            </div>
            {wrongCount >= 2 && (
              <p className="mt-1.5 text-xs font-medium text-red-500">
                Arrow on the board shows the right direction →
              </p>
            )}
          </div>
        )}

        {/* Hint */}
        {!showHint && result !== "solved" && (
          <button onClick={() => setShowHint(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
            <Lightbulb className="h-4 w-4 shrink-0" /> Show hint
          </button>
        )}
        {showHint && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
            <p className="flex items-start gap-1.5">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {hintText}
            </p>
            {themes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {themes.map((t) => (
                  <span key={t} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">{t}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Explanation (after solve) */}
        {result === "solved" && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center gap-1.5">
              <BookOpen className="h-3 w-3 text-zinc-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Why this works</p>
              {/* TTS controls */}
              <div className="ml-auto flex items-center gap-1">
                {speaking ? (
                  <>
                    <button
                      onClick={pauseResumeSpeech}
                      title={paused ? "Resume" : "Pause"}
                      className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                    >
                      {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={stopSpeech}
                      title="Stop"
                      className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : explanation && !loadingExpl ? (
                  <button
                    onClick={() => speakText(explanation)}
                    title="Read aloud"
                    className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
            {loadingExpl ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…
              </div>
            ) : explanation ? (
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{explanation}</p>
            ) : (
              <p className="text-xs text-zinc-400">Solution: <span className="font-mono">{solMoves.join(" ")}</span></p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
            <RefreshCw className="h-3.5 w-3.5" /> Reset
          </button>
          {result === "solved" && (
            <button onClick={() => { stopSpeech(); onBack(); }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600">
              <Check className="h-3.5 w-3.5" /> Next puzzle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
