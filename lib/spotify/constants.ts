/** Scopes for Web Playback SDK + search + playlists + library read. */
export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-library-read",
].join(" ");

export const SPOTIFY_RT_COOKIE = "spotify_rt";
/** Short-lived access token cache cookie — avoids redundant token refreshes across HMR/restarts. */
export const SPOTIFY_AT_COOKIE = "spotify_at";
export const SPOTIFY_PKCE_COOKIE = "spotify_pkce";
export const SPOTIFY_STATE_COOKIE = "spotify_oauth_state";
/** Set when starting OAuth via `?popup=1` so callback can close a window instead of full redirect. */
export const SPOTIFY_OAUTH_MODE_COOKIE = "spotify_oauth_mode";

export const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API = "https://api.spotify.com/v1";
