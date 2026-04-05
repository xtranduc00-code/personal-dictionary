import type {
  SpotifySearchPlaylistRow,
  SpotifySearchTrackRow,
} from "@/components/spotify/spotify-search-types";

function albumThumb(tr: Record<string, unknown>): string | null {
  const album = tr.album as { images?: { url?: string }[] } | undefined;
  const imgs = album?.images;
  if (!Array.isArray(imgs) || imgs.length === 0) return null;
  const first = imgs[0]?.url;
  return typeof first === "string" ? first : null;
}

export function normalizeSpotifySearchTrack(
  tr: unknown,
): SpotifySearchTrackRow | null {
  if (tr == null || typeof tr !== "object") return null;
  const o = tr as { uri?: unknown; name?: unknown; artists?: unknown };
  if (typeof o.uri !== "string" || typeof o.name !== "string") return null;
  const artistsRaw = o.artists;
  const artists = Array.isArray(artistsRaw)
    ? artistsRaw.filter(
        (a): a is { name: string } =>
          a != null &&
          typeof a === "object" &&
          typeof (a as { name?: string }).name === "string",
      )
    : [];
  return {
    uri: o.uri,
    name: o.name,
    artists,
    albumArtUrl: albumThumb(o as Record<string, unknown>),
  };
}

export function normalizeSpotifySearchTracks(
  items: unknown[] | undefined,
): SpotifySearchTrackRow[] {
  if (!items?.length) return [];
  const out: SpotifySearchTrackRow[] = [];
  for (const tr of items) {
    const row = normalizeSpotifySearchTrack(tr);
    if (row) out.push(row);
  }
  return out;
}

export function normalizeSpotifySearchPlaylists(
  raw: unknown[] | undefined,
): SpotifySearchPlaylistRow[] {
  if (!raw?.length) return [];
  const out: SpotifySearchPlaylistRow[] = [];
  for (const pl of raw) {
    if (pl == null || typeof pl !== "object") continue;
    const o = pl as {
      uri?: string;
      name?: string;
      ownerDisplayName?: string;
      owner?: { display_name?: string };
    };
    if (typeof o.uri !== "string" || typeof o.name !== "string") continue;
    const ownerDisplayName =
      typeof o.ownerDisplayName === "string"
        ? o.ownerDisplayName
        : typeof o.owner?.display_name === "string"
          ? o.owner.display_name
          : undefined;
    const row: SpotifySearchPlaylistRow = { uri: o.uri, name: o.name };
    if (ownerDisplayName) row.ownerDisplayName = ownerDisplayName;
    out.push(row);
  }
  return out;
}
