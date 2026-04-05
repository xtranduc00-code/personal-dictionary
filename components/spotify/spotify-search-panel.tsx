"use client";

import { Inbox, Search } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";
import { SpotifyErrorAlert } from "@/components/spotify/spotify-error-alert";
import { SpotifyPlaylistResultItem } from "@/components/spotify/spotify-playlist-result-item";
import { SpotifySearchBox } from "@/components/spotify/spotify-search-box";
import { SpotifySearchModeTabs } from "@/components/spotify/spotify-search-mode-tabs";
import type {
  SpotifySearchPlaylistRow,
  SpotifySearchTrackRow,
  SpotifySearchTypesMode,
} from "@/components/spotify/spotify-search-types";
import { SpotifyTrackResultItem } from "@/components/spotify/spotify-track-result-item";

type Translate = (key: TranslationKey) => string;

function SearchSkeletonRows() {
  return (
    <div className="space-y-2 px-1 py-2" aria-hidden>
      {["a", "b", "c", "d"].map((k) => (
        <div
          key={k}
          className="flex animate-pulse items-center gap-3 rounded-xl px-2 py-2"
        >
          <div className="h-12 w-12 shrink-0 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-[65%] max-w-[12rem] rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-3 w-[40%] max-w-[8rem] rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SpotifySearchPanel({
  t,
  searchQ,
  onSearchChange,
  searchTypesMode,
  onSearchTypesModeChange,
  searching,
  searchError,
  tracks,
  searchPlaylists,
  onPlayTrack,
  onPlayPlaylist,
  panelScrollClass,
}: {
  t: Translate;
  searchQ: string;
  onSearchChange: (v: string) => void;
  searchTypesMode: SpotifySearchTypesMode;
  onSearchTypesModeChange: (m: SpotifySearchTypesMode) => void;
  searching: boolean;
  searchError: string | null;
  tracks: SpotifySearchTrackRow[];
  searchPlaylists: SpotifySearchPlaylistRow[];
  onPlayTrack: (uri: string) => void;
  onPlayPlaylist: (uri: string) => void;
  panelScrollClass: string;
}) {
  const q = searchQ.trim();
  const hasQuery = q.length >= 2;
  const showResultsShell =
    hasQuery &&
    (((searchTypesMode === "all" || searchTypesMode === "track") &&
      tracks.length > 0) ||
      ((searchTypesMode === "all" || searchTypesMode === "playlist") &&
        searchPlaylists.length > 0));

  const showEmpty =
    hasQuery &&
    !searching &&
    !searchError &&
    (searchTypesMode === "all"
      ? tracks.length === 0 && searchPlaylists.length === 0
      : searchTypesMode === "track"
        ? tracks.length === 0
        : searchPlaylists.length === 0);

  return (
    <div
      className={`${panelScrollClass} bg-gradient-to-b from-white via-white to-zinc-50/80 px-4 pb-4 pt-4 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950/80`}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <SpotifySearchBox
          value={searchQ}
          onChange={onSearchChange}
          placeholderKey="spotifySearchPlaceholder"
          searching={searching}
          disabled={searching}
          t={t}
        />

        <SpotifySearchModeTabs
          value={searchTypesMode}
          onChange={onSearchTypesModeChange}
          disabled={searching}
          t={t}
          ariaLabelKey="spotifySearchTab"
        />

        {searchTypesMode === "playlist" ? (
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
            {t("spotifySearchPlaylistNotForSongs")}
          </div>
        ) : null}

        {searchError && hasQuery && !searching ? (
          <SpotifyErrorAlert message={searchError} />
        ) : null}

        {hasQuery && searching ? <SearchSkeletonRows /> : null}

        {!hasQuery ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/50 px-6 py-10 text-center dark:border-zinc-700/80 dark:bg-zinc-800/30">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:ring-white/10">
              <Search className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t("spotifySearchTypeHint")}
            </p>
          </div>
        ) : null}

        {showResultsShell ? (
          <div className="space-y-2">
            <p className="text-center text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              {t("spotifySearchPickToPlay")}
            </p>
          <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/80 dark:bg-zinc-900/50 dark:ring-white/[0.06]">
            <div className="max-h-[min(42vh,340px)] overflow-y-auto">
              {(searchTypesMode === "all" || searchTypesMode === "track") &&
              tracks.length > 0 ? (
                <div className="border-b border-zinc-100 dark:border-zinc-800">
                  <p className="sticky top-0 z-[1] border-b border-zinc-100/80 bg-white/95 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
                    {t("spotifySearchTracksHeading")}{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      ({tracks.length})
                    </span>
                  </p>
                  <ul className="divide-y divide-zinc-100/80 p-1 dark:divide-zinc-800/80">
                    {tracks.map((tr) => (
                      <SpotifyTrackResultItem
                        key={tr.uri}
                        track={tr}
                        onPlay={() => onPlayTrack(tr.uri)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {(searchTypesMode === "all" || searchTypesMode === "playlist") &&
              searchPlaylists.length > 0 ? (
                <div>
                  <p className="sticky top-0 z-[1] border-b border-zinc-100/80 bg-white/95 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
                    {t("spotifySearchResultsPlaylists")}{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      ({searchPlaylists.length})
                    </span>
                  </p>
                  <ul className="divide-y divide-zinc-100/80 p-1 dark:divide-zinc-800/80">
                    {searchPlaylists.map((pl) => (
                      <SpotifyPlaylistResultItem
                        key={pl.uri}
                        playlist={pl}
                        onPlay={() => onPlayPlaylist(pl.uri)}
                        t={t}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
          </div>
        ) : null}

        {showEmpty ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-6 py-10 text-center dark:border-zinc-700/80 dark:bg-zinc-800/40">
            <Inbox className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {t("spotifySearchEmptyTitle")}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {t("spotifySearchEmptySubtitle")}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
