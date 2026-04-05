"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

/* ─── Sound types ─────────────────────────────────────────────── */
type SoundId = "rain" | "cafe" | "ocean";

const SOUNDS: { id: SoundId; emoji: string; label: string }[] = [
  { id: "rain",  emoji: "🌧️", label: "Rain"  },
  { id: "cafe",  emoji: "☕",  label: "Cafe"  },
  { id: "ocean", emoji: "🌊", label: "Ocean" },
];

/* ─── Web Audio generators ────────────────────────────────────── */

function makeWhiteNoise(ctx: AudioContext): AudioBufferSourceNode {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  return src;
}

function makePinkNoise(ctx: AudioContext): AudioBufferSourceNode {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)/6.5; b6=w*0.115926;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  return src;
}

function makeBrownNoise(ctx: AudioContext): AudioBufferSourceNode {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (last + 0.02 * w) / 1.02; last = d[i]; d[i] *= 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  return src;
}

/**
 * Synthetic room reverb — connects `from` → convolver → wetGain → `to`.
 * The dry path (from → to) must be wired separately.
 */
function addReverb(
  ctx: AudioContext,
  from: AudioNode,
  to: AudioNode,
  decaySec: number,
  wet: number,
) {
  const len = Math.floor(ctx.sampleRate * decaySec);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  const wetG = ctx.createGain();
  wetG.gain.value = wet;
  from.connect(conv);
  conv.connect(wetG);
  wetG.connect(to);
}

/** LFO that additively modulates a GainNode's gain param. Returns OscillatorNode to stop later. */
function lfo(
  ctx: AudioContext,
  target: AudioParam,
  hz: number,
  depth: number,
): OscillatorNode {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  amp.gain.value = depth;
  osc.connect(amp);
  amp.connect(target);
  osc.start();
  return osc;
}

