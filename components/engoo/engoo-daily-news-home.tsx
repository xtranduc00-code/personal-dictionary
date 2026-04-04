"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Flame, LayoutGrid, Search, Sparkles, Tag } from "lucide-react";
import {
  filterWomensFootballHeadlines,
  type FootballRssHeadline,
} from "@/lib/bbc-football-rss-shared";
import type { EngooListApiResponse, EngooListCard } from "@/lib/engoo-types";
import { engooLevelBadgeBackground } from "@/lib/engoo-level-style";
import {
  ENGOO_DAILY_NEWS_CATEGORIES,
  getEngooDailyNewsCategoryBySlug,
} from "@/lib/engoo-daily-news-categories";
import { formatRelativeDaysAgo } from "@/lib/format-relative-days-ago";
import { FOOTBALL_HIDE_WOMENS_STORAGE_KEY } from "@/lib/football-ui-constants";
import { parseResponseJson } from "@/lib/read-response-json";

const NEW_BADGE_MAX_MS = 3 * 24 * 60 * 60 * 1000;

/** Distinct category styling for pills + accent borders (light UI). */
function categoryVisual(category: string): {
  feedPill: string;
  overlayPill: string;
} {
  const c = category.toLowerCase();
  if (c.includes("business") || c.includes("politics")) {
    return {
      feedPill:
        "border-rose-200/90 bg-rose-50 text-rose-950 dark:border-rose-800/80 dark:bg-rose-950/50 dark:text-rose-100",
      overlayPill:
        "border-l-[3px] border-rose-500 bg-white/95 text-rose-950 shadow-sm dark:bg-zinc-900/95 dark:text-rose-100",
    };
  }
  if (c.includes("science") || c.includes("technology")) {
    return {
      feedPill:
        "border-sky-200/90 bg-sky-50 text-sky-950 dark:border-sky-800/80 dark:bg-sky-950/50 dark:text-sky-100",
      overlayPill:
        "border-l-[3px] border-sky-500 bg-white/95 text-sky-950 shadow-sm dark:bg-zinc-900/95 dark:text-sky-100",
    };
  }
  if (c.includes("health") || c.includes("lifestyle")) {
    return {
      feedPill:
        "border-emerald-200/90 bg-emerald-50 text-emerald-950 dark:border-emerald-800/80 dark:bg-emerald-950/50 dark:text-emerald-100",
      overlayPill:
        "border-l-[3px] border-emerald-500 bg-white/95 text-emerald-950 shadow-sm dark:bg-zinc-900/95 dark:text-emerald-100",
    };
  }
  if (c.includes("culture") || c.includes("society")) {
    return {
      feedPill:
        "border-violet-200/90 bg-violet-50 text-violet-950 dark:border-violet-800/80 dark:bg-violet-950/50 dark:text-violet-100",
      overlayPill:
        "border-l-[3px] border-violet-500 bg-white/95 text-violet-950 shadow-sm dark:bg-zinc-900/95 dark:text-violet-100",
    };
  }
  if (c.includes("travel") || c.includes("experiences")) {
    return {
      feedPill:
        "border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-100",
      overlayPill:
        "border-l-[3px] border-amber-500 bg-white/95 text-amber-950 shadow-sm dark:bg-zinc-900/95 dark:text-amber-100",
    };
  }
  if (c.includes("football")) {
    return {
      feedPill:
        "border-lime-200/90 bg-lime-50 text-lime-950 dark:border-lime-800/80 dark:bg-lime-950/50 dark:text-lime-100",
      overlayPill:
        "border-l-[3px] border-lime-600 bg-white/95 text-lime-950 shadow-sm dark:bg-zinc-900/95 dark:text-lime-100",
    };
  }
  return {
    feedPill:
      "border-zinc-200/90 bg-zinc-100/90 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-100",
    overlayPill:
      "border-l-[3px] border-zinc-500 bg-white/95 text-zinc-900 shadow-sm dark:bg-zinc-900/95 dark:text-zinc-100",
  };
}

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

