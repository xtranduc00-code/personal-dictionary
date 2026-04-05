import { cookies } from "next/headers";
import {
  SPOTIFY_AT_COOKIE,
  SPOTIFY_RT_COOKIE,
  SPOTIFY_TOKEN_URL,
} from "@/lib/spotify/constants";
import {
  decryptRefreshTokenFromCookie,
  encryptRefreshTokenForCookie,
} from "@/lib/spotify/cookie-crypto";
import { spotifyRtCookieBase } from "@/lib/spotify/rt-cookie-options";

const LOG_PREFIX = "[spotify:refresh]";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

export type RefreshFailReason =
  | "no_cookie"
  | "decrypt"
  | "refresh_failed"
  | "refresh_revoked"
  | "no_client_id";

export type RefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: RefreshFailReason };

/**
 * Serialize refresh across concurrent Route Handlers. Spotify may rotate
 * refresh_token on each refresh; parallel refreshes can invalidate each other
 * and yield 401 (spotifyAuthHeader null) on some requests.
 */
let refreshSingleFlight: Promise<RefreshResult> | null = null;

/**
 * In-memory fallback cache (cleared on HMR/restart — cookie cache is primary).
 * Avoids hitting Spotify's token endpoint on every API request during a single
 * server process lifetime.
 */
let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;
/** Cache for 55 min — access tokens live 60 min, give 5 min buffer for clock skew. */
const ACCESS_TOKEN_CACHE_MS = 55 * 60 * 1000;
/** Cookie stores token + expiry as "token|expiresAtMs" — survives HMR and server restarts. */
const AT_COOKIE_MAX_AGE = 55 * 60; // seconds

function atCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: AT_COOKIE_MAX_AGE,
  };
}

async function getCachedAccessToken(): Promise<string | null> {
  // 1. Check in-memory cache first (fastest).
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt) {
    return cachedAccessToken;
  }
  // 2. Fall back to cookie cache (survives HMR/restart).
  try {
    const store = await cookies();
    const raw = store.get(SPOTIFY_AT_COOKIE)?.value;
    if (raw) {
      const [token, expiresStr] = raw.split("|");
      const expiresAt = Number(expiresStr);
      if (token && expiresAt && Date.now() < expiresAt) {
        // Warm the in-memory cache from the cookie.
        cachedAccessToken = token;
        cachedAccessTokenExpiresAt = expiresAt;
        return token;
      }
    }
  } catch {
    /* cookie read failed — proceed to refresh */
  }
  return null;
}

async function setCachedAccessToken(token: string): Promise<void> {
  const expiresAt = Date.now() + ACCESS_TOKEN_CACHE_MS;
  cachedAccessToken = token;
  cachedAccessTokenExpiresAt = expiresAt;
  try {
    const store = await cookies();
    store.set(SPOTIFY_AT_COOKIE, `${token}|${expiresAt}`, atCookieOptions());
  } catch {
    /* cookie write failed — in-memory cache still works for this process */
  }
}

async function persistRotatedRefreshToken(refreshToken: string): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    try {
      const enc = encryptRefreshTokenForCookie(refreshToken);
      const store = await cookies();
      store.set(SPOTIFY_RT_COOKIE, enc, spotifyRtCookieBase());
      if (process.env.NODE_ENV === "development") {
        console.info(LOG_PREFIX, "rotated refresh_token persisted to cookie");
      }
      return true;
    } catch (e) {
      if (i === 4) {
        console.error(
          LOG_PREFIX,
          "failed to persist rotated refresh_token after retries",
          e,
        );
      }
      await sleep(80 * (i + 1));
    }
  }
  return false;
}

