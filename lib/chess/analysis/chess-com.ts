// Fetch a Chess.com player's games for a given month (public API, no auth).
// Reference: https://www.chess.com/news/view/published-data-api

export type ChessComResult = "win" | "loss" | "draw" | "unknown";

export interface ChessComGame {
  url: string;
  pgn: string;
  whiteName: string;
  whiteRating?: number;
  blackName: string;
  blackRating?: number;
  whiteResult: ChessComResult;
  blackResult: ChessComResult;
  endTime: number; // seconds since epoch
  timeClass: string; // bullet | blitz | rapid | daily
  rules: string; // chess | chess960 | …
}

export interface ChessComArchiveResult {
  games: ChessComGame[];
  /** Next-newer month than the requested one, if it exists in archives. */
  nextMonth?: { year: number; month: number };
  /** Next-older month, if any. */
  prevMonth?: { year: number; month: number };
}

const drawResults = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

function mapResult(value: unknown): ChessComResult {
  if (typeof value !== "string") return "unknown";
  if (value === "win") return "win";
  if (drawResults.has(value)) return "draw";
  return "loss";
}

interface RawGame {
  url?: string;
  pgn?: string;
  end_time?: number;
  time_class?: string;
  rules?: string;
  white?: { username?: string; rating?: number; result?: string };
  black?: { username?: string; rating?: number; result?: string };
}

interface ArchivesResponse {
  archives?: string[];
}

interface MonthResponse {
  games?: RawGame[];
}

export async function fetchChessComArchives(
  username: string,
  signal?: AbortSignal,
): Promise<{ year: number; month: number }[]> {
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(
    username.toLowerCase(),
  )}/games/archives`;

  const res = await fetch(url, { signal });
  if (res.status === 404) {
    throw new Error(`User "${username}" not found on Chess.com.`);
  }
  if (!res.ok) {
    throw new Error(`Chess.com responded with ${res.status}.`);
  }

  const data = (await res.json()) as ArchivesResponse;
  const archives = Array.isArray(data.archives) ? data.archives : [];

  return archives
    .map((u) => {
      const m = u.match(/\/games\/(\d{4})\/(\d{2})$/);
      if (!m) return null;
      return { year: Number(m[1]), month: Number(m[2]) };
    })
    .filter((v): v is { year: number; month: number } => !!v)
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

export async function fetchChessComGames(
  username: string,
  year: number,
  month: number,
  signal?: AbortSignal,
): Promise<ChessComGame[]> {
  const monthStr = String(month).padStart(2, "0");
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(
    username.toLowerCase(),
  )}/games/${year}/${monthStr}`;

  const res = await fetch(url, { signal });
  if (res.status === 404) {
    // chess.com returns 404 for "future month" too — treat as empty
    return [];
  }
  if (!res.ok) {
    throw new Error(`Chess.com responded with ${res.status}.`);
  }

  const data = (await res.json()) as MonthResponse;
  const raw = Array.isArray(data.games) ? data.games : [];

  return raw
    .filter((g) => g.rules === "chess" || g.rules === "chess960")
    .map<ChessComGame>((g) => ({
      url: g.url ?? "",
      pgn: g.pgn ?? "",
      whiteName: g.white?.username ?? "White",
      whiteRating: g.white?.rating,
      blackName: g.black?.username ?? "Black",
      blackRating: g.black?.rating,
      whiteResult: mapResult(g.white?.result),
      blackResult: mapResult(g.black?.result),
      endTime: Number(g.end_time) || 0,
      timeClass: g.time_class ?? "",
      rules: g.rules ?? "chess",
    }))
    .sort((a, b) => b.endTime - a.endTime);
}

/** YYYY-MM key, e.g. 2026-04. */
export function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Step a (year, month) by `delta` months. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function currentYearMonth(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
