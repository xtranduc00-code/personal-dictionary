"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Tooltip } from "@/components/ui/Tooltip";
interface Props {
    src: string;
    onError?: () => void;
}
function fmt(s: number) {
    if (!isFinite(s))
        return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}
export function AudioPlayer({ src, onError }: Props) {
    const { t } = useI18n();
    const audioRef = useRef<HTMLAudioElement>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const setupDone = useRef(false);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [webAudioActive, setWebAudioActive] = useState(false);
    const ensureWebAudio = useCallback(() => {
        if (setupDone.current)
            return;
        const audio = audioRef.current;
        if (!audio)
            return;
        try {
            const Ctor: typeof AudioContext = window.AudioContext ??
                (window as any).webkitAudioContext;
            if (!Ctor)
                return;
            const ctx = new Ctor();
            const gain = ctx.createGain();
            gain.gain.value = muted ? 0 : volume;
            ctx.createMediaElementSource(audio).connect(gain);
            gain.connect(ctx.destination);
            ctxRef.current = ctx;
            gainRef.current = gain;
            setupDone.current = true;
            setWebAudioActive(true);
            audio.volume = 1;
        }
        catch {
        }
    }, [volume, muted]);
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio)
            return;
        const effective = muted ? 0 : volume;
        if (gainRef.current) {
            gainRef.current.gain.value = effective;
            audio.volume = 1;
        }
        else {
            audio.volume = Math.min(1, effective);
        }
    }, [volume, muted]);
    const resumeCtx = async () => {
        if (ctxRef.current?.state === "suspended") {
            await ctxRef.current.resume().catch(() => { });
        }
    };
    const togglePlay = async () => {
        const audio = audioRef.current;
        if (!audio)
            return;
        ensureWebAudio();
        await resumeCtx();
        if (audio.paused)
            await audio.play().catch(() => { });
        else
            audio.pause();
    };
    const seek = (delta: number) => {
        const audio = audioRef.current;
        if (!audio)
            return;
        audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
    };
    const onBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !audio.duration)
            return;
        const rect = e.currentTarget.getBoundingClientRect();
        audio.currentTime =
            ((e.clientX - rect.left) / rect.width) * audio.duration;
    };
    const pct = duration ? (currentTime / duration) * 100 : 0;
    const displayVol = muted ? 0 : volume;
    const maxVol = webAudioActive ? 3 : 1;
    return (<div className="flex w-full max-w-2xl flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      
      <audio ref={audioRef} src={src} crossOrigin="anonymous" preload="metadata" onError={onError} onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)} onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}/>

      
      <Tooltip content={t("audioSeekTooltip")}>
        <div className="relative h-1.5 w-full cursor-pointer rounded-full bg-zinc-200 dark:bg-zinc-700" onClick={onBarClick}>
          <div className="h-full rounded-full bg-blue-500 transition-[width] duration-100" style={{ width: `${pct}%` }}/>
        </div>
      </Tooltip>

      
      <div className="flex items-center gap-2">
        
        <Tooltip content={t("audioBack10s")}>
          <button type="button" onClick={() => seek(-10)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
            <RotateCcw className="h-4 w-4"/>
          </button>
        </Tooltip>

        
        <Tooltip content={playing ? t("audioPause") : t("audioPlay")}>
          <button type="button" onClick={togglePlay} className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 active:scale-95">
            {playing ? (<svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <rect x="3" y="2" width="4" height="12" rx="1"/>
                <rect x="9" y="2" width="4" height="12" rx="1"/>
              </svg>) : (<svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 translate-x-[1px]">
                <path d="M4 2.5l9 5.5-9 5.5V2.5z"/>
              </svg>)}
          </button>
        </Tooltip>

        
        <Tooltip content={t("audioForward10s")}>
          <button type="button" onClick={() => seek(10)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
            <RotateCw className="h-4 w-4"/>
          </button>
        </Tooltip>

        
        <span className="min-w-[72px] text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {fmt(currentTime)} / {fmt(duration)}
        </span>

        <div className="flex-1"/>

        
        <Tooltip content={t("audioMuteTooltip")}>
          <button type="button" onClick={() => setMuted((m) => !m)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
            {muted ? <VolumeX className="h-4 w-4"/> : <Volume2 className="h-4 w-4"/>}
          </button>
        </Tooltip>

        
        <Tooltip content={t("audioVolumeTooltip")}>
          <div className="flex items-center gap-1">
            <input type="range" min={0} max={maxVol} step={0.05} value={displayVol} onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            setMuted(v === 0);
            if (v > 1)
                ensureWebAudio();
        }} aria-label={t("audioVolumeTooltip")} className="h-1.5 w-20 cursor-pointer accent-blue-500"/>
          <span className={`w-9 text-right text-[11px] tabular-nums ${displayVol > 1
            ? "font-semibold text-amber-500"
            : "text-zinc-400 dark:text-zinc-500"}`}>
              {Math.round(displayVol * 100)}%
            </span>
          </div>
        </Tooltip>
      </div>

      
      {webAudioActive && displayVol > 1 && (<p className="text-center text-[10px] text-amber-500">
          🔊 Volume boost active ({Math.round(displayVol * 100)}%)
        </p>)}
    </div>);
}
