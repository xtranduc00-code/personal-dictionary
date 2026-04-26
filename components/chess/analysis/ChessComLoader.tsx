"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

import {
  type ChessComGame,
  currentYearMonth,
  fetchChessComGames,
  formatYearMonth,
  shiftMonth,
} from "@/lib/chess/analysis/chess-com";

/** Result chip: a tiny letter (W/D/L/?) on a colour-coded background.
 *  Replaces the bare coloured square dot — the letter makes the meaning
 *  unambiguous without needing a legend. */
const RESULT_CHIP: Record<string, { letter: string; bg: string; title: string }> = {
  win: { letter: "W", bg: "bg-emerald-500 text-white", title: "Win" },
  loss: { letter: "L", bg: "bg-rose-500 text-white", title: "Loss" },
  draw: { letter: "D", bg: "bg-zinc-400 text-white", title: "Draw" },
  unknown: { letter: "?", bg: "bg-zinc-300 text-zinc-600", title: "Unknown" },
};

const TIME_CLASS_LABEL: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  daily: "Daily",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const LAST_USERNAME_KEY = "chess-com-last-username-v1";

function readLastUsername(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LAST_USERNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeLastUsername(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_USERNAME_KEY, name);
  } catch {
    // ignore quota errors
  }
}

export function ChessComLoader({
  initialUsername,
  onPick,
}: {
  initialUsername?: string;
  onPick: (game: ChessComGame) => void;
}) {
  // Hydrate from localStorage on first client render.
  const [username, setUsername] = useState(initialUsername ?? "");
  const [submittedUsername, setSubmittedUsername] = useState<string | null>(
    initialUsername || null,
  );
  const [{ year, month }, setMonth] = useState(currentYearMonth);
  const [games, setGames] = useState<ChessComGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialUsername) return;
    const stored = readLastUsername();
    if (stored) {
      setUsername(stored);
      setSubmittedUsername(stored);
    }
  }, [initialUsername]);

  useEffect(() => {
    if (!submittedUsername) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchChessComGames(submittedUsername, year, month, controller.signal)
      .then((list) => setGames(list))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        setGames([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [submittedUsername, year, month]);

  function loadUser(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    setSubmittedUsername(trimmed);
    setMonth(currentYearMonth());
    writeLastUsername(trimmed);
  }

  function step(delta: number) {
    setMonth((m) => shiftMonth(m.year, m.month, delta));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Search row: input with the search icon embedded inside, so the
          submit affordance doesn't compete visually with the date picker
          and game cards (Search is not the page's primary action — picking
          a game is). */}
      <form onSubmit={loadUser} className="relative">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Chess.com username"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-9 text-sm text-zinc-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
        />
        <button
          type="submit"
          disabled={!username.trim()}
          className="absolute inset-y-0 right-0 inline-flex items-center justify-center px-2.5 text-zinc-400 transition hover:text-emerald-600 disabled:cursor-not-allowed disabled:text-zinc-300 dark:text-zinc-500 dark:hover:text-emerald-400"
          aria-label="Load games"
        >
          <Search className="h-4 w-4" />
        </button>
      </form>

      {submittedUsername ? (
        <>
          <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50/50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900/40">
            <button
              type="button"
              onClick={() => step(-1)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-700"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-700"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <p className="text-[10px] uppercase tracking-wider text-zinc-400">
            {submittedUsername} · {formatYearMonth(year, month)}
          </p>

          {error ? (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <div className="-mr-1 flex max-h-[60vh] min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-xs text-zinc-500">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Loading games…
              </div>
            ) : games.length === 0 && !error ? (
              <p className="px-2 py-6 text-center text-xs text-zinc-500">
                No games this month.
              </p>
            ) : (
              <>
                {games.map((g) => (
                  <GameRow
                    key={g.url || `${g.endTime}-${g.whiteName}-${g.blackName}`}
                    game={g}
                    username={submittedUsername}
                    onPick={onPick}
                  />
                ))}
                <p className="px-2 pt-2 pb-1 text-center text-[10px] text-zinc-400">
                  {games.length} games · scroll for more
                </p>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Enter a Chess.com username to browse their public archive and load a
          game.
        </p>
      )}
    </div>
  );
}

function GameRow({
  game,
  username,
  onPick,
}: {
  game: ChessComGame;
  username: string;
  onPick: (game: ChessComGame) => void;
}) {
  const playerIsWhite =
    game.whiteName.toLowerCase() === username.toLowerCase();
  const myResult = playerIsWhite ? game.whiteResult : game.blackResult;
  const opponent = playerIsWhite ? game.blackName : game.whiteName;
  const opponentRating = playerIsWhite ? game.blackRating : game.whiteRating;
  const myRating = playerIsWhite ? game.whiteRating : game.blackRating;
  const date = new Date(game.endTime * 1000);
  const chip = RESULT_CHIP[myResult] ?? RESULT_CHIP.unknown;

  return (
    <button
      type="button"
      onClick={() => onPick(game)}
      className="group flex items-start gap-2 rounded-md border border-transparent bg-zinc-50 p-2 text-left text-xs transition hover:border-emerald-300 hover:bg-emerald-50 dark:bg-zinc-900/40 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
    >
      {/* W/D/L letter chip — colour-coded so a quick scan reads results at
          a glance, and the letter removes any "what does the colour mean?"
          ambiguity that a bare dot would have. */}
      <span
        title={chip.title}
        aria-label={chip.title}
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${chip.bg}`}
      >
        {chip.letter}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate">
          {/* Piece-colour dot replaces the cryptic "AS B VS" / "VS" prefix.
              Filled circle = the colour you played in this game. */}
          <span
            aria-hidden
            title={playerIsWhite ? "You played White" : "You played Black"}
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-zinc-300 dark:ring-zinc-600"
            style={{ background: playerIsWhite ? "#f8fafc" : "#0a0a0a" }}
          />
          <span className="text-[10px] font-medium text-zinc-400">vs</span>
          <span className="truncate font-semibold text-zinc-800 dark:text-zinc-100">
            {opponent}
          </span>
          {opponentRating ? (
            <span className="rounded bg-zinc-200/70 px-1 py-px font-mono text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {opponentRating}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span className="font-medium uppercase tracking-wider text-zinc-400">
            {TIME_CLASS_LABEL[game.timeClass] ?? game.timeClass}
          </span>
          <span aria-hidden>·</span>
          <span>
            {date.toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
            })}
          </span>
          {myRating ? (
            <>
              <span aria-hidden>·</span>
              <span title="Your rating at game time" className="font-mono">
                you <span className="font-semibold text-zinc-600 dark:text-zinc-300">{myRating}</span>
              </span>
            </>
          ) : null}
        </div>
      </div>
    </button>
  );
}
