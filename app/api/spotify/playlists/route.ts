import { NextResponse } from "next/server";
import { spotifyAuthHeader } from "@/lib/spotify/access-token";
import { SPOTIFY_API } from "@/lib/spotify/constants";
import {
  parseSpotifyPagingLimit,
  parseSpotifyPagingOffset,
} from "@/lib/spotify/parse-query";

export async function GET(req: Request) {
  const auth = await spotifyAuthHeader();
  if (!auth) {
    return NextResponse.json(
      { error: "Not connected", code: "auth_required" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = parseSpotifyPagingLimit(searchParams.get("limit"), 30, 50);
  const offset = parseSpotifyPagingOffset(searchParams.get("offset"));

  const url = `${SPOTIFY_API}/me/playlists?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) {
    return NextResponse.json(
      { error: await res.text() },
      { status: res.status },
    );
  }

  return NextResponse.json(await res.json());
}
