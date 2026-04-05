"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useMemo, type CSSProperties } from "react";
import { Flame, Tag } from "lucide-react";
import type { FootballRssHeadline } from "@/lib/bbc-football-rss-shared";
import { formatRelativeDaysAgo } from "@/lib/format-relative-days-ago";

const NEW_BADGE_MAX_MS = 3 * 24 * 60 * 60 * 1000;

const FOOTBALL_FEED_PILL =
  "border-lime-200/90 bg-lime-50 text-lime-950 dark:border-lime-800/80 dark:bg-lime-950/50 dark:text-lime-100";

function NewStoryBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md bg-gradient-to-r from-rose-600 via-orange-500 to-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[0_0_22px_rgba(244,63,94,0.4)] ring-2 ring-white/30 dark:ring-white/20 ${className}`}
    >
      <Flame className="h-3 w-3 shrink-0 opacity-95" aria-hidden />
      New
    </span>
  );
}

const FootballRssFeedCard = memo(function FootballRssFeedCard({
  item,
  readHref,
  staggerIndex,
  className,
  variant = "feed",
}: {
  item: FootballRssHeadline;
  readHref: string;
  staggerIndex?: number;
  className?: string;
  variant?: "feed" | "featured";
}) {
  const thumb = item.thumbnailUrl || "/pwa/icon-512.png";
  const showNewBadge = useMemo(() => {
    const t = Date.parse(item.publishedAt);
    if (Number.isNaN(t)) return false;
    return Date.now() - t < NEW_BADGE_MAX_MS;
  }, [item.publishedAt]);
  const ago = item.publishedAt
    ? formatRelativeDaysAgo(item.publishedAt)
    : "";
  const staggerStyle =
    staggerIndex !== undefined
      ? ({
          animationDelay: `${Math.min(staggerIndex, 16) * 40}ms`,
        } as CSSProperties)
      : undefined;
  const staggerClass =
    staggerIndex !== undefined ? "engoo-news-card-enter" : "";

  const titleClass =
    variant === "featured"
      ? "line-clamp-3 text-left text-lg font-extrabold leading-[1.35] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl md:text-[1.35rem]"
      : "line-clamp-2 text-left text-lg font-extrabold leading-[1.35] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[1.125rem]";

  const ichefOptimized = thumb.includes("ichef.bbci.co.uk");

  return (
    <Link
      href={readHref}
      prefetch={false}
      style={staggerStyle}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.14)] ring-1 ring-zinc-900/[0.04] transition duration-300 ease-out hover:z-[1] hover:-translate-y-1 hover:shadow-[0_22px_50px_-12px_rgba(15,23,42,0.22)] hover:ring-rose-200/25 active:translate-y-0 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 focus-visible:ring-offset-2 dark:bg-zinc-900 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)] dark:ring-white/[0.06] dark:hover:ring-rose-900/40 ${staggerClass} ${className ?? ""}`}
    >
      <span
        className="pointer-events-none absolute inset-0 z-[1] rounded-2xl opacity-0 transition duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.14), transparent 45%)",
        }}
        aria-hidden
      />
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <Image
          src={thumb}
          alt=""
          fill
          sizes={
            variant === "featured"
              ? "(max-width:1023px) 100vw, 58vw"
              : "(max-width:1023px) 100vw, 30vw"
          }
          className="object-cover transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
          unoptimized={!ichefOptimized}
          priority={variant === "featured" && staggerIndex === 0}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/[0.08] via-transparent to-black/[0.04]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/5 to-transparent opacity-0 transition duration-300 group-hover:opacity-100"
          aria-hidden
        />
        {showNewBadge ? (
          <span className="absolute left-2 top-2 z-[2]">
            <NewStoryBadge />
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3.5 sm:p-4">
        <h3 className={titleClass}>{item.title}</h3>
        {ago ? (
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
            {ago}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          <span />
          <span
            className={`max-w-[min(100%,12rem)] truncate rounded-full border px-2.5 py-0.5 text-left text-[11px] font-semibold ${FOOTBALL_FEED_PILL}`}
          >
            Football
          </span>
        </div>
      </div>
    </Link>
  );
});

function footballReadHref(item: FootballRssHeadline, listReturnHref: string) {
  return `/news/football/read?url=${encodeURIComponent(item.link)}&returnTo=${encodeURIComponent(listReturnHref)}`;
}

function FootballHeadlinesGrid({
  items,
  listReturnHref,
  sectionTitle,
  hideWomensFootball,
  onHideWomensFootballChange,
  showWomensFilterToggle,
  searchActive,
}: {
  items: FootballRssHeadline[];
  listReturnHref: string;
  sectionTitle: string;
  hideWomensFootball: boolean;
  onHideWomensFootballChange: (hide: boolean) => void;
  showWomensFilterToggle: boolean;
  searchActive: boolean;
}) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-2xl">
          <Tag
            className="h-5 w-5 shrink-0 text-rose-500/80 dark:text-rose-400/80"
            aria-hidden
          />
          {sectionTitle}
        </h2>
        {showWomensFilterToggle ? (
          <label className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl border border-zinc-200/90 bg-white/90 px-3 py-2 text-sm text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-zinc-300 text-rose-600 focus:ring-rose-500 dark:border-zinc-600"
              checked={hideWomensFootball}
              onChange={(e) => onHideWomensFootballChange(e.target.checked)}
            />
            <span>Hide women&apos;s football</span>
          </label>
        ) : null}
      </div>

      {items.length === 0 && showWomensFilterToggle ? (
        <p className="py-14 text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {searchActive
            ? "No articles match your search."
            : hideWomensFootball
              ? 'Nothing to show with the current filter. Uncheck "Hide women\'s football" to see the full BBC feed.'
              : "No headlines to display."}
        </p>
      ) : null}

      {items.length === 0 ? null : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div key={`${item.link}::${i}`} className="min-w-0">
              <FootballRssFeedCard
                item={item}
                readHref={footballReadHref(item, listReturnHref)}
                staggerIndex={i}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default FootballHeadlinesGrid;
