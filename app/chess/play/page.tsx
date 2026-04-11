"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { createChessGame } from "@/lib/chess-storage";
import { PlayLobby, TIME_CONTROLS_POPULAR, type TimeControl } from "../chess-workspace";

/**
 * Standalone Play with Friend lobby route — survives F5 and gives a shareable
 * URL. Manages the same local state the in-workspace lobby used to manage,
 * then navigates to /chess/room/[code] when a room is created or joined.
 */
export default function PlayLobbyPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  // Default to "Blitz 5+0" — the third popular time control.
  const [tc, setTc] = useState<TimeControl>(
    TIME_CONTROLS_POPULAR[2] ?? TIME_CONTROLS_POPULAR[0]!,
  );
  const [color, setColor] = useState<"white" | "black" | "random">("random");

  async function handleCreate() {
    setCreating(true);
    try {
      const g = await createChessGame();
      router.push(`/chess/room/${g.roomCode}`);
    } catch {
      toast.error("Failed to create game");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    try {
      router.push(`/chess/room/${code}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Game not found");
    } finally {
      setJoining(false);
    }
  }

  return (
    <PlayLobby
      joinCode={joinCode}
      setJoinCode={setJoinCode}
      creating={creating}
      joining={joining}
      tc={tc}
      setTc={setTc}
      color={color}
      setColor={setColor}
      createdGame={null}
      onCreate={handleCreate}
      onEnterGame={() => {
        /* Created room navigates immediately to /chess/room/[code] above. */
      }}
      onJoin={handleJoin}
      onBack={() => router.push("/chess")}
    />
  );
}