async function performRefreshSpotifyAccessToken(): Promise<RefreshResult> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!clientId) {
    console.warn(LOG_PREFIX, "SPOTIFY_CLIENT_ID missing — cannot refresh");
    return { ok: false, reason: "no_client_id" };
  }

  let refreshToken: string;
  try {
    const store = await cookies();
    const enc = store.get(SPOTIFY_RT_COOKIE)?.value;
    if (!enc) {
      if (process.env.NODE_ENV === "development") {
        console.info(LOG_PREFIX, "no spotify_rt cookie — user not connected");
      }
      return { ok: false, reason: "no_cookie" };
    }
    refreshToken = decryptRefreshTokenFromCookie(enc);
  } catch (e) {
    console.warn(
      LOG_PREFIX,
      "cookie decrypt failed (wrong SPOTIFY_TOKEN_ENCRYPTION_KEY, truncated cookie, or corrupt value)",
      e,
    );
    return { ok: false, reason: "decrypt" };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (isTransientHttpStatus(r.status) && attempt < 2) {
        await sleep(200 * 2 ** attempt + Math.floor(Math.random() * 120));
        continue;
      }
      res = r;
      break;
    } catch (e) {
      console.warn(LOG_PREFIX, "token fetch network error", attempt, e);
      if (attempt < 2) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
      return { ok: false, reason: "refresh_failed" };
    }
  }

  if (!res) {
    return { ok: false, reason: "refresh_failed" };
  }

  const rawText = await res.text();
  let json: {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  } = {};
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    console.warn(
      LOG_PREFIX,
      "token endpoint HTTP",
      { status: res.status, error: json.error, body_preview: rawText.slice(0, 400) },
    );
    if (json.error === "invalid_grant") {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          LOG_PREFIX,
          "refresh token rejected by Spotify (revoked, expired, or rotated elsewhere)",
        );
      }
      return { ok: false, reason: "refresh_revoked" };
    }
    return { ok: false, reason: "refresh_failed" };
  }

  const accessToken = json.access_token;
  if (!accessToken) {
    console.warn(LOG_PREFIX, "missing access_token in token response");
    return { ok: false, reason: "refresh_failed" };
  }

  if (process.env.NODE_ENV === "development") {
    console.info(LOG_PREFIX, "access token refreshed OK");
  }

  if (json.refresh_token && json.refresh_token !== refreshToken) {
    const okPersist = await persistRotatedRefreshToken(json.refresh_token);
    if (!okPersist) {
      /**
       * Spotify typically invalidates the previous refresh_token when issuing a new one.
       * If we cannot store the new token, the next refresh will fail — treat as revoked
       * so the user reconnects once instead of flaky "random expiry".
       */
      console.error(
        LOG_PREFIX,
        "rotation persist failed — user should reconnect Spotify",
      );
      return { ok: false, reason: "refresh_revoked" };
    }
  }

  // Cache access token in both memory and cookie — survives HMR and server restarts.
  await setCachedAccessToken(accessToken);

  return { ok: true, accessToken };
}

export async function refreshSpotifyAccessToken(): Promise<RefreshResult> {
  // Return cached token if still valid (checks memory then cookie).
  const cached = await getCachedAccessToken();
  if (cached) return { ok: true, accessToken: cached };

  if (refreshSingleFlight) {
    if (process.env.NODE_ENV === "development") {
      console.info(LOG_PREFIX, "awaiting in-flight refresh");
    }
    return refreshSingleFlight;
  }
  refreshSingleFlight = performRefreshSpotifyAccessToken();
  try {
    return await refreshSingleFlight;
  } finally {
    refreshSingleFlight = null;
  }
}

/** Call this after logout or reconnect to force a fresh token on next request. */
export async function clearCachedSpotifyAccessToken(): Promise<void> {
  cachedAccessToken = null;
  cachedAccessTokenExpiresAt = 0;
  try {
    const store = await cookies();
    store.delete(SPOTIFY_AT_COOKIE);
  } catch {
    /* ignore */
  }
}

export async function spotifyAuthHeader(): Promise<string | null> {
  const r = await refreshSpotifyAccessToken();
  if (!r.ok) return null;
  return `Bearer ${r.accessToken}`;
}
