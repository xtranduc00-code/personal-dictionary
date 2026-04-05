import { getSiteUrl } from "@/lib/site-url";

/**
 * OAuth redirect URI must match Spotify Dashboard exactly.
 * Prefer SPOTIFY_REDIRECT_URI when dev/prod hosts differ from NEXT_PUBLIC_SITE_URL.
 */
export function spotifyRedirectUriFromRequest(req: Request): string {
  const explicit = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  try {
    const u = new URL(req.url);
    if (u.host) return `${u.protocol}//${u.host}/api/spotify/callback`;
  } catch {
    /* fall through */
  }
  return `${getSiteUrl()}/api/spotify/callback`;
}
