import { cookies } from "next/headers";
import {
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

async function persistRotatedRefreshToken(refreshToken: string): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      const enc = encryptRefreshTokenForCookie(refreshToken);
      const store = await cookies();
      store.set(SPOTIFY_RT_COOKIE, enc, spotifyRtCookieBase());
      return true;
    } catch (e) {
      if (i === 2) {
        console.error(
          LOG_PREFIX,
          "failed to persist rotated refresh_token after retries",
          e,
        );
      }
      await sleep(40 * (i + 1));
    }
  }
  return false;
}

export async function refreshSpotifyAccessToken(): Promise<RefreshResult> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!clientId) {
    console.warn(LOG_PREFIX, "SPOTIFY_CLIENT_ID missing");
    return { ok: false, reason: "no_client_id" };
  }

  let refreshToken: string;
  try {
    const store = await cookies();
    const enc = store.get(SPOTIFY_RT_COOKIE)?.value;
    if (!enc) return { ok: false, reason: "no_cookie" };
    refreshToken = decryptRefreshTokenFromCookie(enc);
  } catch (e) {
    console.warn(LOG_PREFIX, "cookie decrypt failed", e);
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
      res.status,
      rawText.slice(0, 400),
    );
    if (json.error === "invalid_grant") {
      return { ok: false, reason: "refresh_revoked" };
    }
    return { ok: false, reason: "refresh_failed" };
  }

  const accessToken = json.access_token;
  if (!accessToken) {
    console.warn(LOG_PREFIX, "missing access_token in response");
    return { ok: false, reason: "refresh_failed" };
  }

  if (json.refresh_token && json.refresh_token !== refreshToken) {
    const okPersist = await persistRotatedRefreshToken(json.refresh_token);
    if (!okPersist) {
      /**
       * Spotify typically invalidates the previous refresh_token when issuing a new one.
       * If we cannot store the new token, the next refresh will fail — treat as revoked
       * so the user reconnects once instead of flaky “random expiry”.
       */
      console.error(
        LOG_PREFIX,
        "rotation persist failed — user should reconnect Spotify",
      );
      return { ok: false, reason: "refresh_revoked" };
    }
  }

  return { ok: true, accessToken };
}

export async function spotifyAuthHeader(): Promise<string | null> {
  const r = await refreshSpotifyAccessToken();
  if (!r.ok) return null;
  return `Bearer ${r.accessToken}`;
}
