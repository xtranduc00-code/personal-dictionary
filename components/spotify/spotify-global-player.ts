/**
 * Module-level singleton that keeps the Spotify Web Playback SDK player alive
 * across React component unmounts/remounts caused by client-side navigation.
 *
 * Without this, navigating from /spotify → /profile disconnects the SDK and
 * stops the music. The store holds the player instance and latest playback
 * snapshot so the next SpotifyDock that mounts can resume instantly.
 */

export type GlobalPlaybackSnapshot = {
  player: SpotifyWebPlayer | null;
  deviceId: string | null;
  paused: boolean;
  trackName: string | null;
  artistName: string | null;
  artUrl: string | null;
  positionMs: number;
  durationMs: number;
  shuffleOn: boolean;
  repeatMode: number;
};

const DEFAULT_SNAPSHOT: GlobalPlaybackSnapshot = {
  player: null,
  deviceId: null,
  paused: true,
  trackName: null,
  artistName: null,
  artUrl: null,
  positionMs: 0,
  durationMs: 0,
  shuffleOn: false,
  repeatMode: 0,
};

let snapshot: GlobalPlaybackSnapshot = { ...DEFAULT_SNAPSHOT };

export function getGlobalPlayback(): Readonly<GlobalPlaybackSnapshot> {
  return snapshot;
}

export function updateGlobalPlayback(
  updates: Partial<GlobalPlaybackSnapshot>,
): void {
  snapshot = { ...snapshot, ...updates };
}

/** Disconnect and clear the global player (called on explicit logout / session invalid). */
export function destroyGlobalPlayer(): void {
  if (snapshot.player) {
    try {
      snapshot.player.disconnect();
    } catch {
      /* ignore SDK errors on disconnect */
    }
  }
  snapshot = { ...DEFAULT_SNAPSHOT };
}

/** True when there is already a live player instance in the store. */
export function hasLivePlayer(): boolean {
  return snapshot.player !== null;
}
