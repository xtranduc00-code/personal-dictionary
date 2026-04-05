"use client";

import { Check, Lock, Music2 } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

const BENEFIT_KEYS = [
  "spotifyConnectBenefit1",
  "spotifyConnectBenefit2",
  "spotifyConnectBenefit3",
] as const satisfies readonly TranslationKey[];

type Translate = (key: TranslationKey) => string;

/** Visual language aligned with Ken Workspace: zinc surfaces, zinc-900 accents (same as sidebar). */
export function SpotifyConnectCard({
  onConnect,
  t,
}: {
  onConnect: () => void;
  t: Translate;
}) {
  return (
    <div
      className={[
        "relative w-full max-w-[440px] overflow-hidden rounded-2xl",
        "border border-zinc-200/90 bg-white",
        "shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_-8px_rgba(15,23,42,0.08)]",
        "dark:border-zinc-700/90 dark:bg-zinc-900",
        "dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_12px_40px_-12px_rgba(0,0,0,0.35)]",
      ].join(" ")}
    >
      <div className="relative px-6 pb-8 pt-8 md:px-9 md:pb-9 md:pt-9">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
          {t("spotifyConnectCardEyebrow")}
        </p>

        <div className="mt-6 flex justify-center">
          <div
            className={[
              "relative flex h-16 w-16 items-center justify-center rounded-xl",
              "border border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80",
            ].join(" ")}
            aria-hidden
          >
            <Music2
              className="h-8 w-8 text-zinc-900 dark:text-zinc-100"
              strokeWidth={2}
            />
            <span
              className="absolute bottom-1.5 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-zinc-900 dark:bg-zinc-100"
              aria-hidden
            />
          </div>
        </div>

        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-[#111827] dark:text-white md:text-[2rem] md:leading-tight">
          {t("spotifyConnectCardTitle")}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-center text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {t("spotifyConnectCardSubtitle")}
        </p>

        <ul className="mt-6 space-y-2.5 md:mt-7 md:space-y-3">
          {BENEFIT_KEYS.map((key) => (
            <li
              key={key}
              className="flex gap-3 text-left text-sm leading-snug text-zinc-600 dark:text-zinc-300"
            >
              <span
                className={[
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
                ].join(" ")}
                aria-hidden
              >
                <Check className="h-3 w-3 stroke-[3]" />
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onConnect}
          className={[
            "group mt-7 flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-3 md:mt-8",
            "text-base font-semibold text-white",
            "bg-zinc-900 shadow-sm transition duration-200",
            "hover:bg-zinc-800 hover:shadow-md",
            "active:scale-[0.99] active:bg-zinc-900",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F7F9] dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          <Music2
            className="h-5 w-5 text-white transition group-hover:scale-105"
            aria-hidden
          />
          {t("spotifyConnect")}
        </button>

        <p className="mt-4 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
          <Lock
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600"
            aria-hidden
          />
          <span className="max-w-[280px]">{t("spotifyConnectSecureNote")}</span>
        </p>
      </div>
    </div>
  );
}
