/**
 * Spotify `limit` must be a positive integer. Truncates floats ("40.1" → 40)
 * and clamps to [1, max]. Invalid raw → `fallback` clamped the same way.
 */
export function parseSpotifyPagingLimit(
  raw: string | null,
  fallback: number,
  max: number,
): number {
  const fbN = Number(fallback);
  const fb = Number.isFinite(fbN)
    ? Math.min(max, Math.max(1, Math.trunc(fbN)))
    : Math.min(max, 30);
  if (raw == null || raw.trim() === "") return fb;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fb;
  const t = Math.trunc(n);
  if (t < 1) return fb;
  return Math.min(max, t);
}

/** Non-negative integer offset for paging. */
export function parseSpotifyPagingOffset(raw: string | null): number {
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.trunc(n), 1_000_000);
}
