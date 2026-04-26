/**
 * Database accessors for puzzles extracted from my own games.
 *
 * Lives in `progress.sqlite` (table `progress.game_puzzles`); reads are
 * exposed through helpers shaped like the Lichess `LibraryPuzzle` so the
 * solve UI doesn't need to know which source a puzzle came from. The id
 * prefix `gp_` distinguishes them from Lichess's 5-char puzzle IDs.
 */
import type { LibraryPuzzle } from "@/lib/chess-types";
import { getDb } from "./db";
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
  created_at: number;
}

/** Bucket the swing magnitude into a difficulty level so game-puzzles can
 *  reuse the existing browse UI's level chips. Mirrors the Lichess buckets:
 *  beginner < 1100 < intermediate < 1500 < hard < 1900 < expert. */
function levelForSwing(swingCp: number): "beginner" | "intermediate" | "hard" | "expert" {
  // Bigger swing → bigger lesson, but also a more obvious blunder. Most
  // user-grade blunders sit between 200–600 cp.
  if (swingCp < 250) return "beginner";
  if (swingCp < 500) return "intermediate";
  if (swingCp < 1000) return "hard";
  return "expert";
}

/** Map a stored row into the same `LibraryPuzzle` shape the solve UI
 *  consumes. The "moves" field is the engine PV — when the user solves
 *  starting from `fen`, side-to-move is them, so unlike Lichess puzzles
 *  there's no opponent-setup-move at index 0. We surface this via an
 *  empty leading element so the existing PuzzleSolve `solMoves = moves
 *  .slice(1)` slice still picks up the right sequence — see the route
 *  layer for the shim. */
export interface GamePuzzleAsLibrary extends LibraryPuzzle {
  /** Always present for game puzzles, used by the FE to render them
   *  differently from Lichess puzzles (no Lichess star, show swing label). */
  readonly source: "game";
  swingCp: number;
  classification: "mistake" | "blunder";
  sourceUrl: string | null;
  gameId: string;
  fullmove: number;
  whiteName: string | null;
  blackName: string | null;
  /** Synthetic opening tags so the existing puzzle card renderer can show
   *  "from my games" italic. */
  openings: string[];
}

function rowToLibraryPuzzle(r: GamePuzzleRow): GamePuzzleAsLibrary {
  // Solve UI expects `moves[0]` = opponent setup move, then the user's
  // sequence. Game puzzles have no setup move (puzzle starts on the
  // user's turn), so we prepend an empty placeholder. PuzzleSolve already
  // skips an empty setup gracefully via its `setupMove` check.
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

export function getGamePuzzleById(id: string): GamePuzzleAsLibrary | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM progress.game_puzzles WHERE id = ?`)
    .get(id) as GamePuzzleRow | undefined;
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

export function listGamePuzzles(q: GamePuzzleQuery): GamePuzzleListResult {
  const db = getDb();
  const where: string[] = ["1=1"];
  const params: unknown[] = [];

  if (q.classification) {
    where.push("classification = ?");
    params.push(q.classification);
  }
  if (q.gameId) {
    where.push("game_id = ?");
    params.push(q.gameId);
  }
  // Theme filter — themes is a space-separated column. Use LIKE per term.
  // Game-puzzle theme set is small and curated (we control it at extract
  // time), so substring matching is safe — no false positives.
  if (q.themes && q.themes.length > 0) {
    for (const t of q.themes) {
      where.push("(' ' || themes || ' ') LIKE ?");
      params.push(`% ${t} %`);
    }
  }
  if (q.search) {
    where.push("id LIKE ?");
    params.push(`%${q.search}%`);
  }

  const total = (db
    .prepare(`SELECT COUNT(*) AS n FROM progress.game_puzzles WHERE ${where.join(" AND ")}`)
    .get(...params) as { n: number }).n;

  let orderBy: string;
  switch (q.sort) {
    case "hardest":
      orderBy = "swing_cp DESC, created_at DESC";
      break;
    case "easiest":
      orderBy = "swing_cp ASC, created_at DESC";
      break;
    case "random":
      orderBy = "RANDOM()";
      break;
    case "popular":
    case "newest":
    default:
      // No popularity for game puzzles — fall back to most recently
      // extracted, which is the most useful default for "what should I
      // train next".
      orderBy = "created_at DESC, id";
      break;
  }

  const rows = db
    .prepare(
      `SELECT * FROM progress.game_puzzles WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    )
    .all(...params, q.limit, q.offset) as GamePuzzleRow[];

  return { items: rows.map(rowToLibraryPuzzle), total };
}

