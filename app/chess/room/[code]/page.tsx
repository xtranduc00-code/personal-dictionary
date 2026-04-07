"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { joinChessGame, type ChessGame } from "@/lib/chess-storage";
import { ChessWorkspace } from "../../chess-workspace";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code?.toUpperCase() ?? "";
  const [game, setGame] = useState<ChessGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) {
      setError("No room code provided");
      setLoading(false);
      return;
    }

    joinChessGame(code)
      .then((g) => {
        setGame(g);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Room not found");
      })
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800" />
          <p className="text-sm text-zinc-500">Joining room {code}…</p>
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="w-full max-w-xs rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Could not join room
          </p>
          <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
            {error ?? "Room not found or has expired."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/chess")}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Back to Chess
          </button>
        </div>
      </div>
    );
  }

  return <ChessWorkspace initialRoom={game} />;
}
