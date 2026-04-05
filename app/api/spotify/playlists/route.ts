import { NextResponse } from "next/server";
import { spotifyAuthHeader } from "@/lib/spotify/access-token";
import { SPOTIFY_API } from "@/lib/spotify/constants";

export async function GET(req: Request) {
  const auth = await spotifyAuthHeader();
  if (!auth) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "30", 10) || 30),
  );
  const offset = Math.max(
    0,
    Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  );

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
