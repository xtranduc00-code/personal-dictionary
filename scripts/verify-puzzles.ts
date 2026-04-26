#!/usr/bin/env tsx
/** Pass-1 verification: row counts + canonical query timings. */
import Database from "better-sqlite3";
import { join } from "node:path";

const db = new Database(join(process.cwd(), "data", "puzzles.sqlite"));
db.pragma("cache_size = -262144");

// Add the missing composite index (idempotent: CREATE INDEX IF NOT EXISTS).
// `(level, popularity DESC)` lets the planner walk popular puzzles per
// difficulty bucket without sorting. This is the hot path for "show me
// fork puzzles in beginner sorted by popular".
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_puzzles_level_popularity
    ON puzzles(level, popularity DESC, nb_plays DESC, puzzle_id);
  CREATE INDEX IF NOT EXISTS idx_themes_puzzle_theme
    ON puzzle_themes(puzzle_id, theme);
  ANALYZE;
`);

function timed<T>(label: string, fn: () => T): T {
  fn(); // warm cache
  const t0 = process.hrtime.bigint();
  const out = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  ${label.padEnd(58)} ${ms.toFixed(1)} ms`);
  return out;
}

console.log("─── Row counts ───────────────────────────────");
const counts = {
  puzzles: (db.prepare("SELECT COUNT(*) AS n FROM puzzles").get() as { n: number }).n,
  themes: (db.prepare("SELECT COUNT(*) AS n FROM puzzle_themes").get() as { n: number }).n,
  openings: (db.prepare("SELECT COUNT(*) AS n FROM puzzle_openings").get() as { n: number }).n,
};
console.log(`  puzzles          ${counts.puzzles.toLocaleString().padStart(12)}`);
console.log(`  puzzle_themes    ${counts.themes.toLocaleString().padStart(12)}`);
console.log(`  puzzle_openings  ${counts.openings.toLocaleString().padStart(12)}`);

console.log("─── Theme + level spot checks ──────────────");
const tq = db.prepare(
  `SELECT COUNT(*) AS n FROM puzzle_themes t JOIN puzzles p ON p.puzzle_id=t.puzzle_id
   WHERE t.theme = ? AND p.level = ?`,
);
for (const [theme, lvl] of [
  ["fork", "beginner"], ["skewer", "beginner"], ["mateIn1", "beginner"],
  ["bodenMate", "expert"], ["hookMate", "intermediate"],
] as const) {
  const r = tq.get(theme, lvl) as { n: number };
  console.log(`  ${(theme + "/" + lvl).padEnd(28)} ${r.n.toLocaleString().padStart(10)}`);
}

console.log("─── Query timings (warm cache, 2nd run) ────");

// 1) fork + beginner, popularity sort, top 20 — JOIN style
timed("fork + beginner, popular, top 20  (JOIN)", () =>
  db.prepare(
    `SELECT p.puzzle_id, p.rating, p.popularity
       FROM puzzles p
       JOIN puzzle_themes t ON t.puzzle_id = p.puzzle_id
      WHERE p.level = 'beginner' AND t.theme = 'fork'
      ORDER BY p.popularity DESC, p.nb_plays DESC, p.puzzle_id
      LIMIT 20`,
  ).all(),
);

// 1b) Same but EXISTS-style — sometimes planner picks differently
timed("fork + beginner, popular, top 20  (EXISTS)", () =>
  db.prepare(
    `SELECT p.puzzle_id, p.rating, p.popularity
       FROM puzzles p
      WHERE p.level = 'beginner'
        AND EXISTS (SELECT 1 FROM puzzle_themes t WHERE t.puzzle_id = p.puzzle_id AND t.theme = 'fork')
      ORDER BY p.popularity DESC, p.nb_plays DESC, p.puzzle_id
      LIMIT 20`,
  ).all(),
);

// 2) skewer + beginner
timed("skewer + beginner, popular, top 20 (JOIN)", () =>
  db.prepare(
    `SELECT p.puzzle_id
       FROM puzzles p
       JOIN puzzle_themes t ON t.puzzle_id = p.puzzle_id
      WHERE p.level = 'beginner' AND t.theme = 'skewer'
      ORDER BY p.popularity DESC, p.nb_plays DESC, p.puzzle_id
      LIMIT 20`,
  ).all(),
);

