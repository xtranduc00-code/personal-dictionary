#!/usr/bin/env tsx
/**
 * Throw-away helper: run a single .sql file against $SUPABASE_DB_URL.
 * Used by the chess-library Phase 2 migration. Safe to delete after use.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const path = process.argv[2];
if (!path) {
  console.error("Usage: tsx scripts/_apply-sql.ts <path>");
  process.exit(1);
}
const url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  console.error("SUPABASE_DB_URL not set");
  process.exit(1);
}

async function main() {
  const sql = readFileSync(path, "utf-8");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log(`▸ Applying ${path}`);
    const t0 = Date.now();
    await client.query(sql);
    console.log(`  ✓ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE 'chess_lib_%'
             OR table_name IN ('chess_attempts', 'chess_game_puzzles'))
      ORDER BY table_name
    `);
    console.log("Tables present:");
    for (const r of tables.rows) console.log("  -", r.table_name);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
