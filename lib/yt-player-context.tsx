"use client";
import { createContext, useCallback, useContext, useState } from "react";

export type YTQueueItem = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt?: string;
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
};

const Ctx = createContext<YTPlayerCtx | null>(null);

export function YTPlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<YTQueueItem | null>(null);
  const [queue, setQueue] = useState<YTQueueItem[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [muteAudio, setMuteAudio] = useState(false);

  const play = useCallback((video: YTQueueItem, q?: YTQueueItem[], idx?: number) => {
    const newQueue = q ?? [video];
    const newIdx = idx ?? 0;
    setQueue(newQueue);
    setQueueIdx(newIdx);
    setCurrent(newQueue[newIdx] ?? video);
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
  }, []);

  return (
    <Ctx.Provider value={{ current, queue, queueIdx, play, playAt, next, prev, close, muteAudio, setMuteAudio }}>
      {children}
    </Ctx.Provider>
  );
}

export function useYTPlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useYTPlayer must be used within YTPlayerProvider");
  return ctx;
}
