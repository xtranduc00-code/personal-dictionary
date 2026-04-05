"use client";

import { Loader2, Search, X } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

type Translate = (key: TranslationKey) => string;

export function SpotifySearchBox({
  value,
  onChange,
  placeholderKey,
  disabled,
  searching,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholderKey: TranslationKey;
  disabled?: boolean;
  searching: boolean;
  t: Translate;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(placeholderKey)}
        disabled={disabled}
        autoComplete="off"
        className="h-12 w-full rounded-xl border border-zinc-200/90 bg-white py-2.5 pl-11 pr-24 text-[15px] text-zinc-900 shadow-sm outline-none transition duration-200 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-60 dark:border-zinc-600/90 dark:bg-zinc-800/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-white/10"
      />
      <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {searching ? (
          <span className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-700/80">
            <Loader2
              className="h-4 w-4 animate-spin text-zinc-600 dark:text-zinc-400"
              aria-hidden
            />
          </span>
        ) : value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
