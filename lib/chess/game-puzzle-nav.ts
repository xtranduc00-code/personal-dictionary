/**
 * Session snapshot for "From my games" list so /chess/puzzles/[id] can chain
 * Next puzzle with the same filters/pagination as the games grid.
 */

export const GAME_PUZZLE_NAV_STORAGE_KEY = "ken_chess_game_puzzle_nav";

/** Fired after a puzzle attempt is saved so lists can refresh solved state. */
export const CHESS_PUZZLE_PROGRESS_EVENT = "ken-chess-puzzle-progress";

/** Must match `PAGE_SIZE` in `app/chess/games/page.tsx`. */
export const GAME_PUZZLES_PAGE_SIZE = 20;

export type GamePuzzleNav = {
  classification: "mistake" | "blunder" | null;
  gameId: string | null;
  sort: "newest" | "hardest" | "easiest" | "random";
  page: number;
  index: number;
  pageItems: { id: string }[];
  total: number;
};

export function writeGamePuzzleNav(nav: GamePuzzleNav): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GAME_PUZZLE_NAV_STORAGE_KEY, JSON.stringify(nav));
  } catch {
    /* ignore quota */
  }
}

export function readGamePuzzleNav(): GamePuzzleNav | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GAME_PUZZLE_NAV_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<GamePuzzleNav>;
    if (!Array.isArray(p.pageItems)) return null;
    return {
      classification: p.classification ?? null,
      gameId: p.gameId ?? null,
      sort: p.sort ?? "newest",
      page: typeof p.page === "number" ? p.page : 1,
      index: typeof p.index === "number" ? p.index : 0,
      pageItems: p.pageItems.map((x) => ({ id: String((x as { id?: unknown }).id ?? "") })).filter((x) => x.id),
      total: typeof p.total === "number" ? p.total : 0,
    };
  } catch {
    return null;
  }
}

export function clearGamePuzzleNav(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(GAME_PUZZLE_NAV_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
