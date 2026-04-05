"use client";

/**
 * Pure UI component for the Spotify player controls.
 * Wrapped in React.memo — only re-renders when track, pause-state, device,
 * shuffle/repeat, or layout props change.  Position updates happen entirely
 * inside SpotifyProgressSlider without touching this component.
 *
 * layout="floating" is rendered by FloatingMiniPlayer which has its own
 * hover-state and is not covered by the outer React.memo.
 */

import { memo, useState } from "react";
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
import { SpotifyProgressSlider } from "@/components/spotify/spotify-progress-slider";

type Translate = (key: TranslationKey) => string;

export type SpotifyPlayerCardProps = {
  t: Translate;
  formatMs: (ms: number) => string;
  playerRef: MutableRefObject<SpotifyWebPlayer | null>;
  artUrl: string | null;
  trackName: string | null;
  subtitleLine: string;
  expanded: boolean;
  onToggleExpand?: () => void;
  deviceId: string | null;
  durationMs: number;
  onSeekCommit: (ms: number) => void;
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
  showDisconnect?: boolean;
  className?: string;
  /** "card" = embedded page (default). "bar" = legacy full-width bottom bar. "mini" = compact floating corner widget. "floating" = hover-expand corner widget. */
  layout?: "card" | "bar" | "mini" | "floating";
};

/* ── Hover-expand floating corner widget ───────────────────────────────
   Collapsed: 48×48 album art thumbnail.
   Hover (desktop): expands LEFT, showing track info + prev/play/next.
   Mobile: clicking the art plays/pauses.                                  */
type FloatingProps = {
  t: Translate;
  artUrl: string | null;
  trackName: string | null;
  subtitleLine: string;
  deviceId: string | null;
  paused: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  showInitializingHint: boolean;
  className?: string;
};

function FloatingMiniPlayer({
  t, artUrl, trackName, subtitleLine, deviceId, paused, onTogglePlay, onPrev, onNext, showInitializingHint, className,
}: FloatingProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`flex items-center justify-end ${className ?? ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* ── Expanded panel (slides in from the right) ── */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          expanded ? "max-w-[300px] opacity-100 pr-2" : "max-w-0 opacity-0 pr-0"
        }`}
        style={{ minWidth: 0 }}
      >
        <div className="flex items-center gap-2.5 rounded-2xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.15)] backdrop-blur-md ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/90 dark:bg-zinc-950/95 dark:ring-white/[0.06]">
          {/* Track info */}
          <div className="w-32 min-w-0 shrink-0">
            <p className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
              {trackName ?? t("spotifyNoTrack")}
            </p>
            <p className="truncate text-xs leading-tight text-zinc-500 dark:text-zinc-400">
              {showInitializingHint ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  {subtitleLine}
                </span>
              ) : subtitleLine}
            </p>
          </div>

          {/* Controls: prev | play/pause | next */}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={!deviceId}
              className="rounded-full p-1.5 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!deviceId}
              className="rounded-full bg-zinc-900 p-2 text-white shadow-sm transition duration-200 hover:scale-[1.06] hover:bg-zinc-800 disabled:opacity-40 disabled:hover:scale-100 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {paused
                ? <Play className="h-[15px] w-[15px]" fill="currentColor" />
                : <Pause className="h-[15px] w-[15px]" fill="currentColor" />}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!deviceId}
              className="rounded-full p-1.5 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Album art (always visible) — click to play/pause ── */}
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={!deviceId}
        aria-label={paused ? "Play" : "Pause"}
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-zinc-200 shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg disabled:opacity-50 dark:bg-zinc-700"
      >
        {artUrl ? (
          <Image src={artUrl} alt="" fill className="object-cover" sizes="48px" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
            <Music2 className="h-6 w-6 text-zinc-400" aria-hidden />
          </div>
        )}

        {/* Paused overlay: play icon */}
        {paused && !expanded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="h-5 w-5 text-white drop-shadow-md" fill="currentColor" />
          </div>
        ) : null}

        {/* Playing indicator: green dot at top-right */}
        {!paused ? (
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow ring-[1.5px] ring-white dark:ring-zinc-800" aria-hidden />
        ) : null}
      </button>
    </div>
  );
}

