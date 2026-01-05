import { useCallback, useEffect, useRef, useState } from "react";
import { textToVisemeFrames, type Viseme } from "@/call-ken/lib/phoneme-viseme";

const CHARS_PER_SECOND = 18;

type LipSyncSpeed = "slow" | "normal" | "fast";

function estimateDurationMs(text: string, speed: LipSyncSpeed): number {
  const chars = text.trim().length;
  if (chars === 0) return 0;
  const speedFactor = speed === "slow" ? 1.2 : speed === "fast" ? 0.82 : 1;
  return Math.max(
    120,
    Math.min(1600, ((chars / CHARS_PER_SECOND) * 1000) / speedFactor),
  );
}

export function usePhonemeLipSync(speed: LipSyncSpeed = "normal") {
  const [viseme, setViseme] = useState<Viseme>("rest");
  const [isSpeaking, setIsSpeaking] = useState(false);

  const queueRef = useRef<Array<{ at: number; viseme: Viseme }>>([]);
  const bufferRef = useRef("");
  const timeoutRef = useRef<number | null>(null);
  const idleAnimRef = useRef<number | null>(null);
  const idleStepRef = useRef(0);
  const nextAtRef = useRef(0);
  const speakingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearIdleAnimation = useCallback(() => {
    if (idleAnimRef.current !== null) {
      window.clearInterval(idleAnimRef.current);
      idleAnimRef.current = null;
    }
    idleStepRef.current = 0;
  }, []);

  const startIdleAnimation = useCallback(() => {
    if (idleAnimRef.current !== null) return;
    const fallbackCycle: Viseme[] = ["closed", "open", "wide", "round"];
    idleAnimRef.current = window.setInterval(() => {
      if (!speakingRef.current || queueRef.current.length > 0) return;
      const viseme = fallbackCycle[idleStepRef.current % fallbackCycle.length];
      idleStepRef.current += 1;
      setViseme(viseme);
    }, 95);
  }, []);

  const flushQueue = useCallback(() => {
    clearTimer();

    const tick = () => {
      const now = performance.now();
      const queue = queueRef.current;

      while (queue.length > 0 && queue[0].at <= now + 1) {
        const frame = queue.shift();
        if (frame) setViseme(frame.viseme);
      }

      if (queue.length === 0) {
        timeoutRef.current = null;
        if (!speakingRef.current) setViseme("rest");
        return;
      }

      const delay = Math.max(0, queue[0].at - performance.now());
      timeoutRef.current = window.setTimeout(tick, delay);
    };

    tick();
  }, [clearTimer]);

  const enqueueText = useCallback(
    (text: string) => {
      const clean = text.replace(/\s+/g, " ").trim();
      if (!clean) return;

      const now = performance.now();
      const startAtMs = Math.max(now + 25, nextAtRef.current || now + 25);
      const totalDurationMs = estimateDurationMs(clean, speed);
      const frames = textToVisemeFrames(clean, { startAtMs, totalDurationMs });
      if (frames.length === 0) return;

      queueRef.current.push(
        ...frames.map((frame) => ({ at: frame.atMs, viseme: frame.viseme })),
      );
      queueRef.current.sort((a, b) => a.at - b.at);
      nextAtRef.current = frames[frames.length - 1].atMs;

      flushQueue();
    },
    [flushQueue, speed],
  );

  const pushTranscriptDelta = useCallback(
    (delta: string) => {
      if (!delta) return;
      bufferRef.current += delta;

      // Keep incomplete tail to avoid splitting words mid-phoneme.
      const match = bufferRef.current.match(/^([\s\S]*[.,!?;:\s])([\s\S]*)$/);
      if (!match) return;

      const readyChunk = match[1].trim();
      const rest = match[2] ?? "";
      bufferRef.current = rest;

      if (readyChunk) enqueueText(readyChunk);
    },
    [enqueueText],
  );

  const startTurn = useCallback(() => {
    speakingRef.current = true;
    setIsSpeaking(true);
    startIdleAnimation();
  }, [startIdleAnimation]);

  const stopTurn = useCallback(() => {
    speakingRef.current = false;
    setIsSpeaking(false);
    clearIdleAnimation();

    const tail = bufferRef.current.trim();
    bufferRef.current = "";
    if (tail) enqueueText(tail);

    // Let queued closing viseme settle before resting.
    window.setTimeout(() => {
      if (!speakingRef.current && queueRef.current.length === 0) {
        setViseme("rest");
      }
    }, 120);
  }, [clearIdleAnimation, enqueueText]);

  const reset = useCallback(() => {
    speakingRef.current = false;
    setIsSpeaking(false);
    setViseme("rest");
    bufferRef.current = "";
    queueRef.current = [];
    nextAtRef.current = 0;
    clearTimer();
    clearIdleAnimation();
  }, [clearIdleAnimation, clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
      clearIdleAnimation();
    };
  }, [clearIdleAnimation, clearTimer]);

  return {
    viseme,
    isSpeaking,
    startTurn,
    stopTurn,
    pushTranscriptDelta,
    reset,
  };
}