function EngooCard({
  card,
  className,
  variant = "default",
  layout = "overlay",
  staggerIndex,
}: {
  card: EngooListCard;
  className?: string;
  variant?: "hero" | "default";
  layout?: "overlay" | "feed";
  /** Staggered entrance; omit to skip animation. */
  staggerIndex?: number;
}) {
  const thumb = card.thumbnailUrl || "/pwa/icon-512.png";
  const levelNum = card.level;
  const showLevelBadge = typeof levelNum === "number";
  const levelBg = showLevelBadge
    ? engooLevelBadgeBackground(levelNum)
    : "";
  const showNewBadge = useMemo(() => {
    const t = Date.parse(card.firstPublishedAt);
    if (Number.isNaN(t)) return false;
    return Date.now() - t < NEW_BADGE_MAX_MS;
  }, [card.firstPublishedAt]);

  const cat = categoryVisual(card.category);

  const staggerStyle =
    staggerIndex !== undefined
      ? ({
          animationDelay: `${Math.min(staggerIndex, 16) * 40}ms`,
        } as CSSProperties)
      : undefined;
  const staggerClass =
    staggerIndex !== undefined ? "engoo-news-card-enter" : "";

  if (layout === "feed") {
    const ago = formatRelativeDaysAgo(card.firstPublishedAt);
    return (
      <Link
        href={`/news/${encodeURIComponent(card.masterId)}`}
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
            className="object-cover transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
            sizes="(max-width:768px) 100vw, 33vw"
            unoptimized={thumb.startsWith("http")}
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
          <h3 className="line-clamp-2 text-left text-lg font-extrabold leading-[1.35] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[1.125rem]">
            {card.title}
          </h3>
          {ago ? (
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
              {ago}
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
            {showLevelBadge ? (
              <div
                className="inline-flex max-w-full items-stretch overflow-hidden rounded text-[11px] font-semibold leading-none shadow-sm"
                title={`Level ${levelNum} · ${card.levelLabel}`}
              >
                <span
                  className="flex min-w-[1.625rem] items-center justify-center px-1.5 py-1.5 text-white"
                  style={{ backgroundColor: levelBg }}
                >
                  {levelNum}
                </span>
                <span
                  className="flex min-w-0 max-w-[7.5rem] items-center truncate border-l-[3px] bg-zinc-100 px-2 py-1.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 sm:max-w-[9rem]"
                  style={{ borderLeftColor: levelBg }}
                >
                  {card.levelLabel}
                </span>
              </div>
            ) : (
              <span />
            )}
            <span
              className={`max-w-[min(100%,12rem)] truncate rounded-full border px-2.5 py-0.5 text-left text-[11px] font-semibold ${cat.feedPill}`}
            >
              {card.category}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  const overlaySizes =
    variant === "hero"
      ? "(max-width:768px) 100vw, min(1152px, 96vw)"
      : "(max-width:768px) 100vw, 50vw";

  return (
    <Link
      href={`/news/${encodeURIComponent(card.masterId)}`}
      style={staggerStyle}
      className={`group relative block overflow-hidden rounded-2xl border-0 shadow-[0_12px_40px_-10px_rgba(15,23,42,0.2)] ring-1 ring-black/[0.06] transition duration-300 ease-out hover:z-10 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_28px_55px_-12px_rgba(15,23,42,0.28)] hover:ring-rose-200/35 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 focus-visible:ring-offset-2 dark:shadow-[0_16px_50px_-8px_rgba(0,0,0,0.55)] dark:ring-white/10 dark:hover:ring-rose-900/35 ${staggerClass} ${className ?? ""}`}
    >
      <div className="absolute inset-0">
        <Image
          src={thumb}
          alt=""
          fill
          className="object-cover transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
          sizes={overlaySizes}
          unoptimized={thumb.startsWith("http")}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/20 transition duration-300 group-hover:from-black/95 group-hover:via-black/55"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(700px circle at 30% 20%, rgba(255,255,255,0.12), transparent 50%)",
          }}
          aria-hidden
        />
      </div>
      <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-stretch gap-2">
        {showNewBadge ? (
          <span className="shrink-0 shadow-md">
            <NewStoryBadge />
          </span>
        ) : null}
        {showLevelBadge ? (
          <span
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-white shadow-md ring-1 ring-black/20"
            style={{ backgroundColor: levelBg }}
            title={`Level ${levelNum} · ${card.levelLabel}`}
          >
            <span className="shrink-0 text-sm font-extrabold tabular-nums leading-none">
              {levelNum}
            </span>
            <span className="truncate text-[10px] font-semibold leading-tight sm:text-[11px]">
              {card.levelLabel}
            </span>
          </span>
        ) : null}
      </div>
      <div className="relative flex h-full min-h-[140px] flex-col justify-end p-5 md:min-h-0 md:p-6">
        <h3
          className={
            variant === "hero"
              ? "text-left text-2xl font-extrabold leading-[1.2] tracking-tight text-white drop-shadow-lg sm:text-3xl md:text-4xl"
              : "text-left text-lg font-extrabold leading-snug text-white drop-shadow md:text-xl"
          }
        >
          {card.title}
        </h3>
        {variant === "hero" ? (
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
            {formatRelativeDaysAgo(card.firstPublishedAt)}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-end justify-start gap-2">
          <span
            className={`max-w-full truncate rounded-r-full rounded-tl-full px-3 py-1 text-xs font-semibold ${cat.overlayPill}`}
          >
            {card.category}
          </span>
        </div>
      </div>
    </Link>
  );
}

function HomeSkeleton({
  layout = "category",
}: {
  layout?: "category" | "featured";
}) {
  const feedCard = (key: string | number) => (
    <div
      key={key}
      className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="aspect-[16/10] bg-zinc-200/90 dark:bg-zinc-800/80" />
      <div className="space-y-2 p-4">
        <div className="h-5 w-full rounded bg-zinc-200/90 dark:bg-zinc-800/80" />
        <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800/50" />
        <div className="mt-3 flex justify-between gap-2">
          <div className="h-7 w-24 rounded bg-zinc-200/90 dark:bg-zinc-800/80" />
          <div className="h-6 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800/50" />
        </div>
      </div>
    </div>
  );

  if (layout === "featured") {
    return (
      <div className="animate-pulse space-y-8">
        <div>
          <div className="mb-3 h-3 w-28 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="min-h-[300px] rounded-2xl bg-zinc-200/90 dark:bg-zinc-800/80 md:min-h-[340px]" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="min-h-[220px] rounded-2xl bg-zinc-200/90 dark:bg-zinc-800/80" />
          <div className="min-h-[220px] rounded-2xl bg-zinc-200/90 dark:bg-zinc-800/80" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => feedCard(i))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => feedCard(i))}
    </div>
  );
}

function FootballHeadlinesLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="h-8 w-44 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 w-52 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <div className="aspect-[16/10] bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-2 p-4">
            <div className="h-5 w-[85%] rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800/80" />
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <div className="aspect-[16/10] bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-2 p-4">
            <div className="h-5 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-800/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

const FootballHeadlinesGrid = dynamic(
  () => import("@/components/engoo/football-headlines-section"),
  { loading: () => <FootballHeadlinesLoading />, ssr: true },
);

function listQuery(
  categorySlug: string,
  opts: { cursor?: string | null; pageSize?: number } = {},
) {
  const defaultPs = categorySlug === "all" ? 18 : 9;
  const ps = opts.pageSize ?? defaultPs;
  const base = `/api/engoo/list?minLevel=1&maxLevel=10&page_size=${ps}&category=${encodeURIComponent(categorySlug)}`;
  if (opts.cursor)
    return `${base}&cursor=${encodeURIComponent(opts.cursor)}`;
  return base;
}

function EngooDailyNewsHomeInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = useMemo(
    () => getEngooDailyNewsCategoryBySlug(searchParams.get("category")),
    [searchParams],
  );
  const isAllTab = activeCategory.slug === "all";
  const isFootballTab = activeCategory.slug === "football";

  const [items, setItems] = useState<EngooListCard[]>([]);
  const [footballItems, setFootballItems] = useState<FootballRssHeadline[]>([]);
  const [hideWomensFootball, setHideWomensFootball] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    try {
      const v = localStorage.getItem(FOOTBALL_HIDE_WOMENS_STORAGE_KEY);
      if (v === "false") setHideWomensFootball(false);
    } catch {
      /* ignore */
    }
  }, []);

  const setHideWomensFootballPersist = useCallback((hide: boolean) => {
    setHideWomensFootball(hide);
    try {
      localStorage.setItem(
        FOOTBALL_HIDE_WOMENS_STORAGE_KEY,
        hide ? "true" : "false",
      );
    } catch {
      /* ignore */
    }
  }, []);

  const setCategorySlug = useCallback(
    (slug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (slug === "all") params.delete("category");
      else params.set("category", slug);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const resetAndLoad = useCallback(async () => {
    setError(null);
    setListLoading(true);
    setItems([]);
    setFootballItems([]);
    setNextCursor(null);
    try {
      if (activeCategory.slug === "football") {
        const res = await fetch("/api/football-rss");
        const parsed = await parseResponseJson<{
          items?: FootballRssHeadline[];
        }>(res);
        if (!parsed.ok) {
          setError(parsed.message);
          return;
        }
        setFootballItems(parsed.data.items ?? []);
        return;
      }
      const res = await fetch(listQuery(activeCategory.slug));
      const parsed = await parseResponseJson<EngooListApiResponse>(res);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      setItems(parsed.data.items ?? []);
      setNextCursor(parsed.data.nextCursor ?? null);
    } catch {
      setError("Network error");
    } finally {
      setListLoading(false);
    }
  }, [activeCategory.slug]);

  useEffect(() => {
    void resetAndLoad();
  }, [resetAndLoad]);

  const loadMore = useCallback(async () => {
    if (isFootballTab || !nextCursor || loadingMore || listLoading) return;
    setLoadingMore(true);
    setError(null);
    try {
      const morePageSize = activeCategory.slug === "all" ? 18 : 9;
      const res = await fetch(
        listQuery(activeCategory.slug, {
          cursor: nextCursor,
          pageSize: morePageSize,
        }),
      );
      const parsed = await parseResponseJson<EngooListApiResponse>(res);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      const more = parsed.data.items ?? [];
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.masterId));
        const merged = [...prev];
        for (const c of more) {
          if (!seen.has(c.masterId)) {
            seen.add(c.masterId);
            merged.push(c);
          }
        }
        return merged;
      });
      setNextCursor(parsed.data.nextCursor ?? null);
    } catch {
      setError("Network error");
    } finally {
      setLoadingMore(false);
    }
  }, [
    activeCategory.slug,
    nextCursor,
    loadingMore,
    listLoading,
    isFootballTab,
  ]);

  const visibleFootballItems = useMemo(
    () => filterWomensFootballHeadlines(footballItems, hideWomensFootball),
    [footballItems, hideWomensFootball],
  );

  const filteredForSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (isFootballTab) {
      if (!q) return visibleFootballItems;
      return visibleFootballItems.filter((c) =>
        c.title.toLowerCase().includes(q),
      );
    }
    if (!q) return items;
    return items.filter((c) => c.title.toLowerCase().includes(q));
  }, [items, visibleFootballItems, searchQuery, isFootballTab]);

  const { featured, spotlights, gridItems } = useMemo(() => {
    const list = filteredForSearch as EngooListCard[];
    const useFeatured =
      !isFootballTab && isAllTab && !searchQuery.trim() && list.length > 0;
    if (!useFeatured) {
      return {
        featured: null as EngooListCard | null,
        spotlights: [] as EngooListCard[],
        gridItems: list,
      };
    }
    return {
      featured: list[0] ?? null,
      spotlights: list.slice(1, 3),
      gridItems: list.length > 3 ? list.slice(3) : [],
    };
  }, [filteredForSearch, isAllTab, searchQuery, isFootballTab]);

  const emptyAfterLoad = !listLoading &&
    !error &&
    (isFootballTab ? footballItems.length === 0 : items.length === 0);
  const listHadDataButNoneVisible =
    !listLoading &&
    filteredForSearch.length === 0 &&
    (isFootballTab ? footballItems.length > 0 : items.length > 0);
  const emptySearch = !isFootballTab && listHadDataButNoneVisible;

  return (
    <div className="min-h-screen w-full bg-[#F6F7F9] pb-12 font-sans text-[#111827] dark:bg-zinc-950 dark:text-zinc-100">
      <header className="mx-auto mb-3 max-w-6xl overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-md shadow-zinc-200/40 ring-1 ring-black/[0.03] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none dark:ring-white/[0.04]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-5">
          <div className="border-l-4 border-l-rose-600 pl-3 dark:border-l-rose-500">
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
              Daily News
            </h1>
          </div>
          <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5 shadow-inner shadow-zinc-200/20 sm:w-auto dark:border-zinc-600 dark:bg-zinc-950/50 dark:shadow-none">
            <Search
              className="h-4 w-4 shrink-0 text-rose-500/80 dark:text-rose-400/70"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search titles…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:ring-0 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </label>
        </div>
        <nav
          className="flex gap-0.5 overflow-x-auto border-t border-zinc-100/90 bg-zinc-50/40 px-2 pb-1.5 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-zinc-800 dark:bg-zinc-950/30 sm:gap-1 sm:px-4 [&::-webkit-scrollbar]:hidden"
          aria-label="Categories"
        >
          {ENGOO_DAILY_NEWS_CATEGORIES.map((c) => {
            const active = activeCategory.slug === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setCategorySlug(c.slug)}
                className={`group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-200 sm:px-4 ${
                  active
                    ? "engoo-news-tab-active font-bold text-rose-800 dark:text-rose-200"
                    : "font-medium text-zinc-500 hover:bg-white/80 hover:text-rose-700 dark:text-zinc-400 dark:hover:bg-zinc-800/90 dark:hover:text-rose-300/90"
                }`}
              >
                {c.slug === "all" ? (
                  <LayoutGrid
                    className={`h-3.5 w-3.5 shrink-0 transition-colors ${active ? "text-rose-600 dark:text-rose-400" : "opacity-55 group-hover:opacity-80"}`}
                    aria-hidden
                  />
                ) : null}
                {c.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div
        className="mx-auto mb-2 h-px max-w-6xl bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-zinc-700"
        aria-hidden
      />

      <main className="mx-auto mt-8 max-w-6xl px-1 sm:mt-10 sm:px-0">
        {error ? (
          <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {listLoading ? (
          <HomeSkeleton
            layout={isAllTab && !isFootballTab ? "featured" : "category"}
          />
        ) : emptyAfterLoad ? (
          <p className="py-20 text-center text-zinc-500 dark:text-zinc-400">
            No articles in this category.
          </p>
        ) : emptySearch ? (
          <p className="py-20 text-center text-zinc-500 dark:text-zinc-400">
            No articles match your search.
          </p>
        ) : isFootballTab ? (
          <FootballHeadlinesGrid
            items={filteredForSearch as FootballRssHeadline[]}
            sectionTitle={activeCategory.label}
            hideWomensFootball={hideWomensFootball}
            onHideWomensFootballChange={setHideWomensFootballPersist}
            showWomensFilterToggle={footballItems.length > 0}
            searchActive={searchQuery.trim().length > 0}
            listReturnHref={
              pathname === "/"
                ? "/?category=football"
                : `${pathname}?category=football`
            }
          />
        ) : (
          <>
            {featured ? (
              <section className="mb-10 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles
                    className="h-4 w-4 text-rose-600 dark:text-rose-400"
                    aria-hidden
                  />
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-800 dark:text-rose-300">
                    Editor&apos;s pick
                  </span>
                  <span className="rounded-full bg-rose-100/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                    Hero
                  </span>
                </div>
                <div className="rounded-[1.35rem] bg-gradient-to-br from-rose-100/50 via-white to-amber-50/40 p-[3px] shadow-[0_20px_60px_-20px_rgba(225,29,72,0.25)] dark:from-rose-950/40 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-none">
                  <EngooCard
                    card={featured}
                    variant="hero"
                    layout="overlay"
                    staggerIndex={0}
                    className="min-h-[320px] w-full rounded-[1.2rem] ring-2 ring-white/80 dark:ring-zinc-800 md:min-h-[400px]"
                  />
                </div>
              </section>
            ) : null}

            {spotlights.length > 0 ? (
              <section className="mb-12 space-y-4">
                <div className="flex items-center gap-2">
                  <Flame
                    className="h-4 w-4 text-orange-500 dark:text-orange-400"
                    aria-hidden
                  />
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-800 dark:text-orange-300">
                    Trending now
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                  {spotlights.map((c, i) => (
                    <EngooCard
                      key={c.masterId}
                      card={c}
                      layout="overlay"
                      staggerIndex={1 + i}
                      className="min-h-[220px] md:min-h-[260px]"
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {gridItems.length > 0 ? (
              <section className="space-y-6">
                {!isAllTab ? (
                  <h2 className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-2xl">
                    <Tag
                      className="h-5 w-5 shrink-0 text-rose-500/80 dark:text-rose-400/80"
                      aria-hidden
                    />
                    {activeCategory.label}
                  </h2>
                ) : null}
                {isAllTab &&
                !searchQuery.trim() &&
                (featured || spotlights.length > 0) ? (
                  <div className="flex items-center gap-4 pt-1">
                    <span className="shrink-0 text-sm font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
                      More stories
                    </span>
                    <span
                      className="h-px flex-1 bg-gradient-to-r from-rose-300/80 via-zinc-200 to-transparent dark:from-rose-800/60 dark:via-zinc-600"
                      aria-hidden
                    />
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {gridItems.map((c, i) => (
                    <div
                      key={c.masterId}
                      className={
                        i === 0
                          ? "sm:col-span-2 lg:col-span-2"
                          : undefined
                      }
                    >
                      <EngooCard
                        card={c}
                        layout="feed"
                        staggerIndex={
                          featured || spotlights.length > 0
                            ? 3 + i
                            : i
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {nextCursor ? (
              <div className="mt-14 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full border border-rose-200/90 bg-white px-8 py-2.5 text-sm font-semibold text-rose-950 shadow-sm transition hover:bg-rose-50 hover:shadow-md disabled:opacity-50 dark:border-rose-900/50 dark:bg-zinc-900 dark:text-rose-100 dark:hover:bg-rose-950/40"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export function EngooDailyNewsHome() {
  return (
    <Suspense fallback={<HomeSkeleton layout="featured" />}>
      <EngooDailyNewsHomeInner />
    </Suspense>
  );
}
