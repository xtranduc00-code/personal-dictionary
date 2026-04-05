import { NextResponse } from "next/server";
import { refreshSpotifyAccessToken } from "@/lib/spotify/access-token";

/** Short-lived access token for Web Playback SDK (`getOAuthToken` callback). */
export async function GET() {
  const r = await refreshSpotifyAccessToken();
  if (!r.ok) {
    return NextResponse.json(
      {
        error: "session_invalid",
        code: r.reason,
        message:
          r.reason === "decrypt"
            ? "Could not read stored session (wrong SPOTIFY_TOKEN_ENCRYPTION_KEY?)."
            : r.reason === "no_cookie"
              ? "Not connected"
              : r.reason === "refresh_revoked"
                ? "Spotify refresh token is no longer valid. Please connect again."
                : "Could not refresh Spotify access token (temporary). Try again.",
      },
      { status: 401 },
    );
  }
  return NextResponse.json({ access_token: r.accessToken });
}