export interface GamePuzzleSummary {
  total: number;
  byClassification: { mistake: number; blunder: number };
  attempted: number;
  solved: number;
  byGame: { gameId: string; whiteName: string | null; blackName: string | null; count: number; sourceUrl: string | null }[];
}

export function getGamePuzzleSummary(): GamePuzzleSummary {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN classification='mistake' THEN 1 ELSE 0 END), 0) AS mistakes,
         COALESCE(SUM(CASE WHEN classification='blunder' THEN 1 ELSE 0 END), 0) AS blunders
       FROM progress.game_puzzles`,
    )
    .get() as { total: number; mistakes: number; blunders: number };

  const attemptsRow = db
    .prepare(
      `SELECT
         COUNT(DISTINCT a.puzzle_id) AS attempted,
         COUNT(DISTINCT CASE WHEN a.solved=1 THEN a.puzzle_id END) AS solved
       FROM progress.attempts a
       JOIN progress.game_puzzles gp ON gp.id = a.puzzle_id`,
    )
    .get() as { attempted: number; solved: number };

  const byGame = db
    .prepare(
      `SELECT game_id, MIN(white_name) AS white_name, MIN(black_name) AS black_name,
              MIN(source_url) AS source_url, COUNT(*) AS count
         FROM progress.game_puzzles
        GROUP BY game_id
        ORDER BY MAX(created_at) DESC
        LIMIT 20`,
    )
    .all() as { game_id: string; white_name: string | null; black_name: string | null; source_url: string | null; count: number }[];

  return {
    total: totals.total,
    byClassification: { mistake: totals.mistakes, blunder: totals.blunders },
    attempted: attemptsRow.attempted,
    solved: attemptsRow.solved,
    byGame: byGame.map((g) => ({
      gameId: g.game_id,
      whiteName: g.white_name,
      blackName: g.black_name,
      sourceUrl: g.source_url,
      count: g.count,
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

/** Persist a batch of extracted puzzles. INSERT OR IGNORE on the
 *  primary key (`gp_<gameId>_<ply>`) makes re-analysis idempotent — the
 *  same PGN re-extracted gets the same ids and silently no-ops. */
export function persistExtracted(
  input: ExtractInput,
): { inserted: number; existed: number } {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO progress.game_puzzles
       (id, game_id, ply, fullmove, side, fen, solution_moves, played_uci,
        classification, eval_before_cp, eval_after_cp, swing_cp,
        source_url, white_name, black_name, themes, created_at)
     VALUES (@id, @gameId, @ply, @fullmove, @side, @fen, @solutionMoves, @playedUci,
             @classification, @evalBeforeCp, @evalAfterCp, @swingCp,
             @sourceUrl, @whiteName, @blackName, @themes, @createdAt)`,
  );

  let inserted = 0;
  const now = Date.now();
  const txn = db.transaction((rows: ExtractedGamePuzzle[]) => {
    for (const p of rows) {
      const r = insert.run({
        id: p.id,
        gameId: p.gameId,
        ply: p.ply,
        fullmove: p.fullmove,
        side: p.side,
        fen: p.fen,
        solutionMoves: p.solutionMoves.join(" "),
        playedUci: p.playedUci,
        classification: p.classification,
        evalBeforeCp: p.evalBeforeCp,
        evalAfterCp: p.evalAfterCp,
        swingCp: p.swingCp,
        sourceUrl: input.sourceUrl ?? null,
        whiteName: input.whiteName ?? null,
        blackName: input.blackName ?? null,
        themes: p.themes.join(" "),
        createdAt: now,
      });
      if (r.changes > 0) inserted++;
    }
  });
  txn(input.puzzles);

  return { inserted, existed: input.puzzles.length - inserted };
}
