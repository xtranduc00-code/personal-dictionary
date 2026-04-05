export type SpotifySearchTrackRow = {
  uri: string;
  name: string;
  artists: { name: string }[];
  albumArtUrl: string | null;
};

export type SpotifySearchPlaylistRow = {
  uri: string;
  name: string;
  ownerDisplayName?: string;
};

export type SpotifySearchTypesMode = "all" | "track" | "playlist";
