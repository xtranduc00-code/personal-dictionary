"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chess, Move } from "chess.js";
import { announcementForPlayedMove } from "@/lib/chess-move-announcement";
import {
  CHESS_MOVE_ANNOUNCE_EVENT,
  readChessMoveAnnounceEnabled,
  writeChessMoveAnnounceEnabled,
} from "@/lib/chess-move-announce-settings";

const CHIP_MS = 2000;

function speakAnnouncement(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1;
  u.lang = "en-US";
  window.speechSynthesis.speak(u);
}

export function useChessMoveAnnouncement() {
  const [enabled, setEnabledState] = useState(true);
  const [chip, setChip] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(true);

  useEffect(() => {
    setEnabledState(readChessMoveAnnounceEnabled());
    const onExt = () => setEnabledState(readChessMoveAnnounceEnabled());
    window.addEventListener(CHESS_MOVE_ANNOUNCE_EVENT, onExt);
    return () => window.removeEventListener(CHESS_MOVE_ANNOUNCE_EVENT, onExt);
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    writeChessMoveAnnounceEnabled(on);
  }, []);

  const announce = useCallback((move: Move, chessAfter: Chess) => {
    if (!enabledRef.current) return;
    const text = announcementForPlayedMove(move, chessAfter);
    if (!text) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    setChip(text);
    timerRef.current = setTimeout(() => {
      setChip(null);
      timerRef.current = null;
    }, CHIP_MS);

    speakAnnouncement(text);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { enabled, setEnabled, chip, announce };
}
