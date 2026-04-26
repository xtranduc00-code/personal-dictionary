#!/usr/bin/env tsx
/**
 * Build a deployable subset of `data/puzzles.sqlite` (~3.6 GB, full Lichess
 * dataset) into `data/puzzles-prod.sqlite` (~80 MB), small enough to commit
 * and ship inside a Netlify Function bundle.
 *
 * Strategy: stratified top-K sampling.
 *   For each (level × rating-bucket) cell, take the top K puzzles by
 *   popularity DESC, nb_plays DESC. This preserves rating spread across
 *   every level and prefers high-quality puzzles within each stratum, so
 *   no theme/rating combo is empty after sampling.
 *
 * Run:  npx tsx scripts/build-puzzles-prod.ts
 */
import Database from "better-sqlite3";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "data", "puzzles.sqlite");
const DST = join(process.cwd(), "data", "puzzles-prod.sqlite");

// 100-pt rating buckets between [400, 3000); rare extremes (<400 / ≥3000)
// fall outside, but they're near-empty in the source anyway.
const RATING_BUCKET = 100;
const RATING_MIN = 400;
const RATING_MAX = 3000;

// Per-(level × bucket) cap. The source has 26 distinct cells (every cell
// is densely populated, so the limit is the only thing controlling output
// size). 5000 / cell → ~130k puzzles, ~75 MB file — comfortably under the
// 250 MB Netlify Function bundle ceiling.
const PER_CELL_LIMIT = 5000;

