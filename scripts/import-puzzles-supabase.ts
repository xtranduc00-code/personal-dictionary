#!/usr/bin/env tsx
/**
 * Bulk-load the chess puzzle library into Supabase Postgres via `COPY ... FROM
 * STDIN`. Runs in ~30 s over normal home internet — orders of magnitude
 * faster than batched REST inserts.
 *
 * Reads:   data/puzzles.sqlite      (full Lichess dataset, ~5.8M rows)
 * Writes:  public.chess_lib_puzzles, chess_lib_themes, chess_lib_openings,
 *          chess_lib_theme_counts,  chess_lib_opening_counts
 *
 * Required env (put in `.env.local`, gitignored):
 *   SUPABASE_DB_URL  — Postgres URI from Supabase dashboard →
 *                      Settings → Database → Connection string → URI →
 *                      "Connection pooling" mode (port 6543, transaction).
 *                      Example:
 *                        postgres://postgres.xxxx:PASSWORD@aws-0-...pooler.supabase.com:6543/postgres
 *
 * Required dev deps (install before running):
 *   npm i -D pg pg-copy-streams @types/pg
 *
 * Usage:
 *   npx tsx scripts/import-puzzles-supabase.ts
 *   npx tsx scripts/import-puzzles-supabase.ts --per-cell 7700  # tune subset size
 *
 * Idempotent: TRUNCATEs the 5 library tables before COPY. ON DELETE CASCADE
 * on `chess_attempts.lib_puzzle_id` means re-importing AFTER users have made
 * attempts will wipe their library-puzzle attempts — for the first import
 * (Phase 2) the user-tables are empty so this is a non-issue. Re-imports
 * later need a different strategy (staged table + ON CONFLICT DO UPDATE).
 */
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

const SRC = join(process.cwd(), "data", "puzzles.sqlite");
const RATING_BUCKET = 100;
const RATING_MIN = 400;
const RATING_MAX = 3000;