/* ─── Multi-layer audio graph ─────────────────────────────────── */
function buildGraph(
  ctx: AudioContext,
  type: SoundId,
  master: GainNode,
): (AudioBufferSourceNode | OscillatorNode)[] {
  const stop: (AudioBufferSourceNode | OscillatorNode)[] = [];

  if (type === "rain") {
    /*
     * Rain = 3 layers:
     *  ① treble  — white noise → HP 3 kHz   (drizzle / droplets)
     *  ② mid     — pink noise  → BP 700 Hz  (splash on surface)
     *  ③ bass    — brown noise → LP 150 Hz  (outdoor rumble)
     * + convolution reverb on treble layer for spatial depth
     */
    // ① treble drizzle
    const s1 = makeWhiteNoise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 3000;
    const g1 = ctx.createGain(); g1.gain.value = 0.18;
    s1.connect(hp).connect(g1);
    g1.connect(master);                          // dry
    addReverb(ctx, g1, master, 1.2, 0.28);      // wet
    stop.push(s1, lfo(ctx, g1.gain, 0.25, 0.06)); // subtle intensity flicker
    s1.start();

    // ② mid splash
    const s2 = makePinkNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 1.2;
    const g2 = ctx.createGain(); g2.gain.value = 0.42;
    s2.connect(bp).connect(g2).connect(master);
    stop.push(s2);
    s2.start();

    // ③ bass rumble
    const s3 = makeBrownNoise(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 150;
    const g3 = ctx.createGain(); g3.gain.value = 0.36;
    s3.connect(lp).connect(g3).connect(master);
    stop.push(s3);
    s3.start();

  } else if (type === "cafe") {
    /*
     * Cafe = 3 layers:
     *  ① chatter  — pink noise  → BP 1200 Hz + slow LFO (voices ebbing)
     *  ② room     — brown noise → LP 200 Hz              (HVAC / room tone)
     *  ③ sparkle  — white noise → HP 5 kHz  (cups / cutlery, very light)
     * + reverb on chatter for room feel
     */
    // ① chatter
    const s1 = makePinkNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 0.4;
    const g1 = ctx.createGain(); g1.gain.value = 0.38;
    s1.connect(bp).connect(g1);
    g1.connect(master);
    addReverb(ctx, g1, master, 1.8, 0.22);
    stop.push(s1, lfo(ctx, g1.gain, 0.05, 0.12)); // conversation ebb & flow
    s1.start();

    // ② room tone
    const s2 = makeBrownNoise(ctx);
    const lp2 = ctx.createBiquadFilter();
    lp2.type = "lowpass"; lp2.frequency.value = 200;
    const g2 = ctx.createGain(); g2.gain.value = 0.32;
    s2.connect(lp2).connect(g2).connect(master);
    stop.push(s2);
    s2.start();

    // ③ cutlery sparkle
    const s3 = makeWhiteNoise(ctx);
    const hp3 = ctx.createBiquadFilter();
    hp3.type = "highpass"; hp3.frequency.value = 5000;
    const g3 = ctx.createGain(); g3.gain.value = 0.07;
    s3.connect(hp3).connect(g3).connect(master);
    stop.push(s3);
    s3.start();

  } else {
    /*
     * Ocean = 3 layers:
     *  ① crash  — white noise → LP 1200 Hz + LFO 0.08 Hz  (wave swell)
     *  ② hiss   — white noise → HP 2800 Hz + LFO 0.09 Hz  (receding water)
     *  ③ sub    — brown noise → LP 80 Hz                   (deep rumble)
     * + heavy reverb on crash for open-air feel
     */
    // ① wave crash
    const s1 = makeWhiteNoise(ctx);
    const lp1 = ctx.createBiquadFilter();
    lp1.type = "lowpass"; lp1.frequency.value = 1200;
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    s1.connect(lp1).connect(g1);
    g1.connect(master);
    addReverb(ctx, g1, master, 2.5, 0.4);
    stop.push(s1, lfo(ctx, g1.gain, 0.08, 0.35)); // swell in
    s1.start();

    // ② receding hiss (slightly offset phase → hiss peaks as crash recedes)
    const s2 = makeWhiteNoise(ctx);
    const hp2 = ctx.createBiquadFilter();
    hp2.type = "highpass"; hp2.frequency.value = 2800;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    s2.connect(hp2).connect(g2).connect(master);
    stop.push(s2, lfo(ctx, g2.gain, 0.09, 0.08));
    s2.start();

    // ③ sub rumble
    const s3 = makeBrownNoise(ctx);
    const lp3 = ctx.createBiquadFilter();
    lp3.type = "lowpass"; lp3.frequency.value = 80;
    const g3 = ctx.createGain(); g3.gain.value = 0.32;
    s3.connect(lp3).connect(g3).connect(master);
    stop.push(s3);
    s3.start();
  }

  return stop;
}

/* ─── Persistence ─────────────────────────────────────────────── */
const STORAGE_KEY = "ambient-prefs";

function loadPrefs(): { sound: SoundId; volume: number; wasPlaying: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sound: "rain", volume: 0.4, wasPlaying: false };
    const p = JSON.parse(raw) as Partial<{
      sound: SoundId;
      volume: number;
      wasPlaying: boolean;
    }>;
    return {
      sound: (["rain","cafe","ocean"] as SoundId[]).includes(p.sound as SoundId)
        ? (p.sound as SoundId)
        : "rain",
      volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : 0.4,
      wasPlaying: Boolean(p.wasPlaying),
    };
  } catch {
    return { sound: "rain", volume: 0.4, wasPlaying: false };
  }
}

function savePrefs(sound: SoundId, volume: number, wasPlaying: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sound, volume, wasPlaying }));
  } catch {}
}

