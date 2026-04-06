import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SPOTIFY_OAUTH_MODE_COOKIE,
  SPOTIFY_PKCE_COOKIE,
  SPOTIFY_RT_COOKIE,
  SPOTIFY_STATE_COOKIE,
  SPOTIFY_TOKEN_URL,
} from "@/lib/spotify/constants";
import { encryptRefreshTokenForCookie } from "@/lib/spotify/cookie-crypto";
import { spotifyRtCookieBase } from "@/lib/spotify/rt-cookie-options";
import { spotifyRedirectUriFromRequest } from "@/lib/spotify/redirect-uri";
import { dbWriteSpotifyRt } from "@/lib/spotify/supabase-token-store";

function appOriginFromSpotifyRedirect(redirectUri: string): string {
  return redirectUri.replace(/\/api\/spotify\/callback\/?$/, "");
}

function withOauthModeCleared(res: NextResponse) {
  res.cookies.delete(SPOTIFY_OAUTH_MODE_COOKIE);
  return res;
}

/** Popup flow uses a static page so the OAuth window does not load the full app shell. */
const SPOTIFY_OAUTH_CLOSE_PATH = "/spotify-oauth-close.html";

function oauthFailRedirect(
  appOrigin: string,
  oauthPopup: boolean,
  errorCode: string,
) {
  const target = oauthPopup
    ? `${appOrigin}${SPOTIFY_OAUTH_CLOSE_PATH}?error=${encodeURIComponent(errorCode)}`
    : `${appOrigin}/spotify?spotify_error=${encodeURIComponent(errorCode)}`;
  return withOauthModeCleared(NextResponse.redirect(target));
}

export async function GET(req: Request) {
  const redirectUri = spotifyRedirectUriFromRequest(req);
  const appOrigin = appOriginFromSpotifyRedirect(redirectUri);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const spotifyError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const oauthPopup =
    cookieStore.get(SPOTIFY_OAUTH_MODE_COOKIE)?.value === "popup";

  if (spotifyError) {
    return oauthFailRedirect(appOrigin, oauthPopup, spotifyError);
  }
  if (!code || !state) {
    return oauthFailRedirect(appOrigin, oauthPopup, "missing_params");
  }

  const expectedState = cookieStore.get(SPOTIFY_STATE_COOKIE)?.value;
  const verifier = cookieStore.get(SPOTIFY_PKCE_COOKIE)?.value;
  if (!expectedState || state !== expectedState || !verifier) {
    return oauthFailRedirect(appOrigin, oauthPopup, "state");
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!clientId) {
    return oauthFailRedirect(appOrigin, oauthPopup, "config");
  }

  const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    return oauthFailRedirect(appOrigin, oauthPopup, "token");
  }

  const tokens = (await tokenRes.json()) as { refresh_token?: string };
  if (!tokens.refresh_token) {
    return oauthFailRedirect(appOrigin, oauthPopup, "no_refresh");
  }

  let enc: string;
  try {
    enc = encryptRefreshTokenForCookie(tokens.refresh_token);
  } catch {
    return oauthFailRedirect(appOrigin, oauthPopup, "crypto");
  }

  // Store in Supabase for durable cross-instance access.
  void dbWriteSpotifyRt(enc);

  const res = NextResponse.redirect(
    oauthPopup
      ? `${appOrigin}${SPOTIFY_OAUTH_CLOSE_PATH}?ok=1`
      : `${appOrigin}/spotify?spotify=connected`,
  );
  res.cookies.delete(SPOTIFY_OAUTH_MODE_COOKIE);
  res.cookies.set(SPOTIFY_RT_COOKIE, enc, spotifyRtCookieBase());
  res.cookies.delete(SPOTIFY_PKCE_COOKIE);
  res.cookies.delete(SPOTIFY_STATE_COOKIE);
  return res;
}