const argPerCell = (() => {
  const i = process.argv.indexOf("--per-cell");
  if (i >= 0 && process.argv[i + 1]) {
    const n = Number(process.argv[i + 1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 7700;
})();

const DB_URL = process.env.SUPABASE_DB_URL?.trim();
if (!DB_URL) {
  console.error("✗ SUPABASE_DB_URL is not set. Add it to .env.local.");
  process.exit(1);
}
if (!existsSync(SRC)) {
  console.error(`✗ Source not found: ${SRC} (run 'npm run data:setup' first)`);
  process.exit(1);
}

// ---------- CSV helpers ------------------------------------------------------

function csvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",") + "\n";
}

async function copyCsv(
  client: Client,
  table: string,
  columns: string[],
  rows: Iterable<(string | number | null | undefined)[]>,
): Promise<number> {
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const sql = `COPY ${table} (${colList}) FROM STDIN WITH (FORMAT csv, HEADER false, NULL '')`;
  const stream = client.query(copyFrom(sql));
  let count = 0;
  const source = Readable.from(
    (function* () {
      for (const r of rows) {
        count++;
        yield csvRow(r);
      }
    })(),
    { objectMode: false },
  );
  await pipeline(source, stream);
  return count;
}

// ---------- Sampling on local SQLite ----------------------------------------

interface PuzzleRow {
  puzzle_id: string;
  fen: string;
  moves: string;
  rating: number;
  rating_deviation: number;
  popularity: number;
  nb_plays: number;
  game_url: string | null;
  level: string;
}

console.log(
  `▸ Sampling puzzles from ${SRC} (per-cell K=${argPerCell.toLocaleString()})`,
);
const src = new Database(SRC, { readonly: true });
src.pragma("cache_size = -262144");

const t0 = Date.now();
const sampleQuery = `
  SELECT puzzle_id, fen, moves, rating, rating_deviation,
         popularity, nb_plays, game_url, level
  FROM (
    SELECT *,
           ROW_NUMBER() OVER (
             PARTITION BY level,
                          MIN(${RATING_MAX} - 1, MAX(${RATING_MIN}, rating)) / ${RATING_BUCKET}
             ORDER BY popularity DESC, nb_plays DESC, puzzle_id
           ) AS rn
    FROM puzzles
    WHERE rating >= ${RATING_MIN} AND rating < ${RATING_MAX}
  )
  WHERE rn <= ?
`;
const puzzles = src.prepare(sampleQuery).all(argPerCell) as PuzzleRow[];
console.log(
  `  → ${puzzles.length.toLocaleString()} puzzles (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
);

// Stage IDs in a SQLite temp table so theme/opening pulls are JOINs not
// 200K-element IN-clauses (which SQLite doesn't love anyway).
src.exec(`CREATE TEMP TABLE _ids(puzzle_id TEXT PRIMARY KEY) WITHOUT ROWID;`);
const insertId = src.prepare(`INSERT INTO _ids VALUES (?)`);
const txIds = src.transaction((arr: PuzzleRow[]) => {
  for (const p of arr) insertId.run(p.puzzle_id);
});
txIds(puzzles);

interface ThemeRow {
  puzzle_id: string;
  theme: string;
}
interface OpeningRow {
  puzzle_id: string;
  opening_tag: string;
}

console.log("▸ Pulling themes…");
const themesT0 = Date.now();
const themes = src
  .prepare(
    `SELECT t.puzzle_id, t.theme
     FROM puzzle_themes t JOIN _ids i ON i.puzzle_id = t.puzzle_id`,
  )
  .all() as ThemeRow[];
console.log(
  `  → ${themes.length.toLocaleString()} theme rows (${((Date.now() - themesT0) / 1000).toFixed(1)}s)`,
);

console.log("▸ Pulling openings…");
const openingsT0 = Date.now();
const openings = src
  .prepare(
    `SELECT o.puzzle_id, o.opening_tag
     FROM puzzle_openings o JOIN _ids i ON i.puzzle_id = o.puzzle_id`,
  )
  .all() as OpeningRow[];
console.log(
  `  → ${openings.length.toLocaleString()} opening rows (${((Date.now() - openingsT0) / 1000).toFixed(1)}s)`,
);

src.close();

// ---------- Stream into Postgres --------------------------------------------

const client = new Client({ connectionString: DB_URL });

async function run() {
  console.log("▸ Connecting to Postgres…");
  await client.connect();

  // One big transaction so a partial failure rolls back instead of leaving
  // half a dataset.
  await client.query("BEGIN");
  try {
    // The Supabase pooler enforces a default statement_timeout (~8 s on
    // free tier) which kills the COPY mid-stream with error 57014. Disable
    // it for this transaction only; SET LOCAL is unwound at COMMIT/ROLLBACK
    // and won't leak to other sessions sharing the pooled connection. Same
    // for the idle-in-transaction watchdog while indexes/ANALYZE run.
    await client.query("SET LOCAL statement_timeout = 0");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = 0");

    // Wipe the library tables. CASCADE clears chess_attempts.lib_puzzle_id
    // rows (none on first import; see header for re-import caveat). The
    // count tables aren't FK-tied so RESTART IDENTITY isn't relevant.
    console.log("▸ Truncating library tables…");
    await client.query(`
      TRUNCATE TABLE
        public.chess_lib_themes,
        public.chess_lib_openings,
        public.chess_lib_theme_counts,
        public.chess_lib_opening_counts,
        public.chess_lib_puzzles
      CASCADE
    `);

    console.log(
      `▸ COPY chess_lib_puzzles (${puzzles.length.toLocaleString()} rows)…`,
    );
    const pT0 = Date.now();
    const pCount = await copyCsv(
      client,
      "public.chess_lib_puzzles",
      [
        "puzzle_id",
        "fen",
        "moves",
        "rating",
        "rating_deviation",
        "popularity",
        "nb_plays",
        "game_url",
        "level",
      ],
      (function* () {
        for (const p of puzzles) {
          yield [
            p.puzzle_id,
            p.fen,
            p.moves,
            p.rating,
            p.rating_deviation,
            p.popularity,
            p.nb_plays,
            p.game_url, // null → empty CSV cell → NULL in Postgres
            p.level,
          ];
        }
      })(),
    );
    console.log(`  ✓ ${pCount.toLocaleString()} rows in ${((Date.now() - pT0) / 1000).toFixed(1)}s`);

    console.log(
      `▸ COPY chess_lib_themes (${themes.length.toLocaleString()} rows)…`,
    );
    const tT0 = Date.now();
    const tCount = await copyCsv(
      client,
      "public.chess_lib_themes",
      ["puzzle_id", "theme"],
      (function* () {
        for (const r of themes) yield [r.puzzle_id, r.theme];
      })(),
    );
    console.log(`  ✓ ${tCount.toLocaleString()} rows in ${((Date.now() - tT0) / 1000).toFixed(1)}s`);

    console.log(
      `▸ COPY chess_lib_openings (${openings.length.toLocaleString()} rows)…`,
    );
    const oT0 = Date.now();
    const oCount = await copyCsv(
      client,
      "public.chess_lib_openings",
      ["puzzle_id", "opening_tag"],
      (function* () {
        for (const r of openings) yield [r.puzzle_id, r.opening_tag];
      })(),
    );
    console.log(`  ✓ ${oCount.toLocaleString()} rows in ${((Date.now() - oT0) / 1000).toFixed(1)}s`);

    // Recompute count lookups. Server-side aggregation — no row payload over
    // the wire — finishes in milliseconds.
    console.log("▸ Recomputing chess_lib_theme_counts / chess_lib_opening_counts…");
    const cT0 = Date.now();
    await client.query(`
      INSERT INTO public.chess_lib_theme_counts (theme, level, count)
      SELECT t.theme, p.level, COUNT(*)
      FROM public.chess_lib_themes t
      JOIN public.chess_lib_puzzles p ON p.puzzle_id = t.puzzle_id
      GROUP BY t.theme, p.level
    `);
    await client.query(`
      INSERT INTO public.chess_lib_opening_counts (opening_tag, level, count)
      SELECT o.opening_tag, p.level, COUNT(*)
      FROM public.chess_lib_openings o
      JOIN public.chess_lib_puzzles p ON p.puzzle_id = o.puzzle_id
      GROUP BY o.opening_tag, p.level
    `);
    console.log(`  ✓ counts rebuilt in ${((Date.now() - cT0) / 1000).toFixed(1)}s`);

    // ANALYZE so the planner has fresh stats for the new row counts.
    console.log("▸ ANALYZE…");
    await client.query("ANALYZE public.chess_lib_puzzles");
    await client.query("ANALYZE public.chess_lib_themes");
    await client.query("ANALYZE public.chess_lib_openings");
    await client.query("ANALYZE public.chess_lib_theme_counts");
    await client.query("ANALYZE public.chess_lib_opening_counts");

    await client.query("COMMIT");
    console.log(
      `\n✓ Import complete in ${((Date.now() - t0) / 1000).toFixed(1)}s. Run scripts/verify-puzzles-supabase.ts for the coverage report.`,
    );
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error("✗ Import failed:", e);
  process.exit(1);
});