export const SpotifyPlayerCard = memo(function SpotifyPlayerCard({
  className,
  layout = "card",
  t,
  formatMs,
  playerRef,
  artUrl,
  trackName,
  subtitleLine,
  expanded,
  onToggleExpand,
  deviceId,
  durationMs,
  onSeekCommit,
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
}: SpotifyPlayerCardProps) {
  /* ── Progress slider — keyed by track so it resets on track change ── */
  /* Only for card and bar layouts; mini/floating layouts have no progress bar. */
  const progressSlider = layout !== "mini" && layout !== "floating" ? (
    <SpotifyProgressSlider
      key={`${trackName ?? "none"}:${durationMs}`}
      playerRef={playerRef}
      deviceId={deviceId}
      durationMs={durationMs}
      paused={paused}
      onSeekCommit={onSeekCommit}
      formatMs={formatMs}
      t={t}
      layout={layout}
    />
  ) : null;

  if (layout === "floating") {
    return (
      <FloatingMiniPlayer
        t={t}
        artUrl={artUrl}
        trackName={trackName}
        subtitleLine={subtitleLine}
        deviceId={deviceId}
        paused={paused}
        onTogglePlay={onTogglePlay}
        onPrev={onPrev}
        onNext={onNext}
        showInitializingHint={showInitializingHint}
        className={className}
      />
    );
  }

  if (layout === "mini") {
    return (
      <div className={`flex items-center gap-2.5 rounded-2xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.15)] backdrop-blur-md ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/90 dark:bg-zinc-950/95 dark:ring-white/[0.06] ${className ?? ""}`}>
        {/* Album art */}
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-200 shadow-sm dark:bg-zinc-700">
          {artUrl ? (
            <Image src={artUrl} alt="" fill className="object-cover" sizes="40px" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
              <Music2 className="h-5 w-5 text-zinc-400" aria-hidden />
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="w-28 min-w-0 shrink-0">
          <p className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
            {trackName ?? t("spotifyNoTrack")}
          </p>
          <p className="truncate text-xs leading-tight text-zinc-500 dark:text-zinc-400">
            {showInitializingHint ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                {subtitleLine}
              </span>
            ) : subtitleLine}
          </p>
        </div>

        {/* Controls: shuffle, prev, play, next, repeat */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleShuffle}
            disabled={!deviceId}
            title={t("spotifyPlayerShuffle")}
            className={`rounded-full p-2 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800 ${
              shuffleOn ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onPrev}
            disabled={!deviceId}
            className="rounded-full p-2 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <SkipBack className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!deviceId}
            className="rounded-full bg-zinc-900 p-2.5 text-white shadow-sm transition duration-200 hover:scale-[1.04] hover:bg-zinc-800 disabled:opacity-40 disabled:hover:scale-100 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {paused ? <Play className="h-[18px] w-[18px]" fill="currentColor" /> : <Pause className="h-[18px] w-[18px]" fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!deviceId}
            className="rounded-full p-2 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <SkipForward className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={onCycleRepeat}
            disabled={!deviceId}
            title={t("spotifyPlayerRepeat")}
            className={`rounded-full p-2 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800 ${
              repeatMode > 0 ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {repeatMode === 2 ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  }

  if (layout === "bar") {
    return (
      <div className={`relative flex w-full min-w-0 items-center gap-2 px-3 py-2 md:gap-3 md:px-4 ${className ?? ""}`}>
        {/* Mobile thin progress line + desktop progress bar (both from slider) */}
        {progressSlider}

        {/* Album art */}
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-200 shadow-sm dark:bg-zinc-700">
          {artUrl ? (
            <Image src={artUrl} alt="" fill className="object-cover" sizes="40px" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
              <Music2 className="h-5 w-5 text-zinc-400" aria-hidden />
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="w-28 min-w-0 shrink-0 md:w-44">
          <p className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
            {trackName ?? t("spotifyNoTrack")}
          </p>
          <p className="truncate text-xs leading-tight text-zinc-500 dark:text-zinc-400">
            {showInitializingHint ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                {subtitleLine}
              </span>
            ) : subtitleLine}
          </p>
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleShuffle}
            disabled={!deviceId}
            title={t("spotifyPlayerShuffle")}
            className={`hidden rounded-full p-2 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800 md:flex ${
              shuffleOn ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onPrev}
            disabled={!deviceId}
            className="rounded-full p-2 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <SkipBack className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!deviceId}
            className="rounded-full bg-zinc-900 p-2.5 text-white shadow-sm transition duration-200 hover:scale-[1.04] hover:bg-zinc-800 disabled:opacity-40 disabled:hover:scale-100 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {paused ? <Play className="h-[18px] w-[18px]" fill="currentColor" /> : <Pause className="h-[18px] w-[18px]" fill="currentColor" />}
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!deviceId}
            className="rounded-full p-2 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <SkipForward className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={onCycleRepeat}
            disabled={!deviceId}
            title={t("spotifyPlayerRepeat")}
            className={`hidden rounded-full p-2 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800 md:flex ${
              repeatMode > 0 ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {repeatMode === 2 ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </button>

          {showDisconnect ? (
            <button
              type="button"
              onClick={onLogout}
              className="hidden rounded-full p-2 text-zinc-400 transition duration-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 md:flex"
              title={t("spotifyDisconnect")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Expand / collapse */}
        <button
          type="button"
          onClick={onToggleExpand}
          className="shrink-0 rounded-full p-2 text-zinc-500 transition duration-200 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title={expanded ? t("spotifyCollapsePanel") : t("spotifyExpandPanel")}
        >
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
        </button>
      </div>
    );
  }

  /* ── Card layout (embedded /spotify page) ──────────────────────────── */
  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-0 overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/95 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.12)] ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/90 dark:from-zinc-900 dark:to-zinc-950/95 dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] dark:ring-white/[0.06] ${className ?? ""}`}
    >
      <div className="flex items-center gap-2.5 px-3 pb-1 pt-2.5">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-200 shadow-sm dark:bg-zinc-700">
          {artUrl ? (
            <Image src={artUrl} alt="" fill className="object-cover" sizes="40px" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
              <Music2 className="h-5 w-5 text-zinc-400" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
            {trackName ?? t("spotifyNoTrack")}
          </p>
          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            {subtitleLine}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          className="rounded-lg p-1.5 text-zinc-500 transition duration-200 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title={expanded ? t("spotifyCollapsePanel") : t("spotifyExpandPanel")}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {/* Progress slider */}
      {progressSlider}

      <div className="flex flex-wrap items-center justify-center gap-0.5 border-t border-zinc-100/90 px-2 pb-1.5 pt-1.5 dark:border-zinc-800/90">
        <button
          type="button"
          onClick={onToggleShuffle}
          disabled={!deviceId}
          title={t("spotifyPlayerShuffle")}
          className={`rounded-full p-2 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800 ${
            shuffleOn ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          <Shuffle className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={!deviceId}
          className="rounded-full p-2 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <SkipBack className="h-[17px] w-[17px]" />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!deviceId}
          className="rounded-full bg-zinc-900 p-2.5 text-white shadow-md shadow-zinc-900/20 transition duration-200 hover:scale-[1.04] hover:bg-zinc-800 disabled:opacity-40 disabled:hover:scale-100 dark:bg-white dark:text-zinc-900 dark:shadow-md dark:hover:bg-zinc-200"
        >
          {paused ? <Play className="h-5 w-5" fill="currentColor" /> : <Pause className="h-5 w-5" fill="currentColor" />}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!deviceId}
          className="rounded-full p-2 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <SkipForward className="h-[17px] w-[17px]" />
        </button>
        <button
          type="button"
          onClick={onCycleRepeat}
          disabled={!deviceId}
          title={t("spotifyPlayerRepeat")}
          className={`rounded-full p-2 transition duration-200 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800 ${
            repeatMode > 0 ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {repeatMode === 2 ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
        </button>
        {showDisconnect ? (
          <button
            type="button"
            onClick={onLogout}
            className="ml-0.5 rounded-full p-2 text-zinc-400 transition duration-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            title={t("spotifyDisconnect")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showInitializingHint ? (
        <div className="flex items-center justify-center gap-2 border-t border-zinc-100/80 px-3 py-1.5 dark:border-zinc-800/80">
          <Loader2 className="h-3 w-3 animate-spin text-zinc-500 dark:text-zinc-400" />
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {t("spotifyWaitForDevice")}
          </p>
        </div>
      ) : null}
    </div>
  );
});
