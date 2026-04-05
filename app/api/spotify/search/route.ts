import { NextResponse } from "next/server";
import { spotifyAuthHeader } from "@/lib/spotify/access-token";
import { SPOTIFY_API } from "@/lib/spotify/constants";

/** Spotify may return sparse arrays; drop null holes and invalid rows. */
function compactPlaylistItems(
  items: unknown,
): { uri: string; name: string; ownerDisplayName?: string }[] {
  if (!Array.isArray(items)) return [];
  const out: { uri: string; name: string; ownerDisplayName?: string }[] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const o = row as {
      uri?: string;
      name?: string;
      owner?: { display_name?: string };
    };
    if (typeof o.uri === "string" && typeof o.name === "string") {
      const ownerDisplayName =
        typeof o.owner?.display_name === "string"
          ? o.owner.display_name
          : undefined;
      out.push({ uri: o.uri, name: o.name, ownerDisplayName });
    }
  }
  return out;
}

function compactTrackItems(items: unknown): unknown[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (row): row is NonNullable<typeof row> =>
      row != null &&
      typeof row === "object" &&
      typeof (row as { uri?: string }).uri === "string",
  );
}

export async function GET(req: Request) {
  const auth = await spotifyAuthHeader();
  if (!auth) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  /** `all` | `track` | `playlist` — default both so UI can show both sections */
  const typesRaw = searchParams.get("types")?.trim().toLowerCase() ?? "all";
  const types =
    typesRaw === "track"
      ? "track"
      : typesRaw === "playlist"
        ? "playlist"
        : "track,playlist";

  const requestedLimit = Math.max(
    1,
    Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20,
  );

  /**
   * Spotify documents max 50, but `type=playlist` with `limit=50` and/or
   * `market=from_token` has been observed to return 400 "Invalid limit".
   * Keep playlist-only conservative; track / combined use full range.
   */
  const isPlaylistOnly = types === "playlist";
  const limit = Math.min(
    50,
    isPlaylistOnly ? Math.min(requestedLimit, 20) : requestedLimit,
  );

  const url = new URL(`${SPOTIFY_API}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("type", types);
  url.searchParams.set("limit", String(limit));
  /** Improves track relinking; omit for playlist-only to avoid 400 Invalid limit */
  if (!isPlaylistOnly) {
    url.searchParams.set("market", "from_token");
  }

  const res = await fetch(url.toString(), { headers: { Authorization: auth } });
  const rawText = await res.text();
  if (!res.ok) {
    let message = rawText || "Search failed";
    try {
      const err = JSON.parse(rawText) as {
        error?: { message?: string; status?: number };
      };
      if (typeof err?.error?.message === "string") {
        message = err.error.message;
      }
    } catch {
      /* keep raw */
    }
    return NextResponse.json({ error: message }, { status: res.status });
  }

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON from Spotify" }, { status: 502 });
  }

  const tracksBlock = data.tracks as
    | { items?: unknown[]; [k: string]: unknown }
    | undefined;
  const playlistsBlock = data.playlists as
    | { items?: unknown[]; [k: string]: unknown }
    | undefined;

  const payload = {
    tracks: tracksBlock
      ? {
          ...tracksBlock,
          items: compactTrackItems(tracksBlock.items),
        }
      : { items: [] as unknown[] },
    playlists: playlistsBlock
      ? {
          ...playlistsBlock,
          items: compactPlaylistItems(playlistsBlock.items),
        }
      : { items: [] as { uri: string; name: string; ownerDisplayName?: string }[] },
  };

  return NextResponse.json(payload);
}
