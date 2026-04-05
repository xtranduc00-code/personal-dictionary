import { NextResponse } from "next/server";
import { normalizeSpotifySearchTracks } from "@/components/spotify/spotify-search-normalize";
import { spotifyAuthHeader } from "@/lib/spotify/access-token";
import { SPOTIFY_API } from "@/lib/spotify/constants";

const PAGE = 100;
/** Avoid huge responses; typical playlists are well under this. */
const MAX_TRACKS = 2000;

export async function GET(req: Request) {
  const auth = await spotifyAuthHeader();
  if (!auth) {
    return NextResponse.json(
      { error: "Not connected", code: "auth_required" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get("playlist_id")?.trim() ?? "";
  if (!playlistId || !/^[a-zA-Z0-9]+$/.test(playlistId)) {
    return NextResponse.json(
      { error: "Invalid playlist_id" },
      { status: 400 },
    );
  }

  const rawTracks: unknown[] = [];
  let offset = 0;

  while (rawTracks.length < MAX_TRACKS) {
    const url = new URL(
      `${SPOTIFY_API}/playlists/${playlistId}/tracks`,
    );
    url.searchParams.set("limit", String(PAGE));
    url.searchParams.set("offset", String(offset));
    /** Improves track availability / relinking for the signed-in user’s market. */
    url.searchParams.set("market", "from_token");

    const res = await fetch(url.toString(), { headers: { Authorization: auth } });
    if (!res.ok) {
      const body = await res.text();
      if (process.env.NODE_ENV === "development") {
        console.warn("[spotify/playlist-tracks]", {
          playlistId,
          endpoint: `${url.pathname}?${url.searchParams.toString()}`,
          status: res.status,
          bodyPreview: body.slice(0, 600),
        });
      }
      return NextResponse.json({ error: body }, { status: res.status });
    }

    const data = (await res.json()) as {
      items?: { track?: unknown }[];
      next?: string | null;
    };

    const items = data.items ?? [];
    if (items.length === 0) break;

    for (const row of items) {
      const tr = row.track;
      if (tr == null || typeof tr !== "object") continue;
      const t = tr as { type?: string };
      if (t.type === "episode") continue;
      rawTracks.push(tr);
      if (rawTracks.length >= MAX_TRACKS) break;
    }

    offset += items.length;
    if (!data.next) break;
  }

  const tracks = normalizeSpotifySearchTracks(rawTracks);
  return NextResponse.json({ tracks });
}
