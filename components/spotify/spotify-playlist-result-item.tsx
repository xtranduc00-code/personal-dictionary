"use client";

import { ListMusic, Play } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";
import type { SpotifySearchPlaylistRow } from "@/components/spotify/spotify-search-types";

type Translate = (key: TranslationKey) => string;

export function SpotifyPlaylistResultItem({
  playlist,
  onPlay,
  t,
}: {
  playlist: SpotifySearchPlaylistRow;
  onPlay: () => void;
  t: Translate;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPlay}
        className="group flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition duration-200 hover:bg-zinc-100/90 dark:hover:bg-zinc-800/80"
      >
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-200/90 to-zinc-100 ring-1 ring-zinc-300/70 dark:from-zinc-700 dark:to-zinc-800 dark:ring-zinc-600/60">
          <ListMusic className="h-5 w-5 text-zinc-700 dark:text-zinc-200" />
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition duration-200 group-hover:bg-black/35">
            <Play
              className="h-6 w-6 text-white opacity-0 drop-shadow-md transition duration-200 group-hover:opacity-100"
              fill="currentColor"
              aria-hidden
            />
          </span>
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
            {playlist.name}
          </p>
          {playlist.ownerDisplayName ? (
            <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
              {t("spotifySearchPlaylistBy").replace(
                "{owner}",
                playlist.ownerDisplayName,
              )}
            </p>
          ) : null}
        </div>
      </button>
    </li>
  );
}
