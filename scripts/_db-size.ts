#!/usr/bin/env tsx
/** Throw-away: report Postgres total + per-table sizes. */
import { Client } from "pg";
const url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  console.error("SUPABASE_DB_URL not set");
  process.exit(1);
}
async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const total = await c.query<{ pretty: string }>(
      `SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty`,
    );
    console.log(`Database total: ${total.rows[0].pretty}`);
    const rows = await c.query<{ name: string; pretty: string }>(`
      SELECT t.relname AS name,
             pg_size_pretty(pg_total_relation_size(t.oid)) AS pretty
      FROM pg_class t
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relkind = 'r'
        AND (t.relname LIKE 'chess_%' OR t.relname IN ('user_puzzle_progress'))
      ORDER BY pg_total_relation_size(t.oid) DESC
    `);
    for (const r of rows.rows) console.log(`  ${r.name.padEnd(32)} ${r.pretty}`);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
