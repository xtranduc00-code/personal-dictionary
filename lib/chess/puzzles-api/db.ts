/**
 * Postgres connection for the chess puzzle API.
 *
 * Replaces the previous local-SQLite (`better-sqlite3`) implementation.
 * Reads + writes go directly through `pg` against the Supabase Postgres
 * project — same tables (`chess_lib_puzzles`, `chess_lib_themes`,
 * `chess_lib_openings`, `chess_lib_theme_counts`, `chess_lib_opening_counts`,
 * `chess_attempts`, `chess_game_puzzles`) defined by
 * `scripts/sql/chess_library_migration.sql`.
 *
 * Why `pg` instead of the Supabase JS client?
 *   The library query joins puzzles with multiple EXISTS subqueries against
 *   the themes/openings tables (multi-theme AND + opening OR), uses window
 *   functions, and a 1001-row probe count. PostgREST can't express this
 *   shape; defining a sprawling RPC function would just hide the same SQL
 *   behind another layer. A direct pg pool keeps query strings 1:1 with
 *   the original SQLite SQL — every route migrates by swapping `?` for
 *   `$N`, and `db.prepare(...)` for `pool.query(...)`.
 *
 * The pool is stored on `globalThis` so Next.js dev-mode HMR doesn't spawn
 * a fresh pool on every file change (would otherwise leak connections).
 *
 * Connection string lives in `SUPABASE_DB_URL`. The "Connection pooling"
 * URI from the Supabase dashboard (port 6543, transaction mode) is what we
 * want — pgBouncer keeps actual Postgres connections low even when many
 * Lambda concurrent requests come in.
 */
import { Pool, type PoolClient } from "pg";

const KEY = "__ken_chess_pg_pool" as const;
type Globalish = typeof globalThis & { [KEY]?: Pool };

function buildPool(): Pool {
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    throw new ChessLibUnavailableError(
      "SUPABASE_DB_URL is not set. Add it to .env.local (server) and the " +
        "Netlify environment (production).",
    );
  }
  return new Pool({
    connectionString: url,
    max: 4, // Generous for a single-user app; pgBouncer fans out below.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    // statement_timeout is enforced by Supabase pooler (~8 s on free tier);
    // we don't override here. Long-running aggregates that exceed it will
    // surface as 57014 from Postgres and be visible to the route handler.
  });
}

export class ChessLibUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ChessLibUnavailableError";
  }
}

/** Singleton pg pool. Reuses across hot reloads. */
export function getPool(): Pool {
  const g = globalThis as Globalish;
  if (!g[KEY]) {
    g[KEY] = buildPool();
  }
  return g[KEY]!;
}

/** Run a single query and return its rows. Helper to keep call sites
 *  short — the pg client uses `$1, $2 …` parameter syntax (different from
 *  SQLite's `?`), which is reflected in every query string in this module.
 */
export async function pgRows<T extends Record<string, any>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(sql, params);
  return res.rows;
}

/** Same but returns a single row or null — for `SELECT … WHERE id = $1`
 *  shaped queries. */
export async function pgOne<T extends Record<string, any>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await pgRows<T>(sql, params);
  return rows[0] ?? null;
}

/** Borrow a client for a multi-statement transaction. Wraps BEGIN/COMMIT/
 *  ROLLBACK so callers can't forget them. */
export async function pgTx<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    try {
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  } finally {
    client.release();
  }
}