// 3) Random over 5.8M — rowid jump (no OFFSET)
const total = (db.prepare("SELECT COUNT(*) AS n FROM puzzles").get() as { n: number }).n;
const maxRowid = (db.prepare("SELECT MAX(rowid) AS m FROM puzzles").get() as { m: number }).m;
timed("random over 5.8M, top 20  (rowid jump)", () => {
  const target = 1 + Math.floor(Math.random() * maxRowid);
  return db.prepare(`SELECT puzzle_id FROM puzzles WHERE rowid >= ? LIMIT 20`).all(target);
});

// 3b) Compare: ORDER BY RANDOM() over 5.8M
timed("random over 5.8M, top 20  (ORDER BY RANDOM())", () =>
  db.prepare(`SELECT puzzle_id FROM puzzles ORDER BY RANDOM() LIMIT 20`).all(),
);

// 4) Multi-theme AND match (fork + middlegame), beginner, popular
timed("fork+middlegame AND beginner, popular, top 20  (CTE+JOIN)", () =>
  db.prepare(
    `WITH matched AS (
        SELECT puzzle_id FROM puzzle_themes
        WHERE theme IN ('fork','middlegame')
        GROUP BY puzzle_id HAVING COUNT(DISTINCT theme) = 2
      )
      SELECT p.puzzle_id
        FROM puzzles p
        JOIN matched m ON m.puzzle_id = p.puzzle_id
       WHERE p.level = 'beginner'
       ORDER BY p.popularity DESC, p.puzzle_id
       LIMIT 20`,
  ).all(),
);

// 4b) Multi-theme as nested EXISTS
timed("fork+middlegame AND beginner, popular, top 20  (EXISTS×2)", () =>
  db.prepare(
    `SELECT p.puzzle_id
       FROM puzzles p
      WHERE p.level = 'beginner'
        AND EXISTS (SELECT 1 FROM puzzle_themes WHERE puzzle_id = p.puzzle_id AND theme = 'fork')
        AND EXISTS (SELECT 1 FROM puzzle_themes WHERE puzzle_id = p.puzzle_id AND theme = 'middlegame')
      ORDER BY p.popularity DESC, p.puzzle_id
      LIMIT 20`,
  ).all(),
);

// 5) PK lookup
timed("getById (PK lookup)", () =>
  db.prepare("SELECT * FROM puzzles WHERE puzzle_id = ?").get("00008"),
);

// 6) Theme count by level — materialised lookup (used by browse-page chips)
timed("theme count: fork @ beginner  (materialised)", () =>
  db.prepare(
    `SELECT count FROM theme_counts WHERE theme = ? AND level = ?`,
  ).get("fork", "beginner"),
);

// 6b) For comparison: live JOIN aggregation (the old path)
timed("theme count: fork @ beginner  (live JOIN)", () =>
  db.prepare(
    `SELECT COUNT(*) AS n FROM puzzle_themes t JOIN puzzles p ON p.puzzle_id=t.puzzle_id
     WHERE t.theme = ? AND p.level = ?`,
  ).get("fork", "beginner"),
);

// 7) Render an entire browse page's theme chips for one level (64 lookups)
timed("ALL theme counts at beginner (64 lookups)", () => {
  const stmt = db.prepare(`SELECT count FROM theme_counts WHERE theme = ? AND level = ?`);
  const themes = ["mix","advantage","crushing","equality","opening","middlegame","endgame","rookEndgame","bishopEndgame","pawnEndgame","knightEndgame","queenEndgame","queenRookEndgame","advancedPawn","attackingF2F7","attraction","capturingDefender","discoveredAttack","doubleCheck","exposedKing","fork","hangingPiece","kingsideAttack","pin","queensideAttack","sacrifice","skewer","trappedPiece","deflection","decoy","interference","intermezzo","xRayAttack","defensiveMove","quietMove","zugzwang","promotion","underPromotion","castling","enPassant","mate","mateIn1","mateIn2","mateIn3","mateIn4","mateIn5","backRankMate","anastasiaMate","arabianMate","bodenMate","doubleBishopMate","dovetailMate","hookMate","killBoxMate","smotheredMate","vukovicMate","oneMove","short","long","veryLong","master","masterVsMaster","superGM","playerGames"];
  return themes.map((t) => stmt.get(t, "beginner"));
});

db.close();
