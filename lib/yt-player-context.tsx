"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { YtPlayerApi } from "./youtube-watch";

export type YTQueueItem = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt?: string;
};

export type PlaybackState = {
  currentTime: number;
  duration: number;
  playing: boolean;
  isLive: boolean;
  ready: boolean;
};

const defaultPlayback: PlaybackState = {
  currentTime: 0,
  duration: 0,
  playing: false,
  isLive: false,
  ready: false,
};

type YTPlayerCtx = {
  current: YTQueueItem | null;
  queue: YTQueueItem[];
  queueIdx: number;
  play: (video: YTQueueItem, queue?: YTQueueItem[], idx?: number) => void;
  playAt: (idx: number) => void;
  next: () => void;
  prev: () => void;
  close: () => void;
  /** True while an inline player on the page owns the audio — dock mutes itself. */
  muteAudio: boolean;
  setMuteAudio: (v: boolean) => void;
  /** Single source of truth for playback — updated by whoever currently owns the player. */
  playbackState: PlaybackState;
  updatePlaybackState: (patch: Partial<PlaybackState>) => void;
  /**
   * Always-current currentTime ref — safe to read in effect cleanups / closures
   * without stale-closure issues (does NOT trigger re-renders).
   */
  latestCurrentTimeRef: React.MutableRefObject<number>;
  /** Points to the currently active YT.Player instance (dock or inline player). */
  activePlayerRef: React.MutableRefObject<YtPlayerApi | null>;
  /** True when the inline YouTubePlayer component is mounted and owns the player. */
  mainPlayerActive: boolean;
  setMainPlayerActive: (v: boolean) => void;
};

const Ctx = createContext<YTPlayerCtx | null>(null);

export function YTPlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<YTQueueItem | null>(null);
  const [queue, setQueue] = useState<YTQueueItem[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [muteAudio, setMuteAudio] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(defaultPlayback);
  const latestCurrentTimeRef = useRef(0);
  const activePlayerRef = useRef<YtPlayerApi | null>(null);
  const [mainPlayerActive, setMainPlayerActive] = useState(false);

  const updatePlaybackState = useCallback((patch: Partial<PlaybackState>) => {
    if (patch.currentTime !== undefined) latestCurrentTimeRef.current = patch.currentTime;
    setPlaybackState((prev) => ({ ...prev, ...patch }));
  }, []);

  const play = useCallback((video: YTQueueItem, q?: YTQueueItem[], idx?: number) => {
    const newQueue = q ?? [video];
    const newIdx = idx ?? 0;
    setQueue(newQueue);
    setQueueIdx(newIdx);
    setCurrent(newQueue[newIdx] ?? video);
    // Reset playback state for the new video
    setPlaybackState(defaultPlayback);
    latestCurrentTimeRef.current = 0;
  }, []);

  const next = useCallback(() => {
    setQueueIdx((i) => {
      const next = i + 1 < queue.length ? i + 1 : i;
      setCurrent(queue[next] ?? null);
      return next;
    });
  }, [queue]);

  const prev = useCallback(() => {
    setQueueIdx((i) => {
      const prev = i - 1 >= 0 ? i - 1 : 0;
      setCurrent(queue[prev] ?? null);
      return prev;
    });
  }, [queue]);

  const playAt = useCallback((idx: number) => {
    const item = queue[idx];
    if (!item) return;
    setQueueIdx(idx);
    setCurrent(item);
  }, [queue]);

  const close = useCallback(() => {
    setCurrent(null);
    setQueue([]);
    setQueueIdx(0);
    setPlaybackState(defaultPlayback);
    latestCurrentTimeRef.current = 0;
  }, []);

  const value = useMemo(() => ({
    current, queue, queueIdx, play, playAt, next, prev, close,
    muteAudio, setMuteAudio,
    playbackState, updatePlaybackState, latestCurrentTimeRef,
    activePlayerRef,
    mainPlayerActive, setMainPlayerActive,
  }), [current, queue, queueIdx, play, playAt, next, prev, close, muteAudio, playbackState, updatePlaybackState, mainPlayerActive]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useYTPlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useYTPlayer must be used within YTPlayerProvider");
  return ctx;
}
