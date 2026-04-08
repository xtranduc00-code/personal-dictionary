"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Pause, Play, SkipBack, SkipForward, Youtube, ListMusic, X, ChevronLeft, Loader2 } from "lucide-react";
import { useYTPlayer, type YTQueueItem } from "@/lib/yt-player-context";
import {
  loadYoutubeIframeApi,
  YT_STATE_BUFFERING,
  YT_STATE_PLAYING,
  type YtPlayerApi,
} from "@/lib/youtube-watch";
import {
  getMyPlaylists, getMyPlaylistItems,
  type MyPlaylist, type MyPlaylistItem,
} from "@/lib/youtube-storage";

// ─── Playlist browser popup ────────────────────────────────────────────────────

function formatDockTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function PlaylistBrowser({ onClose, onPlay }: {
  onClose: () => void;
  onPlay: (items: YTQueueItem[], idx: number) => void;
}) {
  const [playlists, setPlaylists] = useState<MyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPl, setOpenPl] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<MyPlaylistItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyPlaylists()
      .then((pl) => { if (alive) setPlaylists(pl); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  function openPlaylist(pl: MyPlaylist) {
    setOpenPl(pl);
    setItems([]);
    setLoadingItems(true);
    getMyPlaylistItems(pl.id)
      .then((v) => setItems(v))
      .catch(() => {})
      .finally(() => setLoadingItems(false));
  }

  function toQueueItem(v: MyPlaylistItem): YTQueueItem {
    return {
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail,
      channelTitle: v.channelTitle,
      publishedAt: v.publishedAt,
    };
  }

  return (
    <div className="w-72 max-h-96 flex flex-col rounded-2xl border border-zinc-200/90 bg-white/95 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md dark:border-zinc-700/90 dark:bg-zinc-950/95 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        {openPl ? (
          <button
            onClick={() => { setOpenPl(null); setItems([]); }}
            className="rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <span className="flex-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider truncate">
          {openPl ? openPl.name : "My Playlists"}
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!openPl ? (
          loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="py-1">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => openPlaylist(pl)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <ListMusic className="h-4 w-4 text-red-500" />
                  </div>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{pl.name}</span>
                </button>
              ))}
              {playlists.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">
                  No playlists yet — add videos from the Videos page
                </p>
              )}
            </div>
          )
        ) : (
          loadingItems ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-400">No videos in this playlist</p>
          ) : (
            <div className="py-1">
              {items.map((v, i) => (
                <button
                  key={`${v.videoId}-${i}`}
                  onClick={() => { onPlay(items.map(toQueueItem), i); onClose(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-700">
                    <Image src={v.thumbnail} alt={v.title} fill sizes="64px" className="object-cover" unoptimized />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p title={v.title} className="text-xs font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">{v.title}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{v.channelTitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main dock ─────────────────────────────────────────────────────────────────

export function YouTubeDock() {
  const {
    current, queue, queueIdx, next, prev, play,
    muteAudio,
    playbackState, updatePlaybackState, latestCurrentTimeRef,
    activePlayerRef,
    mainPlayerActive,
    close,
  } = useYTPlayer();

  const iframeHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayerApi | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // Ref mirror of mainPlayerActive for use inside intervals/closures
  const mainPlayerActiveRef = useRef(mainPlayerActive);

  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const seekingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync
  useEffect(() => {
    mainPlayerActiveRef.current = mainPlayerActive;
  }, [mainPlayerActive]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Close library when clicking outside
  useEffect(() => {
    if (!showLibrary) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setShowLibrary(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showLibrary]);

  // Fullscreen listener
  useEffect(() => {
    const onFs = () => { if (mountedRef.current) setIsFullscreen(Boolean(document.fullscreenElement)); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Build / rebuild player when video changes
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    if (mountedRef.current) { setReady(false); }

    loadYoutubeIframeApi().then(() => {
      if (cancelled || !window.YT?.Player || !iframeHostRef.current) return;

      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;

      const host = iframeHostRef.current;
      host.innerHTML = "";
      const target = document.createElement("div");
      host.appendChild(target);

      const player = new window.YT.Player(target, {
        videoId: current.videoId,
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, disablekb: 1, fs: 0 },
        events: {
          onReady: (e) => {
            if (cancelled || !mountedRef.current) return;
            playerRef.current = e.target;
            const d = e.target.getDuration();
            const live = !isFinite(d) || d === 0;
            setReady(true);
            // Only take ownership if main player isn't active
            if (!mainPlayerActiveRef.current) {
              activePlayerRef.current = e.target;
              updatePlaybackState({ ready: true, isLive: live, duration: live ? 0 : d });
            }
            e.target.playVideo();
            if (muteAudio) try { e.target.mute(); } catch { /* ignore */ }
          },
          onStateChange: (e) => {
            if (cancelled || !mountedRef.current) return;
            const isPlaying = e.data === YT_STATE_PLAYING || e.data === YT_STATE_BUFFERING;
            if (!mainPlayerActiveRef.current) {
              updatePlaybackState({ playing: isPlaying });
            }
            if (e.data === 0) next();
          },
        },
      });
      playerRef.current = player;
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.videoId]);

  // Mute/unmute — also re-sync position when unmuting after main player was active
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try {
      if (muteAudio) {
        p.mute();
      } else {
        p.unMute();
        // When the main player closes and the dock takes over again, seek to
        // the last known position so the dock audio doesn't jump back in time.
        if (!mainPlayerActiveRef.current) {
          activePlayerRef.current = p;
          const savedTime = latestCurrentTimeRef.current;
          const dockTime = (() => { try { return p.getCurrentTime(); } catch { return 0; } })();
          if (Math.abs(dockTime - savedTime) > 2) {
            try { p.seekTo(savedTime, true); } catch { /* ignore */ }
          }
          updatePlaybackState({ ready: true });
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muteAudio, ready]);

  // Poll current time and push to shared context (only when dock owns the player)
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (!mountedRef.current || seekingRef.current) return;
      if (mainPlayerActiveRef.current) return; // main player handles its own ticking
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime();
        const d = p.getDuration();
        if (isFinite(t)) updatePlaybackState({ currentTime: t });
        if (isFinite(d) && d > 0) updatePlaybackState({ duration: d });
      } catch { /* ignore */ }
    }, 500);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controls always target the active player (dock or main), not just own iframe
  function togglePlay() {
    const p = activePlayerRef.current;
    if (!p) return;
    try {
      if (p.getPlayerState() === YT_STATE_PLAYING) p.pauseVideo();
      else p.playVideo();
    } catch { /* ignore */ }
  }

  // Derived display values come from shared context — always in sync
  const { currentTime, duration, playing, isLive } = playbackState;
  const invisible = !current || isFullscreen;

  return (
    <div
      ref={rootRef}
      className={`group/dock fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 transition-opacity duration-200 ${invisible ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      {/* ── Library popup ── */}
      {showLibrary && (
        <PlaylistBrowser
          onClose={() => setShowLibrary(false)}
          onPlay={(items, idx) => play(items[idx], items, idx)}
        />
      )}

      {/* ── Controls row ── */}
      <div
        className="flex items-center justify-end"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Expanded panel */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-out ${
            expanded && current ? "max-w-[340px] opacity-100 pr-2" : "max-w-0 opacity-0 pr-0"
          }`}
          style={{ minWidth: 0 }}
        >
          <div className="flex flex-col gap-1.5 rounded-2xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/90 dark:bg-zinc-950/95 dark:ring-white/[0.06]">
            {/* Top row: track info + controls + library */}
            <div className="flex items-center gap-2">
              {/* Track info */}
              <div className="w-32 min-w-0 shrink-0">
                <p title={current?.title} className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
                  {current?.title}
                </p>
                <p className="truncate text-xs leading-tight text-zinc-500 dark:text-zinc-400">
                  {isLive
                    ? <span className="flex items-center gap-1 text-red-500 font-medium"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />LIVE · {current?.channelTitle}</span>
                    : current?.channelTitle}
                </p>
              </div>

              {/* Controls */}
              <div className="flex shrink-0 items-center gap-0.5">
                <button onClick={prev} disabled={queueIdx <= 0}
                  className="rounded-full p-1.5 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <SkipBack className="h-4 w-4" />
                </button>
                <button onClick={togglePlay} disabled={!ready}
                  className="rounded-full bg-zinc-900 p-2 text-white shadow-sm transition duration-200 hover:scale-[1.06] hover:bg-zinc-800 disabled:opacity-40 disabled:hover:scale-100 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {playing
                    ? <Pause className="h-[15px] w-[15px]" fill="currentColor" />
                    : <Play className="h-[15px] w-[15px]" fill="currentColor" />}
                </button>
                <button onClick={next} disabled={queueIdx >= queue.length - 1}
                  className="rounded-full p-1.5 text-zinc-600 transition duration-200 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>

              {/* Library button */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowLibrary((v) => !v); }}
                className={`shrink-0 rounded-full p-1.5 transition duration-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${showLibrary ? "text-red-500" : "text-zinc-400 dark:text-zinc-500"}`}
                title="My playlists"
              >
                <ListMusic className="h-4 w-4" />
              </button>
            </div>

            {/* Seek bar — controls the active player regardless of who owns it */}
            {!isLive && duration > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">{formatDockTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={1}
                  value={Math.min(currentTime, duration)}
                  onChange={(e) => {
                    seekingRef.current = true;
                    // Optimistically update context so UI feels instant
                    updatePlaybackState({ currentTime: Number(e.target.value) });
                  }}
                  onMouseUp={(e) => {
                    const t = Number((e.target as HTMLInputElement).value);
                    try { activePlayerRef.current?.seekTo(t, true); } catch { /* ignore */ }
                    seekingRef.current = false;
                  }}
                  onTouchEnd={(e) => {
                    const t = Number((e.target as HTMLInputElement).value);
                    try { activePlayerRef.current?.seekTo(t, true); } catch { /* ignore */ }
                    seekingRef.current = false;
                  }}
                  className="h-1 flex-1 cursor-pointer accent-red-500"
                />
                <span className="w-8 shrink-0 text-[10px] tabular-nums text-zinc-400">{formatDockTime(duration)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Thumbnail (always visible) */}
        <div className="relative shrink-0">
          <button
            onClick={togglePlay}
            disabled={!ready}
            aria-label={playing ? "Pause" : "Play"}
            className="relative h-12 w-12 overflow-hidden rounded-2xl bg-zinc-200 shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg disabled:opacity-50 dark:bg-zinc-700"
          >
            {current?.thumbnail ? (
              <Image src={current.thumbnail} alt={current.title ?? ""} fill sizes="48px" className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-red-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
                <Youtube className="h-6 w-6 text-red-400" />
              </div>
            )}
            {!playing && !expanded ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-5 w-5 text-white drop-shadow-md" fill="currentColor" />
              </div>
            ) : null}
            {playing ? (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 shadow ring-[1.5px] ring-white dark:ring-zinc-900" />
            ) : null}
            {isLive ? (
              <span className="absolute bottom-0.5 left-0.5 rounded bg-red-600 px-1 text-[7px] font-bold text-white">LIVE</span>
            ) : null}
          </button>
          {/* Close button — shown on hover of the thumbnail wrapper */}
          <button
            onClick={(e) => { e.stopPropagation(); close(); }}
            aria-label="Close player"
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-zinc-200 opacity-0 shadow transition-opacity group-hover/dock:opacity-100 hover:bg-zinc-600"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {/* Hidden iframe — dock's own player (paused/muted when main player is active) */}
      <div
        ref={iframeHostRef}
        className="absolute pointer-events-none"
        style={{ width: 1, height: 1, overflow: "hidden", bottom: 0, right: 0, opacity: 0 }}
        aria-hidden
      />
    </div>
  );
}
