"use client";

import type { MutableRefObject } from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  LogOut,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

type Translate = (key: TranslationKey) => string;

export function SpotifyPlayerCard({
  className,
  t,
  formatMs,
  artUrl,
  trackName,
  subtitleLine,
  expanded,
  onToggleExpand,
  deviceId,
  durationMs,
  positionMs,
  scrubMs,
  scrubbingRef,
  setScrubbing,
  setScrubMs,
  onScrubPointerDown,
  onSeekCommit,
  onScrubCancel,
  paused,
  onTogglePlay,
  onPrev,
  onNext,
  shuffleOn,
  onToggleShuffle,
  repeatMode,
  onCycleRepeat,
  onLogout,
  showInitializingHint,
  showDisconnect = true,
}: {
  t: Translate;
  formatMs: (ms: number) => string;
  artUrl: string | null;
  trackName: string | null;
  subtitleLine: string;
  expanded: boolean;
  onToggleExpand: () => void;
  deviceId: string | null;
  durationMs: number;
  positionMs: number;
  scrubMs: number | null;
  scrubbingRef: MutableRefObject<boolean>;
  setScrubbing: (v: boolean) => void;
  setScrubMs: (v: number | null) => void;
  onScrubPointerDown: () => void;
  onSeekCommit: (ms: number) => void;
  onScrubCancel: () => void;
  paused: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  shuffleOn: boolean;
  onToggleShuffle: () => void;
  repeatMode: number;
  onCycleRepeat: () => void;
  onLogout: () => void;
  showInitializingHint: boolean;
  /** When false, hides disconnect (personal single-user setups). */
  showDisconnect?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-0 overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/95 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)] ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/90 dark:from-zinc-900 dark:to-zinc-950/95 dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.5)] dark:ring-white/[0.06] ${className ?? ""}`}
    >
      <div className="flex items-center gap-3 px-3 pb-2 pt-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-200 shadow-md ring-2 ring-white dark:bg-zinc-700 dark:ring-zinc-800">
          {artUrl ? (
            <Image
              src={artUrl}
              alt=""
              fill
              className="object-cover"
              sizes="56px"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
              <Music2 className="h-7 w-7 text-zinc-400" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {trackName ?? t("spotifyNoTrack")}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {subtitleLine}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          className="rounded-xl p-2 text-zinc-500 transition duration-200 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title={expanded ? t("spotifyCollapsePanel") : t("spotifyExpandPanel")}
        >
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronUp className="h-5 w-5" />
          )}
        </button>
      </div>

      {deviceId && durationMs > 0 ? (
        <div className="border-t border-zinc-100/90 px-3 pb-1 pt-2 dark:border-zinc-800/90">
          <div className="flex items-center gap-2.5 text-[11px] tabular-nums font-medium text-zinc-500 dark:text-zinc-400">
            <span className="w-9 shrink-0">
              {formatMs(scrubMs ?? positionMs)}
            </span>
            <input
              type="range"
              min={0}
              max={durationMs}
              step={1000}
              value={Math.min(scrubMs ?? positionMs, durationMs)}
              disabled={!deviceId}
              title={t("spotifyPlayerSeek")}
              aria-label={t("spotifyPlayerSeek")}
              className="h-1.5 flex-1 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
              onPointerDown={() => {
                scrubbingRef.current = true;
                setScrubbing(true);
                onScrubPointerDown();
              }}
              onChange={(e) => setScrubMs(Number(e.currentTarget.value))}
              onPointerUp={(e) => {
                const v = Number(
                  (e.currentTarget as HTMLInputElement).value,
                );
                onSeekCommit(v);
                scrubbingRef.current = false;
                setScrubbing(false);
                setScrubMs(null);
              }}
              onPointerCancel={() => onScrubCancel()}
            />
            <span className="w-9 shrink-0 text-right">
              {formatMs(durationMs)}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-1 border-t border-zinc-100/90 px-2 pb-3 pt-2.5 dark:border-zinc-800/90">
        <button
          type="button"
          onClick={() => void onToggleShuffle()}
          disabled={!deviceId}
          title={t("spotifyPlayerShuffle")}
          className={`rounded-full p-2.5 transition duration-200 hover:scale-105 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:scale-100 dark:hover:bg-zinc-800 ${
            shuffleOn
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          <Shuffle className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => void onPrev()}
          disabled={!deviceId}
          className="rounded-full p-2.5 text-zinc-600 transition duration-200 hover:scale-105 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:scale-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => void onTogglePlay()}
          disabled={!deviceId}
          className="rounded-full bg-zinc-900 p-3.5 text-white shadow-lg shadow-zinc-900/20 transition duration-200 hover:scale-[1.04] hover:bg-zinc-800 disabled:opacity-40 disabled:hover:scale-100 dark:bg-white dark:text-zinc-900 dark:shadow-lg dark:hover:bg-zinc-200"
        >
          {paused ? (
            <Play className="h-6 w-6" fill="currentColor" />
          ) : (
            <Pause className="h-6 w-6" fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void onNext()}
          disabled={!deviceId}
          className="rounded-full p-2.5 text-zinc-600 transition duration-200 hover:scale-105 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:scale-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <SkipForward className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => void onCycleRepeat()}
          disabled={!deviceId}
          title={t("spotifyPlayerRepeat")}
          className={`rounded-full p-2.5 transition duration-200 hover:scale-105 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:scale-100 dark:hover:bg-zinc-800 ${
            repeatMode > 0
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {repeatMode === 2 ? (
            <Repeat1 className="h-[18px] w-[18px]" />
          ) : (
            <Repeat className="h-[18px] w-[18px]" />
          )}
        </button>
        {showDisconnect ? (
          <button
            type="button"
            onClick={() => void onLogout()}
            className="ml-0.5 rounded-full p-2.5 text-zinc-400 transition duration-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            title={t("spotifyDisconnect")}
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        ) : null}
      </div>

      {showInitializingHint ? (
        <div className="flex items-center justify-center gap-2 border-t border-zinc-100/80 px-3 py-2 dark:border-zinc-800/80">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500 dark:text-zinc-400" />
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {t("spotifyWaitForDevice")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
