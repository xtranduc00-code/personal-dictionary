"use client";

import type { TranslationKey } from "@/lib/i18n";
import type { SpotifySearchTypesMode } from "@/components/spotify/spotify-search-types";

type Translate = (key: TranslationKey) => string;

const MODES = [
  ["all", "spotifySearchModeAll"],
  ["track", "spotifySearchModeTracks"],
  ["playlist", "spotifySearchModePlaylists"],
] as const satisfies readonly [SpotifySearchTypesMode, TranslationKey][];

export function SpotifySearchModeTabs({
  value,
  onChange,
  disabled,
  t,
  ariaLabelKey,
}: {
  value: SpotifySearchTypesMode;
  onChange: (m: SpotifySearchTypesMode) => void;
  disabled?: boolean;
  t: Translate;
  ariaLabelKey: TranslationKey;
}) {
  return (
    <div
      className="flex rounded-full border border-zinc-200/80 bg-zinc-100/90 p-1 dark:border-zinc-600/80 dark:bg-zinc-800/90"
      role="tablist"
      aria-label={t(ariaLabelKey)}
    >
      {MODES.map(([mode, labelKey]) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={`relative flex-1 rounded-full px-2 py-2 text-center text-xs font-semibold transition duration-200 disabled:opacity-50 ${
              active
                ? "bg-white text-zinc-900 shadow-md shadow-zinc-900/5 ring-1 ring-zinc-900/5 dark:bg-zinc-700 dark:text-white dark:ring-white/10"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {active ? (
              <span
                className="absolute inset-x-2 bottom-0.5 mx-auto h-0.5 max-w-[2rem] rounded-full bg-zinc-900 dark:bg-zinc-100"
                aria-hidden
              />
            ) : null}
            <span className="relative">{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
