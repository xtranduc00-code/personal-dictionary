import { NextResponse } from "next/server";
import {
  SPOTIFY_AUTH_URL,
  SPOTIFY_OAUTH_MODE_COOKIE,
  SPOTIFY_PKCE_COOKIE,
  SPOTIFY_SCOPES,
  SPOTIFY_STATE_COOKIE,
} from "@/lib/spotify/constants";
import {
  codeChallengeS256,
  generateCodeVerifier,
  generateOAuthState,
} from "@/lib/spotify/pkce";
import { spotifyRedirectUriFromRequest } from "@/lib/spotify/redirect-uri";

export async function GET(req: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "SPOTIFY_CLIENT_ID is not set" },
      { status: 503 },
    );
  }

  const redirectUri = spotifyRedirectUriFromRequest(req);
  const verifier = generateCodeVerifier();
  const challenge = codeChallengeS256(verifier);
  const state = generateOAuthState();

  const loginUrl = new URL(req.url);
  const reconsent =
    loginUrl.searchParams.get("reconsent") === "1" ||
    loginUrl.searchParams.get("reconsent") === "true";

  const url = new URL(SPOTIFY_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SPOTIFY_SCOPES);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("state", state);
  if (reconsent) {
    url.searchParams.set("show_dialog", "true");
  }

  const res = NextResponse.redirect(url.toString());
  const secure = process.env.NODE_ENV === "production";
  const popup =
    loginUrl.searchParams.get("popup") === "1" ||
    loginUrl.searchParams.get("popup") === "true";
  if (popup) {
    res.cookies.set(SPOTIFY_OAUTH_MODE_COOKIE, "popup", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  } else {
    res.cookies.delete(SPOTIFY_OAUTH_MODE_COOKIE);
  }
  res.cookies.set(SPOTIFY_PKCE_COOKIE, verifier, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  res.cookies.set(SPOTIFY_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
