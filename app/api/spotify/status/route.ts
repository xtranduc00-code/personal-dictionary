import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SPOTIFY_RT_COOKIE } from "@/lib/spotify/constants";
import { refreshSpotifyAccessToken } from "@/lib/spotify/access-token";
import { spotifyRedirectUriFromRequest } from "@/lib/spotify/redirect-uri";

export async function GET(req: Request) {
  const store = await cookies();
  const hasRefreshCookie = Boolean(store.get(SPOTIFY_RT_COOKIE)?.value);
  const configured = Boolean(process.env.SPOTIFY_CLIENT_ID?.trim());
  const redirectUri = spotifyRedirectUriFromRequest(req);

  const r = await refreshSpotifyAccessToken();
  const sessionOk = r.ok;
  const sessionError = r.ok ? null : r.reason;

  return NextResponse.json({
    configured,
    /** True only when refresh_token decrypt + refresh succeeded */
    sessionOk,
    sessionError,
    hasRefreshCookie,
    /** @deprecated use sessionOk */
    connected: sessionOk,
    redirectUri,
  });
}
