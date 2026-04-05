"use client";

/**
 * Progress slider for the Spotify player.
 *
 * Performance design:
 *  - Position is stored in a `ref` (not React state) so it NEVER triggers
 *    a React re-render during normal playback.
 *  - The progress fill, mobile indicator, range thumb and elapsed-time label
 *    are all updated via direct DOM manipulation inside a `requestAnimationFrame`
 *    loop running at ~60 fps — completely outside React's reconciler.
 *  - React only re-renders this component when the user actively scrubs
 *    (scrubMs state) or when a new track starts (via the `key` prop set
 *    by the parent).
 *  - Drift with the real Spotify playhead is corrected every 2 seconds via
 *    a lightweight `getCurrentState()` call.
 */

import { memo, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { TranslationKey } from "@/lib/i18n";
import { getGlobalPlayback } from "@/components/spotify/spotify-global-player";

type T = (key: TranslationKey) => string;

interface Props {
  playerRef: MutableRefObject<SpotifyWebPlayer | null>;
  deviceId: string | null;
  durationMs: number;
  paused: boolean;
  onSeekCommit: (ms: number) => void;
  formatMs: (ms: number) => string;
  t: T;
  layout?: "card" | "bar";
}

export const SpotifyProgressSlider = memo(function SpotifyProgressSlider({
  playerRef,
  deviceId,
  durationMs,
  paused,
  onSeekCommit,
  formatMs,
  t,
  layout = "card",
}: Props) {
  /* ── Only React state here is scrubMs — active only during user drag ── */
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const scrubbingRef = useRef(false);

  /* ── Position tracking: ref, not state ─────────────────────────────── */
  const positionMsRef = useRef(getGlobalPlayback().positionMs);

  /* ── DOM refs — updated directly, bypassing React ─────────────────── */
  const fillBarRef = useRef<HTMLDivElement>(null);
  const mobileFillRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const elapsedLabelRef = useRef<HTMLSpanElement>(null);

  /* ── Sync initial position from live player on mount ──────────────── */
  useEffect(() => {
    void (async () => {
      try {
        const s = await playerRef.current?.getCurrentState();
        if (s) positionMsRef.current = s.position;
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── RAF loop: smooth 60 fps position interpolation ───────────────── */
  useEffect(() => {
    if (!deviceId || durationMs <= 0) return;

    const applyToDOM = (posMs: number) => {
      const pct = Math.min((posMs / durationMs) * 100, 100);
      const pctStr = `${pct.toFixed(2)}%`;
      if (fillBarRef.current) fillBarRef.current.style.width = pctStr;
      if (mobileFillRef.current) mobileFillRef.current.style.width = pctStr;
      if (!scrubbingRef.current) {
        if (rangeRef.current) rangeRef.current.value = String(posMs);
        if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = formatMs(posMs);
      }
    };

    /* Always paint immediately so the bar shows correct position on mount. */
    applyToDOM(positionMsRef.current);

    if (paused) return; /* No RAF while paused — just the initial paint above. */

    let rafId: number;
    let prevTs = performance.now();

    const loop = (ts: number) => {
      const delta = ts - prevTs;
      prevTs = ts;
      if (!scrubbingRef.current) {
        positionMsRef.current = Math.min(positionMsRef.current + delta, durationMs);
        applyToDOM(positionMsRef.current);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [deviceId, durationMs, paused, formatMs]);

  /* ── Drift correction: resync with real playhead every 2 s ─────────── */
  useEffect(() => {
    if (!deviceId || paused) return;
    const id = setInterval(async () => {
      if (scrubbingRef.current) return;
      try {
        const s = await playerRef.current?.getCurrentState();
        if (s && !scrubbingRef.current) positionMsRef.current = s.position;
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(id);
  }, [deviceId, paused, playerRef]);

  /* ── Shared scrub handlers ──────────────────────────────────────────── */
  const handlePointerDown = () => {
    scrubbingRef.current = true;
    setScrubMs(positionMsRef.current);
  };
  const handleChange = (v: number) => {
    positionMsRef.current = v;
    setScrubMs(v);
    if (fillBarRef.current) fillBarRef.current.style.width = `${(v / durationMs) * 100}%`;
    if (mobileFillRef.current) mobileFillRef.current.style.width = `${(v / durationMs) * 100}%`;
    if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = formatMs(v);
  };
  const handlePointerUp = (v: number) => {
    positionMsRef.current = v;
    onSeekCommit(v);
    scrubbingRef.current = false;
    setScrubMs(null);
  };
  const handleCancel = () => {
    scrubbingRef.current = false;
    setScrubMs(null);
  };

  if (!deviceId || durationMs <= 0) {
    if (layout === "bar") {
      return <div className="absolute inset-x-0 top-0 h-[2px] bg-zinc-100 dark:bg-zinc-800 md:hidden" aria-hidden />;
    }
    return null;
  }

  /* ── Shared range input (uncontrolled so React never resets its value) */
  const rangeInput = (
    <input
      ref={rangeRef}
      type="range"
      min={0}
      max={durationMs}
      step={1000}
      defaultValue={positionMsRef.current}
      title={t("spotifyPlayerSeek")}
      aria-label={t("spotifyPlayerSeek")}
      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      onPointerDown={handlePointerDown}
      onChange={(e) => handleChange(Number(e.currentTarget.value))}
      onPointerUp={(e) => handlePointerUp(Number((e.currentTarget as HTMLInputElement).value))}
      onPointerCancel={handleCancel}
    />
  );

  /* ── Elapsed time label — direct DOM during RAF, React only on scrub ─ */
  const elapsedLabel = (
    <span ref={elapsedLabelRef} className="tabular-nums">
      {scrubMs !== null ? formatMs(scrubMs) : formatMs(positionMsRef.current)}
    </span>
  );

  if (layout === "bar") {
    return (
      <>
        {/* Mobile thin progress line at top of the bar */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-zinc-100 dark:bg-zinc-800 md:hidden" aria-hidden>
          <div
            ref={mobileFillRef}
            className="h-full bg-zinc-400 dark:bg-zinc-500"
            style={{ width: "0%", willChange: "width" }}
          />
        </div>

        {/* Desktop progress row (flex-1 slot in the bar) */}
        <div className="hidden flex-1 items-center gap-2 md:flex">
          <span className="w-8 shrink-0 text-right text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {elapsedLabel}
          </span>
          <div className="relative flex h-4 flex-1 cursor-pointer items-center overflow-hidden" style={{ touchAction: "none" }}>
            <div className="absolute inset-x-0 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <div
              ref={fillBarRef}
              className="pointer-events-none absolute inset-y-0 left-0 my-auto h-1 rounded-full bg-zinc-900 dark:bg-zinc-100"
              style={{ width: "0%", willChange: "width" }}
            />
            {rangeInput}
          </div>
          <span className="w-8 shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {formatMs(durationMs)}
          </span>
        </div>
      </>
    );
  }

  /* ── Card layout ────────────────────────────────────────────────────── */
  return (
    <div className="border-t border-zinc-100/90 px-3 pb-0.5 pt-1 dark:border-zinc-800/90">
      <div className="flex items-center gap-2 text-[10px] tabular-nums font-medium text-zinc-500 dark:text-zinc-400">
        <span className="w-8 shrink-0">{elapsedLabel}</span>
        <div className="relative flex h-4 flex-1 cursor-pointer items-center overflow-hidden" style={{ touchAction: "none" }}>
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div
            ref={fillBarRef}
            className="pointer-events-none absolute inset-y-0 left-0 my-auto h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100"
            style={{ width: "0%", willChange: "width" }}
          />
          {rangeInput}
        </div>
        <span className="w-8 shrink-0 text-right">{formatMs(durationMs)}</span>
      </div>
    </div>
  );
});
