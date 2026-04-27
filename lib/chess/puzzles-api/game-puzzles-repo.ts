/**
 * Database accessors for puzzles extracted from the user's own games.
 *
 * Lives in `public.chess_game_puzzles` (Postgres on Supabase). Reads are
 * shaped like a `LibraryPuzzle` so the solve UI doesn't need to know
 * which source a puzzle came from. The id prefix `gp_` distinguishes
 * them from Lichess's 5-char puzzle IDs, and the prefix is the only thing
 * route handlers branch on.
 *
 * All functions here take an explicit `userId` — `chess_game_puzzles` is
 * RLS-enabled and the server bypasses RLS via the service role, so the
 * scope filter has to be applied manually (same pattern as `chess_games`,
 * `notes`, etc. across this repo).
 */
import type { LibraryPuzzle } from "@/lib/chess-types";
import { pgOne, pgRows, pgTx } from "./db";
import type { ExtractedGamePuzzle } from "./game-puzzles";

interface GamePuzzleRow {
  id: string;
  game_id: string;
  ply: number;
  fullmove: number;
  side: "w" | "b";
  fen: string;
  solution_moves: string;
  played_uci: string | null;
  classification: "mistake" | "blunder";
  eval_before_cp: number | null;
  eval_after_cp: number | null;
  swing_cp: number;
  source_url: string | null;
  white_name: string | null;
  black_name: string | null;
  themes: string;
  // Postgres returns timestamptz as Date; convert to unix-ms in `rowToLibraryPuzzle`.
  created_at: Date;
}

const SELECT_COLS =
  "id, game_id, ply, fullmove, side, fen, solution_moves, played_uci, " +
  "classification, eval_before_cp, eval_after_cp, swing_cp, " +
  "source_url, white_name, black_name, themes, created_at";

/** Bucket the swing magnitude into a difficulty level so game-puzzles can
 *  reuse the existing browse UI's level chips. Mirrors the Lichess buckets:
 *  beginner < 1100 < intermediate < 1500 < hard < 1900 < expert. */
function levelForSwing(swingCp: number): "beginner" | "intermediate" | "hard" | "expert" {
  if (swingCp < 250) return "beginner";
  if (swingCp < 500) return "intermediate";
  if (swingCp < 1000) return "hard";
  return "expert";
}

export interface GamePuzzleAsLibrary extends LibraryPuzzle {
  readonly source: "game";
  swingCp: number;
  classification: "mistake" | "blunder";
  sourceUrl: string | null;
  gameId: string;
  fullmove: number;
  whiteName: string | null;
  blackName: string | null;
  openings: string[];
}

function rowToLibraryPuzzle(r: GamePuzzleRow): GamePuzzleAsLibrary {
  // Solve UI expects `moves[0]` = opponent setup move, then the user's
  // sequence. Game puzzles have no setup move (puzzle starts on the
  // user's turn), so prepend an empty placeholder.
  const pv = r.solution_moves.split(" ").filter(Boolean);
  return {
    id: r.id,
    fen: r.fen,
    moves: ["", ...pv],
    rating: r.swing_cp,
    themes: r.themes.split(" ").filter(Boolean),
    level: levelForSwing(r.swing_cp),
    source: "game",
    swingCp: r.swing_cp,
    classification: r.classification,
    sourceUrl: r.source_url,
    gameId: r.game_id,
    fullmove: r.fullmove,
    whiteName: r.white_name,
    blackName: r.black_name,
    openings: [],
  } as GamePuzzleAsLibrary;
}

