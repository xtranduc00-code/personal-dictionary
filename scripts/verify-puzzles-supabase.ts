#!/usr/bin/env tsx
/**
 * Coverage report for the chess library import. Runs read-only queries
 * against Supabase Postgres and prints a digest:
 *
 *   - puzzles per level
 *   - themes × levels matrix; flag any (theme, level) cell with < 100 puzzles
 *   - openings: total + how many fall under thresholds we'd consider "rare"
 *
 * Usage:  npx tsx scripts/verify-puzzles-supabase.ts
 *
 * Env (same as import):
 *   SUPABASE_DB_URL  — Postgres URI (Connection pooling).
 */
import { Client } from "pg";

const DB_URL = process.env.SUPABASE_DB_URL?.trim();
if (!DB_URL) {
  console.error("✗ SUPABASE_DB_URL is not set.");
  process.exit(1);
}

const LEVELS = ["beginner", "intermediate", "hard", "expert"] as const;
const MIN_PUZZLES_PER_CELL = 100;

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // ── Puzzles per level ───────────────────────────────────────────────────
    const total = await client.query<{ level: string; n: number }>(
      `SELECT level, COUNT(*)::int AS n
       FROM public.chess_lib_puzzles
       GROUP BY level
       ORDER BY level`,
    );
    const grand = total.rows.reduce((s, r) => s + r.n, 0);
    console.log(`\nLibrary size — ${grand.toLocaleString()} puzzles`);
    for (const r of total.rows) {
      console.log(`  ${r.level.padEnd(13)} ${r.n.toLocaleString().padStart(8)}`);
    }

    // ── Themes coverage ─────────────────────────────────────────────────────
    const themesTotal = await client.query<{ n: number }>(
      `SELECT COUNT(DISTINCT theme)::int AS n FROM public.chess_lib_themes`,
    );
    console.log(
      `\nThemes — ${themesTotal.rows[0].n} distinct values across the subset`,
    );

    const themeMatrix = await client.query<{
      theme: string;
      level: string;
      count: number;
    }>(
      `SELECT theme, level, count
       FROM public.chess_lib_theme_counts
       ORDER BY theme, level`,
    );

    // Group rows into a {theme: {level: count}} map so we can list cells
    // missing per-level coverage.
    const byTheme = new Map<string, Record<string, number>>();
    for (const r of themeMatrix.rows) {
      const cur = byTheme.get(r.theme) ?? {};
      cur[r.level] = r.count;
      byTheme.set(r.theme, cur);
    }

    // Sparse theme/level cells — < MIN_PUZZLES_PER_CELL is the user's
    // chosen "is this chip useful?" threshold.
    const sparse: { theme: string; level: string; count: number }[] = [];
    for (const [theme, perLevel] of byTheme) {
      for (const lvl of LEVELS) {
        const c = perLevel[lvl] ?? 0;
        if (c < MIN_PUZZLES_PER_CELL) {
          sparse.push({ theme, level: lvl, count: c });
        }
      }
    }

    if (sparse.length === 0) {
      console.log(
        `  ✓ All ${byTheme.size * LEVELS.length} (theme × level) cells have ≥ ${MIN_PUZZLES_PER_CELL} puzzles.`,
      );
    } else {
      console.log(
        `  ⚠ ${sparse.length} cells below ${MIN_PUZZLES_PER_CELL} puzzles:`,
      );
      sparse
        .sort((a, b) => a.count - b.count || a.theme.localeCompare(b.theme))
        .slice(0, 40)
        .forEach((c) =>
          console.log(
            `    ${c.theme.padEnd(20)} ${c.level.padEnd(13)} ${String(c.count).padStart(5)}`,
          ),
        );
      if (sparse.length > 40) {
        console.log(`    … ${sparse.length - 40} more`);
      }
    }

    // ── Openings ────────────────────────────────────────────────────────────
    const openingsTotal = await client.query<{ n: number }>(
      `SELECT COUNT(DISTINCT opening_tag)::int AS n FROM public.chess_lib_openings`,
    );
    const openingPuzzleTotals = await client.query<{
      tag: string;
      n: number;
    }>(
      `SELECT opening_tag AS tag, SUM(count)::int AS n
       FROM public.chess_lib_opening_counts
       GROUP BY opening_tag`,
    );
    const lt10 = openingPuzzleTotals.rows.filter((r) => r.n < 10).length;
    const lt5 = openingPuzzleTotals.rows.filter((r) => r.n < 5).length;
    console.log(
      `\nOpenings — ${openingsTotal.rows[0].n} distinct tags in subset`,
    );
    console.log(
      `  ${lt5} tags with < 5 puzzles total (effectively single-position chips)`,
    );
    console.log(`  ${lt10} tags with < 10 puzzles total`);
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error("✗ Verification failed:", e);
  process.exit(1);
});
