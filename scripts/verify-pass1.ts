#!/usr/bin/env tsx
/**
 * Pass-1 verification — runs through the actual repo.ts query path so what
 * gets measured is what the API endpoints will hit, not raw SQL I happened
 * to type into a benchmark script.
 */
import Database from "better-sqlite3";
import { join } from "node:path";
import { getPuzzleRepo } from "../lib/chess/puzzles-api/repo";

const db = new Database(join(process.cwd(), "data", "puzzles.sqlite"));
const counts = {
  puzzles: (db.prepare("SELECT COUNT(*) AS n FROM puzzles").get() as { n: number }).n,
  themes: (db.prepare("SELECT COUNT(*) AS n FROM puzzle_themes").get() as { n: number }).n,
  openings: (db.prepare("SELECT COUNT(*) AS n FROM puzzle_openings").get() as { n: number }).n,
};
db.close();

console.log("─── Counts ──────────────────────────");
console.log(`  puzzles          ${counts.puzzles.toLocaleString().padStart(14)}`);
console.log(`  puzzle_themes    ${counts.themes.toLocaleString().padStart(14)}`);
console.log(`  puzzle_openings  ${counts.openings.toLocaleString().padStart(14)}`);

const repo = getPuzzleRepo();

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  await fn();
  const t0 = process.hrtime.bigint();
  const out = await fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  ${label.padEnd(56)} ${ms.toFixed(1)} ms`);
  return out;
}

(async () => {
  console.log("─── Real query path (via repo.query) ───");

  await timed("fork @ beginner, popular, top 20", () =>
    repo.query(
      { level: "beginner", themes: ["fork"] },
      { sort: "popular", limit: 20, offset: 0 },
    ),
  );
  await timed("skewer @ beginner, popular, top 20", () =>
    repo.query(
      { level: "beginner", themes: ["skewer"] },
      { sort: "popular", limit: 20, offset: 0 },
    ),
  );
  await timed("random over 5.8M (no filter)", () =>
    repo.query({}, { sort: "random", limit: 20, offset: 0 }),
  );
  await timed("random within beginner level", () =>
    repo.query({ level: "beginner" }, { sort: "random", limit: 20, offset: 0 }),
  );
  await timed("fork+middlegame AND, beginner, popular", () =>
    repo.query(
      { level: "beginner", themes: ["fork", "middlegame"] },
      { sort: "popular", limit: 20, offset: 0 },
    ),
  );
  await timed("hardest, expert, top 20", () =>
    repo.query({ level: "expert" }, { sort: "hardest", limit: 20, offset: 0 }),
  );
  await timed("getById('00008')", () => repo.getById("00008"));
  await timed("getThemeCount('fork','beginner')", () =>
    repo.getThemeCount("fork", "beginner"),
  );
  await timed("getThemeCount × 64 themes @ beginner", async () => {
    const themes = ["mix","advantage","crushing","equality","opening","middlegame","endgame","rookEndgame","bishopEndgame","pawnEndgame","knightEndgame","queenEndgame","queenRookEndgame","advancedPawn","attackingF2F7","attraction","capturingDefender","discoveredAttack","doubleCheck","exposedKing","fork","hangingPiece","kingsideAttack","pin","queensideAttack","sacrifice","skewer","trappedPiece","deflection","decoy","interference","intermezzo","xRayAttack","defensiveMove","quietMove","zugzwang","promotion","underPromotion","castling","enPassant","mate","mateIn1","mateIn2","mateIn3","mateIn4","mateIn5","backRankMate","anastasiaMate","arabianMate","bodenMate","doubleBishopMate","dovetailMate","hookMate","killBoxMate","smotheredMate","vukovicMate","oneMove","short","long","veryLong","master","masterVsMaster","superGM","playerGames"];
    return Promise.all(themes.map((t) => repo.getThemeCount(t, "beginner")));
  });
})();