export async function getGamePuzzleById(
  userId: string,
  id: string,
): Promise<GamePuzzleAsLibrary | null> {
  const row = await pgOne<GamePuzzleRow>(
    `SELECT ${SELECT_COLS} FROM public.chess_game_puzzles
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return row ? rowToLibraryPuzzle(row) : null;
}

export interface GamePuzzleQuery {
  classification?: "mistake" | "blunder";
  gameId?: string;
  themes?: string[];     // filter — every theme must be present (substring match)
  search?: string;       // id substring
  limit: number;
  offset: number;
  sort: "newest" | "hardest" | "easiest" | "popular" | "random";
}

export interface GamePuzzleListResult {
  items: GamePuzzleAsLibrary[];
  total: number;
}

export async function listGamePuzzles(
  userId: string,
  q: GamePuzzleQuery,
): Promise<GamePuzzleListResult> {
  const where: string[] = ["user_id = $1"];
  const params: unknown[] = [userId];
  let i = 2;

  if (q.classification) {
    where.push(`classification = $${i++}`);
    params.push(q.classification);
  }
  if (q.gameId) {
    where.push(`game_id = $${i++}`);
    params.push(q.gameId);
  }
  // Theme filter — `themes` is a space-separated text column. Wrap with
  // surrounding spaces so a `LIKE '% term %'` match is exact-token.
  if (q.themes && q.themes.length > 0) {
    for (const t of q.themes) {
      where.push(`(' ' || themes || ' ') LIKE $${i++}`);
      params.push(`% ${t} %`);
    }
  }
  if (q.search) {
    where.push(`id LIKE $${i++}`);
    params.push(`%${q.search}%`);
  }

  const whereSql = where.join(" AND ");

  const totalRow = await pgOne<{ n: string | number }>(
    `SELECT COUNT(*) AS n FROM public.chess_game_puzzles WHERE ${whereSql}`,
    params,
  );
  const total = Number(totalRow?.n ?? 0);

  let orderBy: string;
  switch (q.sort) {
    case "hardest":
      orderBy = "swing_cp DESC, created_at DESC";
      break;
    case "easiest":
      orderBy = "swing_cp ASC, created_at DESC";
      break;
    case "random":
      orderBy = "random()";
      break;
    case "popular":
    case "newest":
    default:
      orderBy = "created_at DESC, id";
      break;
  }

  const rows = await pgRows<GamePuzzleRow>(
    `SELECT ${SELECT_COLS} FROM public.chess_game_puzzles
      WHERE ${whereSql}
      ORDER BY ${orderBy} LIMIT $${i} OFFSET $${i + 1}`,
    [...params, q.limit, q.offset],
  );

  return { items: rows.map(rowToLibraryPuzzle), total };
}

export interface GamePuzzleSummary {
  total: number;
  byClassification: { mistake: number; blunder: number };
  attempted: number;
  solved: number;
  byGame: {
    gameId: string;
    whiteName: string | null;
    blackName: string | null;
    count: number;
    sourceUrl: string | null;
  }[];
}

export async function getGamePuzzleSummary(userId: string): Promise<GamePuzzleSummary> {
  const totals = await pgOne<{ total: string | number; mistakes: string | number; blunders: string | number }>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN classification='mistake' THEN 1 ELSE 0 END), 0) AS mistakes,
       COALESCE(SUM(CASE WHEN classification='blunder' THEN 1 ELSE 0 END), 0) AS blunders
     FROM public.chess_game_puzzles
     WHERE user_id = $1`,
    [userId],
  );

  // Attempts log lives in `chess_attempts` keyed by `game_puzzle_id`. Solved
  // counter is over distinct puzzles where any attempt has solved=true.
  const attempts = await pgOne<{ attempted: string | number; solved: string | number }>(
    `SELECT
       COUNT(DISTINCT a.game_puzzle_id) AS attempted,
       COUNT(DISTINCT CASE WHEN a.solved THEN a.game_puzzle_id END) AS solved
     FROM public.chess_attempts a
     WHERE a.user_id = $1 AND a.game_puzzle_id IS NOT NULL`,
    [userId],
  );

  const byGame = await pgRows<{
    game_id: string;
    white_name: string | null;
    black_name: string | null;
    source_url: string | null;
    count: string | number;
  }>(
    `SELECT game_id, MIN(white_name) AS white_name, MIN(black_name) AS black_name,
            MIN(source_url) AS source_url, COUNT(*) AS count
       FROM public.chess_game_puzzles
      WHERE user_id = $1
      GROUP BY game_id
      ORDER BY MAX(created_at) DESC
      LIMIT 20`,
    [userId],
  );

  return {
    total: Number(totals?.total ?? 0),
    byClassification: {
      mistake: Number(totals?.mistakes ?? 0),
      blunder: Number(totals?.blunders ?? 0),
    },
    attempted: Number(attempts?.attempted ?? 0),
    solved: Number(attempts?.solved ?? 0),
    byGame: byGame.map((g) => ({
      gameId: g.game_id,
      whiteName: g.white_name,
      blackName: g.black_name,
      sourceUrl: g.source_url,
      count: Number(g.count),
    })),
  };
}

export interface ExtractInput {
  pgn: string;
  sourceUrl?: string | null;
  whiteName?: string | null;
  blackName?: string | null;
  puzzles: ExtractedGamePuzzle[];
}

/** Persist a batch of extracted puzzles. Postgres `ON CONFLICT … DO NOTHING`
 *  on the primary key (`gp_<gameId>_<ply>`) makes re-analysis idempotent. */
export async function persistExtracted(
  userId: string,
  input: ExtractInput,
): Promise<{ inserted: number; existed: number }> {
  if (input.puzzles.length === 0) {
    return { inserted: 0, existed: 0 };
  }

  return pgTx(async (client) => {
    let inserted = 0;
    for (const p of input.puzzles) {
      const r = await client.query(
        `INSERT INTO public.chess_game_puzzles
           (id, user_id, game_id, ply, fullmove, side, fen, solution_moves, played_uci,
            classification, eval_before_cp, eval_after_cp, swing_cp,
            source_url, white_name, black_name, themes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id,
          userId,
          p.gameId,
          p.ply,
          p.fullmove,
          p.side,
          p.fen,
          p.solutionMoves.join(" "),
          p.playedUci,
          p.classification,
          p.evalBeforeCp,
          p.evalAfterCp,
          p.swingCp,
          input.sourceUrl ?? null,
          input.whiteName ?? null,
          input.blackName ?? null,
          p.themes.join(" "),
        ],
      );
      if (r.rowCount && r.rowCount > 0) inserted++;
    }
    return { inserted, existed: input.puzzles.length - inserted };
  });
}
