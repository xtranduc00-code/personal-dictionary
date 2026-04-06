/**
 * Durable Spotify refresh token storage backed by Supabase.
 *
 * This provides a server-side fallback for the httpOnly cookie so that
 * Vercel serverless instances that race to rotate the refresh_token don't
 * permanently lock each other out.  The last writer wins on `upsert`, which
 * is fine because all concurrent instances received the same rotated token
 * from Spotify before the race began.
 *
 * Required Supabase table (run once in the Supabase SQL editor):
 *
 *   CREATE TABLE IF NOT EXISTS public.spotify_app_tokens (
 *     id   TEXT PRIMARY KEY DEFAULT 'default',
 *     enc  TEXT NOT NULL,
 *     ts   TIMESTAMPTZ DEFAULT NOW()
 *   );
 */

import { getSupabaseServiceClient } from "@/lib/supabase-server";

const TABLE = "spotify_app_tokens";
const ROW_ID = "default";

/** Read the encrypted refresh token from the DB. Returns null on any error. */
export async function dbReadSpotifyRt(): Promise<string | null> {
  try {
    const db = getSupabaseServiceClient();
    if (!db) return null;
    const { data } = await db
      .from(TABLE)
      .select("enc")
      .eq("id", ROW_ID)
      .maybeSingle();
    return (data as { enc?: string } | null)?.enc ?? null;
  } catch {
    return null;
  }
}

/** Upsert the encrypted refresh token to the DB. Returns true on success. */
export async function dbWriteSpotifyRt(enc: string): Promise<boolean> {
  try {
    const db = getSupabaseServiceClient();
    if (!db) return false;
    const { error } = await db.from(TABLE).upsert({
      id: ROW_ID,
      enc,
      ts: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}
