"use client";

import { memo } from "react";
import Image from "next/image";
import { Music2, Play } from "lucide-react";
import type { SpotifySearchTrackRow } from "@/components/spotify/spotify-search-types";

export const SpotifyTrackResultItem = memo(function SpotifyTrackResultItem({
  track,
  onPlay,
  playDisabled = false,
}: {
  track: SpotifySearchTrackRow;
  onPlay: () => void;
  playDisabled?: boolean;
}) {
  const artistLine =
    track.artists.length > 0
      ? track.artists.map((a) => a.name).join(", ")
      : "—";

  return (
    <li>
      <button
        type="button"
        disabled={playDisabled}
        aria-disabled={playDisabled}
        onClick={playDisabled ? undefined : onPlay}
        className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition duration-200 ${
          playDisabled
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-zinc-100/90 dark:hover:bg-zinc-800/80"
        }`}
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-200 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-700 dark:ring-white/10">
          {track.albumArtUrl ? (
            <Image
              src={track.albumArtUrl}
              alt=""
              fill
              className="object-cover transition duration-200 group-hover:scale-105"
              sizes="48px"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 className="h-5 w-5 text-zinc-400" />
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition duration-200 group-hover:bg-black/40">
            <Play
              className="h-6 w-6 text-white opacity-0 drop-shadow-md transition duration-200 group-hover:opacity-100"
              fill="currentColor"
              aria-hidden
            />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
            {track.name}
          </p>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {artistLine}
          </p>
        </div>
      </button>
    </li>
  );
});
