#!/usr/bin/env tsx
/**
 * One-shot import of the Lichess puzzle CSV into a local SQLite file.
 *
 * Reads:   data/lichess_db_puzzle.csv  (~5.8M rows, ~2 GB)
 * Writes:  data/puzzles.sqlite          (~1.5 GB after indexes)
 *
 * Usage:
 *   tsx scripts/import-puzzles.ts          # safe: refuses to overwrite
 *   tsx scripts/import-puzzles.ts --force  # re-create the DB from scratch
 *
 * Strategy: stream-parse the CSV, batch-insert 10k rows per transaction,
 * build indexes only after the bulk load (~10× faster than inserting with
 * indexes live).
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const CSV_PATH = join(ROOT, "data", "lichess_db_puzzle.csv");
const DB_PATH = join(ROOT, "data", "puzzles.sqlite");
const FORCE = process.argv.includes("--force");

if (!existsSync(CSV_PATH)) {
  console.error(`✗ CSV not found at ${CSV_PATH}`);
  console.error("  Run 'npm run data:download' first.");
  process.exit(1);
}

if (existsSync(DB_PATH) && !FORCE) {
  console.error(`✗ Database already exists at ${DB_PATH}`);
  console.error("  Re-run with --force to recreate from scratch.");
  process.exit(1);
}

console.log(`▸ Importing ${CSV_PATH} → ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
// Trade durability for import speed — the import is idempotent anyway.
db.pragma("synchronous = NORMAL");
db.pragma("temp_store = MEMORY");
// Increase the page cache to ~1 GB during the bulk load.
db.pragma("cache_size = -1048576");

db.exec(`
  DROP TABLE IF EXISTS puzzles;
  DROP TABLE IF EXISTS puzzle_themes;
  DROP TABLE IF EXISTS puzzle_openings;
  DROP TABLE IF EXISTS meta;

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- One row per puzzle. 'level' is denormalised from rating so range scans
  -- by difficulty bucket can use a composite index without computing the
  -- bucket on every query.
  CREATE TABLE puzzles (
    puzzle_id        TEXT PRIMARY KEY,
    fen              TEXT NOT NULL,
    moves            TEXT NOT NULL,
    rating           INTEGER NOT NULL,
    rating_deviation INTEGER NOT NULL,
    popularity       INTEGER NOT NULL,
    nb_plays         INTEGER NOT NULL,
    game_url         TEXT,
    level            TEXT NOT NULL CHECK (level IN ('beginner','intermediate','hard','expert'))
  );

  -- Many-to-many junction tables. Indexes are built AFTER the bulk insert
  -- (see further down) so we don't pay write-amplification on every row.
  CREATE TABLE puzzle_themes (
    puzzle_id TEXT NOT NULL,
    theme     TEXT NOT NULL
  );
  CREATE TABLE puzzle_openings (
    puzzle_id   TEXT NOT NULL,
    opening_tag TEXT NOT NULL
  );
`);

function ratingBucket(rating: number): "beginner" | "intermediate" | "hard" | "expert" {
  if (rating < 1100) return "beginner";
  if (rating < 1500) return "intermediate";
  if (rating < 1900) return "hard";
  return "expert";
}

const insertPuzzle = db.prepare(
  `INSERT INTO puzzles (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, game_url, level)
   VALUES (@puzzle_id, @fen, @moves, @rating, @rating_deviation, @popularity, @nb_plays, @game_url, @level)`,
);
const insertTheme = db.prepare(`INSERT INTO puzzle_themes VALUES (?, ?)`);
const insertOpening = db.prepare(`INSERT INTO puzzle_openings VALUES (?, ?)`);

interface Row {
  puzzle_id: string;
  fen: string;
  moves: string;
  rating: number;
  rating_deviation: number;
  popularity: number;
  nb_plays: number;
  game_url: string | null;
  level: "beginner" | "intermediate" | "hard" | "expert";
  themes: string[];
  openings: string[];
}

const writeBatch = db.transaction((rows: Row[]) => {
  for (const r of rows) {
    insertPuzzle.run(r);
    for (const t of r.themes) insertTheme.run(r.puzzle_id, t);
    for (const o of r.openings) insertOpening.run(r.puzzle_id, o);
  }
});

const BATCH = 10_000;
let buffer: Row[] = [];
let processed = 0;
const start = Date.now();

const parser = parse({
  delimiter: ",",
  skip_empty_lines: true,
  relax_column_count: true,
  // Lichess CSV: header on row 1.
  from_line: 2,
});

parser.on("readable", () => {
  let record: string[] | null;
  while ((record = parser.read() as string[] | null) !== null) {
    const [
      puzzleId, fen, moves, rating, ratingDeviation,
      popularity, nbPlays, themes, gameUrl, openingTags,
    ] = record;
    const r: Row = {
      puzzle_id: puzzleId,
      fen,
      moves,
      rating: parseInt(rating, 10),
      rating_deviation: parseInt(ratingDeviation, 10),
      popularity: parseInt(popularity, 10),
      nb_plays: parseInt(nbPlays, 10),
      game_url: gameUrl || null,
      level: ratingBucket(parseInt(rating, 10)),
      themes: (themes ?? "").trim().split(/\s+/).filter(Boolean),
      openings: (openingTags ?? "").trim().split(/\s+/).filter(Boolean),
    };
    buffer.push(r);
    if (buffer.length >= BATCH) {
      writeBatch(buffer);
      processed += buffer.length;
      buffer = [];
      if (processed % 100_000 === 0) {
        const elapsedS = ((Date.now() - start) / 1000).toFixed(1);
        const rate = Math.round(processed / Math.max(1, (Date.now() - start) / 1000));
        console.log(`  ${processed.toLocaleString()} rows · ${elapsedS}s · ${rate.toLocaleString()}/s`);
      }
    }
  }
});

parser.on("error", (err) => {
  console.error("✗ CSV parse error:", err);
  process.exit(1);
});

parser.on("end", () => {
  if (buffer.length > 0) {
    writeBatch(buffer);
    processed += buffer.length;
  }
  const insertS = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✓ Inserted ${processed.toLocaleString()} puzzles in ${insertS}s`);

  console.log("▸ Building indexes…");
  const idxStart = Date.now();
  db.exec(`
    -- Composite (level, rating) — used by rating-range scans within a level.
    CREATE INDEX idx_puzzles_level_rating ON puzzles(level, rating);
    -- (level, popularity DESC) — the actual hot path: sorted feed per
    -- difficulty bucket. The query planner walks this index in order,
    -- short-circuits as soon as LIMIT N matches are accumulated.
    CREATE INDEX idx_puzzles_level_popularity
      ON puzzles(level, popularity DESC, nb_plays DESC, puzzle_id);
    -- Plain rating range, used when no level filter is active.
    CREATE INDEX idx_puzzles_rating       ON puzzles(rating);
    -- Theme filter: (theme, puzzle_id) covers theme→puzzle lookup.
    CREATE INDEX idx_themes_theme         ON puzzle_themes(theme, puzzle_id);
    -- (puzzle_id, theme) covers EXISTS checks during multi-theme AND.
    CREATE INDEX idx_themes_puzzle_theme  ON puzzle_themes(puzzle_id, theme);
    -- Same shape for openings.
    CREATE INDEX idx_openings_tag         ON puzzle_openings(opening_tag, puzzle_id);
    CREATE INDEX idx_openings_puzzle_tag  ON puzzle_openings(puzzle_id, opening_tag);
  `);
  console.log(`✓ Indexes built in ${((Date.now() - idxStart) / 1000).toFixed(1)}s`);

  console.log("▸ Materialising theme + opening counts per level…");
  const matStart = Date.now();
  db.exec(`
    -- Tiny lookup tables (~300 + ~6k rows). Live count queries do
    -- ~250k-row joins and miss the 100ms target on a per-chip browse page.
    DROP TABLE IF EXISTS theme_counts;
    DROP TABLE IF EXISTS opening_counts;
    CREATE TABLE theme_counts (
      theme TEXT NOT NULL,
      level TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (theme, level)
    ) WITHOUT ROWID;
    CREATE TABLE opening_counts (
      opening_tag TEXT NOT NULL,
      level       TEXT NOT NULL,
      count       INTEGER NOT NULL,
      PRIMARY KEY (opening_tag, level)
    ) WITHOUT ROWID;
    INSERT INTO theme_counts (theme, level, count)
      SELECT t.theme, p.level, COUNT(*)
        FROM puzzle_themes t
        JOIN puzzles p ON p.puzzle_id = t.puzzle_id
       GROUP BY t.theme, p.level;
    INSERT INTO opening_counts (opening_tag, level, count)
      SELECT o.opening_tag, p.level, COUNT(*)
        FROM puzzle_openings o
        JOIN puzzles p ON p.puzzle_id = o.puzzle_id
       GROUP BY o.opening_tag, p.level;
  `);
  console.log(`✓ Counts materialised in ${((Date.now() - matStart) / 1000).toFixed(1)}s`);

  // Metadata for sanity-check / debug.
  const csvBytes = statSync(CSV_PATH).size;
  const setMeta = db.prepare(`INSERT OR REPLACE INTO meta VALUES (?, ?)`);
  setMeta.run("imported_at", new Date().toISOString());
  setMeta.run("row_count", String(processed));
  setMeta.run("csv_bytes", String(csvBytes));

  console.log("▸ Running ANALYZE for the query planner…");
  db.exec("ANALYZE");

  db.close();
  const totalS = ((Date.now() - start) / 1000).toFixed(1);
  const dbBytes = statSync(DB_PATH).size;
  console.log(
    `✓ Import complete in ${totalS}s · DB size ${(dbBytes / 1024 / 1024).toFixed(0)} MB`,
  );
});

createReadStream(CSV_PATH).pipe(parser);