/* ─── Component ───────────────────────────────────────────────── */
export function AmbientPlayer() {
  const prefs = useRef(loadPrefs());

  const [playing, setPlaying]       = useState(false);
  const [sound, setSound]           = useState<SoundId>(prefs.current.sound);
  const [volume, setVolume]         = useState(prefs.current.volume);
  const [open, setOpen]             = useState(false);
  // true = user had it playing last session; waiting for first click to auto-resume
  const [pendingPlay, setPending]   = useState(prefs.current.wasPlaying);

  const ctxRef      = useRef<AudioContext | null>(null);
  const gainRef     = useRef<GainNode | null>(null);
  const nodesRef    = useRef<(AudioBufferSourceNode | OscillatorNode)[]>([]);

  /* Stop all running audio nodes */
  const stopNodes = useCallback(() => {
    nodesRef.current.forEach((n) => { try { n.stop(); } catch {} });
    nodesRef.current = [];
    gainRef.current?.disconnect();
    gainRef.current = null;
  }, []);

  /* Start a sound */
  const startSound = useCallback((id: SoundId, vol: number) => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    stopNodes();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    gain.connect(ctx.destination);
    gainRef.current = gain;
    nodesRef.current = buildGraph(ctx, id, gain);
  }, [stopNodes]);

  /* Toggle play / pause */
  const toggle = useCallback(() => {
    setPending(false);
    if (playing) {
      stopNodes();
      setPlaying(false);
    } else {
      startSound(sound, volume);
      setPlaying(true);
    }
  }, [playing, sound, volume, startSound, stopNodes]);

  /* Change sound while keeping playback state */
  const changeSound = useCallback((id: SoundId) => {
    setSound(id);
    if (playing) startSound(id, volume);
  }, [playing, volume, startSound]);

  /* Smooth volume ramp */
  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    if (gainRef.current) {
      gainRef.current.gain.setTargetAtTime(
        v, gainRef.current.context.currentTime, 0.05,
      );
    }
  }, []);

  /* Auto-resume on first user interaction if wasPlaying last session */
  useEffect(() => {
    if (!pendingPlay) return;
    const resume = () => {
      setPending(false);
      startSound(sound, volume);
      setPlaying(true);
      document.removeEventListener("click", resume, true);
    };
    document.addEventListener("click", resume, true);
    return () => document.removeEventListener("click", resume, true);
  }, [pendingPlay, sound, volume, startSound]);

  /* Persist preferences */
  useEffect(() => {
    savePrefs(sound, volume, playing);
  }, [sound, volume, playing]);

  /* Cleanup */
  useEffect(() => {
    return () => {
      stopNodes();
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopNodes]);

  /* Close panel on outside click */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const curr = SOUNDS.find((s) => s.id === sound)!;
  const isPending = pendingPlay && !playing;

  return (
    <div ref={panelRef} className="fixed bottom-[72px] right-3 z-[200] flex flex-col items-end gap-2">

      {/* ── Expanded panel ── */}
      {open && (
        <div className="w-52 rounded-2xl border border-zinc-200/80 bg-white/96 p-3.5 shadow-xl ring-1 ring-black/[0.04] backdrop-blur-md dark:border-zinc-700/70 dark:bg-zinc-900/96 dark:ring-white/[0.04]">

          {/* Sound buttons */}
          <div className="mb-3.5 grid grid-cols-3 gap-1.5">
            {SOUNDS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => changeSound(s.id)}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-2.5 text-lg transition-all duration-150 ${
                  sound === s.id
                    ? "bg-zinc-100 shadow-inner ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:ring-zinc-700"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
              >
                <span>{s.emoji}</span>
                <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                  {s.label}
                </span>
              </button>
            ))}
          </div>

          {/* Volume slider */}
          <div className="flex items-center gap-2">
            <VolumeX className="h-3 w-3 shrink-0 text-zinc-400" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-600 dark:bg-zinc-700 dark:accent-zinc-400"
            />
            <Volume2 className="h-3 w-3 shrink-0 text-zinc-400" />
          </div>
        </div>
      )}

      {/* ── Floating pill ── */}
      <div
        className={`flex items-center gap-1 rounded-full border bg-white/90 pl-2.5 pr-1.5 py-1.5 shadow-md backdrop-blur-sm transition-all dark:bg-zinc-900/90 ${
          playing
            ? "border-zinc-300/80 dark:border-zinc-600/80"
            : "border-zinc-200/70 dark:border-zinc-700/70"
        }`}
      >
        {/* Emoji + label — click to toggle panel */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5"
          aria-label="Ambient sounds settings"
        >
          <span className="text-[15px] leading-none">{curr.emoji}</span>
          <span
            className={`w-5 select-none text-left text-[10px] font-semibold transition-colors ${
              playing
                ? "text-zinc-700 dark:text-zinc-200"
                : isPending
                  ? "text-amber-500"
                  : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {playing ? "On" : isPending ? "…" : "Off"}
          </span>
        </button>

        {/* Play / Pause */}
        <button
          type="button"
          onClick={toggle}
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label={playing ? "Pause ambient" : "Play ambient"}
        >
          {playing
            ? <Pause className="h-3 w-3 fill-current" />
            : <Play  className="h-3 w-3 fill-current" />
          }
        </button>
      </div>
    </div>
  );
}