function fmtBytes(n: number): string {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`Missing ${SRC}. Run the import script first.`);
    process.exit(1);
  }
  if (existsSync(DST)) {
    unlinkSync(DST);
  }

  const t0 = Date.now();
  const src = new Database(SRC, { readonly: true });
  src.pragma("cache_size = -262144");
  const dst = new Database(DST);
  dst.pragma("journal_mode = OFF"); // bulk-load mode; we'll flip back at the end
  dst.pragma("synchronous = OFF");

  // 1. Schema — same shape as full DB (route code expects identical columns
  //    and tables). Indexes come AFTER bulk insert (faster).
  dst.exec(`
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
    CREATE TABLE puzzle_themes (
      puzzle_id TEXT NOT NULL,
      theme     TEXT NOT NULL
    );
    CREATE TABLE puzzle_openings (
      puzzle_id   TEXT NOT NULL,
      opening_tag TEXT NOT NULL
    );
    CREATE TABLE theme_counts (
      theme  TEXT NOT NULL,
      level  TEXT NOT NULL,
      count  INTEGER NOT NULL,
      PRIMARY KEY (theme, level)
    ) WITHOUT ROWID;
    CREATE TABLE opening_counts (
      opening_tag TEXT NOT NULL,
      level       TEXT NOT NULL,
      count       INTEGER NOT NULL,
      PRIMARY KEY (opening_tag, level)
    ) WITHOUT ROWID;
    CREATE TABLE meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 2. Sample puzzle IDs. ROW_NUMBER over PARTITION BY (level, rating bucket)
  //    ORDER BY popularity DESC keeps the best puzzles in each cell.
  console.log("Sampling puzzle IDs from source…");
  const sampledIds = src
    .prepare(
      `
      SELECT puzzle_id
      FROM (
        SELECT puzzle_id,
               ROW_NUMBER() OVER (
                 PARTITION BY level, MIN(${RATING_MAX} - 1, MAX(${RATING_MIN}, rating)) / ${RATING_BUCKET}
                 ORDER BY popularity DESC, nb_plays DESC, puzzle_id
               ) AS rn
        FROM puzzles
        WHERE rating >= ${RATING_MIN} AND rating < ${RATING_MAX}
      )
      WHERE rn <= ?
      `,
    )
    .all(PER_CELL_LIMIT) as { puzzle_id: string }[];
  console.log(`  → ${sampledIds.length.toLocaleString()} puzzles selected`);

  // 3. Stage IDs in a temp table on the destination so the IN-clause stays
  //    bounded and the inserts can JOIN against it. Inserting via temp +
  //    cross-database ATTACH is faster than 200k single-row inserts.
  dst.exec(`CREATE TEMP TABLE _ids (puzzle_id TEXT PRIMARY KEY) WITHOUT ROWID;`);
  const insertId = dst.prepare(`INSERT INTO _ids(puzzle_id) VALUES (?)`);
  const txIds = dst.transaction((rows: { puzzle_id: string }[]) => {
    for (const r of rows) insertId.run(r.puzzle_id);
  });
  txIds(sampledIds);

  // ATTACH source so we can copy rows in one statement per table.
  const escapedSrc = SRC.replace(/'/g, "''");
  dst.exec(`ATTACH DATABASE '${escapedSrc}' AS src`);

  console.log("Copying puzzle rows…");
  dst.exec(`
    INSERT INTO puzzles
      SELECT p.* FROM src.puzzles p
      JOIN _ids i ON i.puzzle_id = p.puzzle_id;
  `);

  console.log("Copying puzzle_themes…");
  dst.exec(`
    INSERT INTO puzzle_themes
      SELECT t.puzzle_id, t.theme FROM src.puzzle_themes t
      JOIN _ids i ON i.puzzle_id = t.puzzle_id;
  `);

  console.log("Copying puzzle_openings…");
  dst.exec(`
    INSERT INTO puzzle_openings
      SELECT o.puzzle_id, o.opening_tag FROM src.puzzle_openings o
      JOIN _ids i ON i.puzzle_id = o.puzzle_id;
  `);

  // 4. Recompute count tables — fast-path counts depend on these. Source
  //    tables can't be reused because they were computed for the full set.
  console.log("Recomputing theme_counts / opening_counts…");
  dst.exec(`
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

  // Copy meta rows (build hash, source dataset version, etc.) and stamp
  // the subset's own marker so we can tell at runtime which file is open.
  dst.exec(`INSERT INTO meta SELECT key, value FROM src.meta;`);
  const upsertMeta = dst.prepare(
    `INSERT INTO meta(key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  upsertMeta.run("subset_built_at", new Date().toISOString());
  upsertMeta.run("subset_per_cell", String(PER_CELL_LIMIT));
  upsertMeta.run("subset_total", String(sampledIds.length));

  dst.exec(`DETACH DATABASE src`);
  dst.exec(`DROP TABLE _ids;`);

  // 5. Indexes — created AFTER inserts so SQLite doesn't maintain them
  //    during the bulk load (≈3× faster than indexed-then-inserted).
  console.log("Creating indexes…");
  dst.exec(`
    CREATE INDEX idx_puzzles_level_rating ON puzzles(level, rating);
    CREATE INDEX idx_puzzles_rating       ON puzzles(rating);
    CREATE INDEX idx_puzzles_popularity   ON puzzles(popularity DESC, nb_plays DESC);
    CREATE INDEX idx_puzzles_level_popularity
      ON puzzles(level, popularity DESC, nb_plays DESC, puzzle_id);
    CREATE INDEX idx_themes_puzzle        ON puzzle_themes(puzzle_id);
    CREATE INDEX idx_themes_theme         ON puzzle_themes(theme, puzzle_id);
    CREATE INDEX idx_themes_puzzle_theme  ON puzzle_themes(puzzle_id, theme);
    CREATE INDEX idx_openings_puzzle      ON puzzle_openings(puzzle_id);
    CREATE INDEX idx_openings_tag         ON puzzle_openings(opening_tag, puzzle_id);
  `);

  // 6. Defragment — drops the file size noticeably after bulk loads. ANALYZE
  //    refreshes sqlite_stat1 so the planner picks the right indexes for
  //    the smaller dataset.
  console.log("ANALYZE + VACUUM…");
  dst.pragma("synchronous = NORMAL");
  dst.pragma("journal_mode = DELETE"); // VACUUM requires non-WAL
  dst.exec(`ANALYZE; VACUUM;`);

  src.close();
  dst.close();

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const sz = statSync(DST).size;
  console.log(`\n✓ Wrote ${DST}`);
  console.log(`  ${sampledIds.length.toLocaleString()} puzzles, ${fmtBytes(sz)}, ${dt}s`);
}

main();
