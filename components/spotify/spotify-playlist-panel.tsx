"use client";

import { ListMusic, Loader2 } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";
import { SpotifyErrorAlert } from "@/components/spotify/spotify-error-alert";
import type { SpotifySearchTrackRow } from "@/components/spotify/spotify-search-types";
import { SpotifyTrackResultItem } from "@/components/spotify/spotify-track-result-item";

type Translate = (key: TranslationKey) => string;

export type SpotifyPlaylistRowLite = { id: string; name: string; uri: string };

export function SpotifyPlaylistPanel({
  t,
  playlists,
  playlistsLoading,
  playlistsLoadFailed,
  selectedPlaylistId,
  selectedPlaylistName,
  onSelectPlaylist,
  playlistTracks,
  playlistTracksLoading,
  playlistTracksError,
  /** True while tracks are loading or the track list failed — play buttons stay off. */
  tracksPlayDisabled,
  onPlayTrack,
  maxHeightClass,
}: {
  t: Translate;
  playlists: SpotifyPlaylistRowLite[];
  playlistsLoading: boolean;
  playlistsLoadFailed: boolean;
  selectedPlaylistId: string | null;
  selectedPlaylistName: string | null;
  onSelectPlaylist: (pl: SpotifyPlaylistRowLite) => void;
  playlistTracks: SpotifySearchTrackRow[];
  playlistTracksLoading: boolean;
  playlistTracksError: string | null;
  tracksPlayDisabled: boolean;
  onPlayTrack: (uri: string) => void;
  maxHeightClass: string;
}) {
  return (
    <div
      className={`flex flex-col ${maxHeightClass} overflow-hidden bg-gradient-to-b from-white via-white to-zinc-50/80 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950/80`}
    >
      <div className="grid min-h-[280px] flex-1 grid-cols-1 divide-y divide-zinc-200/90 md:min-h-0 md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-zinc-700/90">
        <div className="flex max-h-[42vh] min-h-0 flex-col md:max-h-none">
          <div className="shrink-0 border-b border-zinc-100/90 px-4 py-3 dark:border-zinc-800/90">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("spotifyPlaylistLibraryHeading")}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
            {playlistsLoading ? (
              <div className="flex justify-center py-14 text-zinc-400">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500 dark:text-zinc-400" />
              </div>
            ) : playlistsLoadFailed ? (
              <SpotifyErrorAlert message={t("spotifyPlaylistsLoadFailed")} />
            ) : playlists.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/50 px-4 py-10 text-center dark:border-zinc-700/80 dark:bg-zinc-800/30">
                <ListMusic
                  className="h-8 w-8 text-zinc-400"
                  aria-hidden
                />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t("spotifyPlaylistsEmpty")}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {playlists.map((pl) => {
                  const sel = selectedPlaylistId === pl.id;
                  return (
                    <li key={pl.id}>
                      <button
                        type="button"
                        onClick={() => onSelectPlaylist(pl)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition duration-200 ${
                          sel
                            ? "border-zinc-300/90 bg-white shadow-sm ring-1 ring-zinc-900/5 dark:border-zinc-600 dark:bg-zinc-800/90 dark:ring-white/10"
                            : "border-transparent hover:border-zinc-200/80 hover:bg-white/80 hover:shadow-sm dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-200/90 to-zinc-100 dark:from-zinc-700 dark:to-zinc-800 ${
                            sel ? "ring-1 ring-zinc-400/30 dark:ring-zinc-500/40" : ""
                          }`}
                        >
                          <ListMusic
                            className="h-5 w-5 text-zinc-700 dark:text-zinc-200"
                            aria-hidden
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {pl.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-[min(40vh,320px)] min-h-0 flex-col md:min-h-0">
          <div className="shrink-0 border-b border-zinc-100/90 px-4 py-3 dark:border-zinc-800/90">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("spotifyPlaylistTracksHeading")}
            </p>
            {selectedPlaylistName ? (
              <p className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {selectedPlaylistName}
              </p>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
            {!selectedPlaylistId ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
                <ListMusic
                  className="h-10 w-10 text-zinc-300 dark:text-zinc-600"
                  aria-hidden
                />
                <p className="max-w-[220px] text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {t("spotifyPlaylistSelectHint")}
                </p>
              </div>
            ) : playlistTracksLoading ? (
              <div className="flex justify-center py-14 text-zinc-400">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500 dark:text-zinc-400" />
              </div>
            ) : playlistTracksError ? (
              <div className="px-2 pt-2">
                <SpotifyErrorAlert message={playlistTracksError} />
              </div>
            ) : playlistTracks.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                {t("spotifyPlaylistTracksEmpty")}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {playlistTracks.map((tr) => (
                  <SpotifyTrackResultItem
                    key={tr.uri}
                    track={tr}
                    playDisabled={tracksPlayDisabled}
                    onPlay={() => onPlayTrack(tr.uri)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
