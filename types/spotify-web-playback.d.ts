export {};

declare global {
  interface SpotifyPlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    /** 0 off, 1 context, 2 track */
    repeat_mode?: number;
    shuffle?: boolean;
    track_window: {
      current_track: {
        uri: string;
        name: string;
        artists: { name: string }[];
        album: { images: { url: string }[] };
      } | null;
    };
  }

  interface SpotifyWebPlayer {
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(
      event: "ready",
      cb: (e: { device_id: string }) => void,
    ): void;
    addListener(
      event: "not_ready",
      cb: (e: { device_id: string }) => void,
    ): void;
    addListener(
      event: "player_state_changed",
      cb: (state: SpotifyPlaybackState | null) => void,
    ): void;
    addListener(
      event: "authentication_error",
      cb: (e: { message: string }) => void,
    ): void;
    addListener(
      event: "account_error",
      cb: (e: { message: string }) => void,
    ): void;
    addListener(
      event: "playback_error",
      cb: (e: { message: string }) => void,
    ): void;
    addListener(
      event: "initialization_error",
      cb: (e: { message: string }) => void,
    ): void;
    removeListener(event: string, cb: (...args: unknown[]) => void): void;
    getCurrentState(): Promise<SpotifyPlaybackState | null>;
    setVolume(v: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    previousTrack(): Promise<void>;
    nextTrack(): Promise<void>;
    seek(position_ms: number): Promise<void>;
    activateElement(): Promise<void>;
  }

  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyWebPlayer;
    };
  }
}
