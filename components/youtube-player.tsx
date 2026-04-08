"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FastForward, Maximize2, Minimize2, Pause, Play, Rewind, Volume2, VolumeX, X,
  Subtitles, Settings, ListPlus,
} from "lucide-react";
import {
  loadYoutubeIframeApi,
  YT_STATE_BUFFERING,
  YT_STATE_PLAYING,
  type YtPlayerApi,
} from "@/lib/youtube-watch";
import { useYTPlayer } from "@/lib/yt-player-context";

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type Props = {
  videoId: string;
  title?: string;
  channelTitle?: string;
  publishedAt?: string;
  onClose: () => void;
  onAddToPlaylist?: () => void;
};

export function YouTubePlayer({ videoId, title, channelTitle, onClose, onAddToPlaylist }: Props) {
  const {
    playbackState,
    updatePlaybackState,
    latestCurrentTimeRef,
    activePlayerRef,
    setMainPlayerActive,
  } = useYTPlayer();

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayerApi | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrubRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubTime, setScrubTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Register as the active player owner for the lifetime of this component
  useEffect(() => {
    setMainPlayerActive(true);
    return () => {
      // Save final position to context before handing back to dock
      try {
        const finalTime = playerRef.current?.getCurrentTime() ?? latestCurrentTimeRef.current;
        updatePlaybackState({ currentTime: finalTime, playing: false, ready: false });
      } catch { /* ignore */ }
      activePlayerRef.current = null;
      setMainPlayerActive(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build player — seek to where the dock (or previous instance) left off
  useEffect(() => {
    let cancelled = false;
    const host = containerRef.current;
    if (!host) return;

    // Capture the resume position at effect-run time using the always-current ref
    const resumeTime = latestCurrentTimeRef.current;

    loadYoutubeIframeApi().then(() => {
      if (cancelled || !window.YT?.Player) return;

      const player = new window.YT.Player(host, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          autoplay: 1,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            playerRef.current = e.target;
            activePlayerRef.current = e.target; // This player now owns the activePlayerRef

            // Seamless handoff: seek to where the dock was playing
            if (resumeTime > 2) {
              try { e.target.seekTo(resumeTime, true); } catch { /* ignore */ }
            }

            const d = e.target.getDuration();
            const live = !isFinite(d) || d <= 0;
            setIsLive(live);
            if (!live) {
              setDuration(d);
              updatePlaybackState({ ready: true, isLive: false, duration: d });
            } else {
              updatePlaybackState({ ready: true, isLive: true });
            }
            setReady(true);
            e.target.playVideo();
          },
          onStateChange: (e) => {
            if (cancelled) return;
            const isPlaying = e.data === YT_STATE_PLAYING || e.data === YT_STATE_BUFFERING;
            setPlaying(isPlaying);
            updatePlaybackState({ playing: isPlaying });
            try {
              const d = e.target.getDuration();
              if (isFinite(d) && d > 0) {
                setDuration(d);
                setIsLive(false);
                updatePlaybackState({ duration: d, isLive: false });
              } else {
                setIsLive(true);
                updatePlaybackState({ isLive: true });
              }
            } catch { /* ignore */ }
          },
        },
      });

      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Tick: push currentTime to shared context so dock seek bar stays in sync
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (scrubRef.current) return;
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime();
        setCurrentTime(t);
        updatePlaybackState({ currentTime: t });
        const d = p.getDuration();
        if (isFinite(d) && d > 0) {
          setDuration(d);
          updatePlaybackState({ duration: d });
        }
      } catch { /* ignore */ }
    }, 250);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local currentTime in sync with shared state (e.g. dock sought while main is playing)
  useEffect(() => {
    if (scrubRef.current) return;
    const diff = Math.abs(playbackState.currentTime - currentTime);
    // Only snap if dock sought more than 2 s away (avoid fighting the ticker)
    if (diff > 2) {
      setCurrentTime(playbackState.currentTime);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackState.currentTime]);

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.getPlayerState() === YT_STATE_PLAYING) p.pauseVideo();
      else p.playVideo();
    } catch { /* ignore */ }
  }, []);

  const skip = useCallback((delta: number) => {
    const p = playerRef.current;
    if (!p) return;
    try { p.seekTo(Math.max(0, p.getCurrentTime() + delta), true); } catch { /* ignore */ }
  }, []);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    setMuted(v === 0);
    try { playerRef.current?.setVolume(Math.round(v * 100)); } catch { /* ignore */ }
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    try { playerRef.current?.setVolume(next ? 0 : Math.round(volume * 100)); } catch { /* ignore */ }
  }, [muted, volume]);

  const handleSpeedChange = useCallback((rate: number) => {
    setSpeed(rate);
    setShowSettings(false);
    try { playerRef.current?.setPlaybackRate(rate); } catch { /* ignore */ }
  }, []);

  const toggleCc = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (ccEnabled) {
        p.unloadModule("captions");
      } else {
        p.loadModule("captions");
        p.setOption("captions", "track", { languageCode: "en" });
      }
      setCcEnabled((v) => !v);
    } catch { /* ignore */ }
  }, [ccEnabled]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setFullscreen(true)).catch(() => { /* ignore */ });
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => { /* ignore */ });
    }
  }, []);

  useEffect(() => {
    const onFsc = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsc);
    return () => document.removeEventListener("fullscreenchange", onFsc);
  }, []);

  const durationSafe = duration > 0 ? duration : 1;
  const displayTime = scrubRef.current ? scrubTime : currentTime;

  return (
    <div
      ref={wrapperRef}
      className="flex flex-col w-full h-full bg-black rounded-xl overflow-hidden"
    >
      {/* Player area */}
      <div className="relative flex-1 min-h-0 bg-black">
        {/* YouTube iframe target */}
        <div ref={containerRef} className="absolute inset-0 w-full h-full" />

        {/* Loading overlay */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="h-8 w-8 rounded-full border-2 border-zinc-600 border-t-white animate-spin" />
          </div>
        )}

        {/* Click overlay for play/pause */}
        <div className="absolute inset-0 z-10 cursor-pointer" onClick={togglePlay} />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Controls bar */}
      <div className="shrink-0 bg-zinc-900 border-t border-zinc-800 px-3 py-2 flex flex-col gap-1.5">
        {/* Seek bar (hidden for live streams) */}
        {isLive ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold bg-red-600 text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse inline-block" />
              LIVE
            </span>
            <div className="flex-1 h-1 rounded-full bg-zinc-700">
              <div className="h-full w-full rounded-full bg-red-600 animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-[10px] text-zinc-400 shrink-0 w-10 text-right">
              {fmt(displayTime)}
            </span>
            <input
              type="range"
              className="flex-1 h-1 accent-red-500 cursor-pointer"
              min={0}
              max={durationSafe}
              step={0.1}
              value={Math.min(displayTime, durationSafe)}
              onPointerDown={() => {
                scrubRef.current = true;
                setScrubTime(currentTime);
              }}
              onChange={(e) => {
                setScrubTime(Number(e.target.value));
              }}
              onPointerUp={(e) => {
                const t = Number((e.target as HTMLInputElement).value);
                scrubRef.current = false;
                try { playerRef.current?.seekTo(t, true); } catch { /* ignore */ }
                setCurrentTime(t);
                updatePlaybackState({ currentTime: t }); // sync dock immediately
              }}
              disabled={!ready || durationSafe <= 1}
            />
            <span className="tabular-nums text-[10px] text-zinc-400 shrink-0 w-10">
              {fmt(duration)}
            </span>
          </div>
        )}

        {/* Buttons row */}
        <div className="flex items-center gap-1.5">
          {/* Rewind (hidden for live) */}
          {!isLive && (
            <button
              onClick={() => skip(-10)}
              disabled={!ready}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              title="-10s"
            >
              <Rewind className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            disabled={!ready}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>

          {/* Forward (hidden for live) */}
          {!isLive && (
            <button
              onClick={() => skip(10)}
              disabled={!ready}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              title="+10s"
            >
              <FastForward className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Volume */}
          <button
            onClick={toggleMute}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            {muted || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <input
            type="range"
            className="w-16 h-1 accent-zinc-400 cursor-pointer"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Add to my playlist */}
          {onAddToPlaylist && (
            <button
              onClick={onAddToPlaylist}
              title="Add to my playlist"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-colors"
            >
              <ListPlus className="h-3.5 w-3.5" />
            </button>
          )}

          {/* CC */}
          <button
            onClick={toggleCc}
            disabled={!ready}
            title="Subtitles"
            className={`inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-2 text-[10px] font-bold transition-colors disabled:opacity-40 ${
              ccEnabled
                ? "border-white bg-white text-zinc-900"
                : "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            }`}
          >
            <Subtitles className="h-3.5 w-3.5" />
          </button>

          {/* Settings (speed) */}
          <div className="relative">
            <button
              onClick={() => setShowSettings((v) => !v)}
              disabled={!ready}
              title="Settings"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>

            {showSettings && (
              <div
                className="absolute bottom-9 right-0 z-30 w-52 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
                onMouseLeave={() => setShowSettings(false)}
              >
                <div className="px-3 py-2 border-b border-zinc-700">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Speed</p>
                  <div className="flex flex-wrap gap-1">
                    {SPEED_OPTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => handleSpeedChange(r)}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          speed === r
                            ? "bg-white text-zinc-900"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {r === 1 ? "Normal" : `${r}×`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-colors"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
