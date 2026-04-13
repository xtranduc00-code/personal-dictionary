"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookDown,
  Flame,
  LayoutGrid,
  Loader2,
  Newspaper,
  Search,
  Tag,
} from "lucide-react";
import type { EngooListApiResponse, EngooListCard } from "@/lib/engoo-types";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import { engooLevelBadgeBackground } from "@/lib/engoo-level-style";
import {
  ENGOO_DAILY_NEWS_CATEGORIES,
  ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL,
  getEngooDailyNewsCategoryBySlug,
} from "@/lib/engoo-daily-news-categories";
import { formatRelativeDaysAgo } from "@/lib/format-relative-days-ago";
import { parseResponseJson } from "@/lib/read-response-json";
import { useI18n } from "@/components/i18n-provider";
import { Pagination } from "@/components/pagination";
import {
  buildGuardianListEpubBlob,
  fetchGuardianArticlesForKindleEpub,
  GUARDIAN_KINDLE_EPUB_MAX_ARTICLES,
  triggerEpubDownload,
} from "@/lib/guardian-kindle-epub";

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
        "border-zinc-200/90 bg-zinc-50 text-zinc-950 dark:border-zinc-800/80 dark:bg-zinc-950/50 dark:text-zinc-100",
      overlayPill:
        "border-l-[3px] border-zinc-500 bg-white/95 text-zinc-950 shadow-sm dark:bg-zinc-900/95 dark:text-zinc-100",
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
      <div className="absolute inset-0 z-[5] flex min-h-[140px] flex-col justify-end p-5 md:p-6">
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
        <div className="mt-3 flex flex-wrap items-end justify-start gap-2 md:mt-4">
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

export function HomeSkeleton({
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
          <div className="mb-3 h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
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

function listQuery(
  categorySlug: string,
  opts: { cursor?: string | null; pageSize?: number } = {},
) {
  const defaultPs = 30;
  const ps = opts.pageSize ?? defaultPs;
  const base = `/api/engoo/list?minLevel=1&maxLevel=10&page_size=${ps}&category=${encodeURIComponent(categorySlug)}`;
  if (opts.cursor)
    return `${base}&cursor=${encodeURIComponent(opts.cursor)}`;
  return base;
}

const GUARDIAN_SPORT_PILL =
  "border-rose-200/90 bg-rose-50 text-rose-950 dark:border-rose-800/80 dark:bg-rose-950/50 dark:text-rose-100";

function GuardianSportCard({
  item,
  returnTo,
}: {
  item: GuardianListItem;
  returnTo: string;
}) {
  const readHref = `/news/guardian/read?url=${encodeURIComponent(item.webUrl)}&returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <Link
      key={item.id}
      href={readHref}
      prefetch={false}
      className="group flex flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.14)] ring-1 ring-zinc-900/[0.04] transition duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_22px_50px_-12px_rgba(15,23,42,0.22)] hover:ring-rose-200/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:bg-zinc-900 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)] dark:ring-white/[0.06]"
    >
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {item.thumbnailUrl ? (
          <Image
            src={item.thumbnailUrl}
            alt=""
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            sizes="(max-width:768px) 100vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-200/80 dark:bg-zinc-800">
            <Newspaper className="h-10 w-10 text-zinc-400" />
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3.5 sm:p-4">
        <h3 className="line-clamp-3 text-left text-lg font-extrabold leading-[1.35] tracking-tight text-zinc-900 dark:text-zinc-50">
          {item.webTitle}
        </h3>
        {item.webPublicationDate ? (
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
            {formatRelativeDaysAgo(item.webPublicationDate)}
          </p>
        ) : null}
        {item.trailText ? (
          <p className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
            {item.trailText}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-3">
          <span
            className={`max-w-full truncate rounded-full border px-2.5 py-0.5 text-left text-[11px] font-semibold ${GUARDIAN_SPORT_PILL}`}
          >
            The Guardian
          </span>
        </div>
      </div>
    </Link>
  );
}

export function EngooDailyNewsHomeInner({
  initialData,
  initialSportItems,
}: {
  /** Server-pre-fetched "all" category items — skips the initial client fetch when provided. */
  initialData?: EngooListApiResponse | null;
  /** Server-pre-fetched Guardian Sport items — skips the initial client fetch when Sport tab opens first. */
  initialSportItems?: GuardianListItem[] | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = useMemo(
    () => getEngooDailyNewsCategoryBySlug(searchParams.get("category")),
    [searchParams],
  );
  const isAllTab = activeCategory.slug === "all";
  const isSportTab = activeCategory.slug === "sport";

  // Server pre-fetched data is only valid for the "all" tab (default).
  const hasServerData =
    isAllTab &&
    !isSportTab &&
    Array.isArray(initialData?.items) &&
    initialData!.items.length > 0;
  const hasServerSport =
    Array.isArray(initialSportItems) && initialSportItems.length > 0;

  const [allItems, setAllItems] = useState<EngooListCard[]>(
    hasServerData ? initialData!.items : [],
  );
  const [listLoading, setListLoading] = useState(!hasServerData && !isSportTab);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Guardian Sport tab state. Kept alongside the Engoo list state so the
  // shared header (search box, tab nav) can operate on either dataset
  // without shuttling state through a separate component.
  const [sportItems, setSportItems] = useState<GuardianListItem[]>(
    hasServerSport ? initialSportItems! : [],
  );
  const [sportLoading, setSportLoading] = useState(
    isSportTab && !hasServerSport,
  );
  const [sportError, setSportError] = useState<string | null>(null);
  const [sportNoKey, setSportNoKey] = useState(false);
  const [kindleBusy, setKindleBusy] = useState(false);
  const [kindleError, setKindleError] = useState<string | null>(null);

  const PAGE_SIZE = 30;
  /** Max pages to show — caps how many articles we fetch. */
  const MAX_PAGES = 10;
  const MAX_ARTICLES = PAGE_SIZE * MAX_PAGES;

  const setCategorySlug = useCallback(
    (slug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("src");
      params.delete("gtab");
      if (slug === "all") params.delete("category");
      else params.set("category", slug);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Fetch a bounded window of articles (up to MAX_ARTICLES) then stop.
  const crawlAbortRef = useRef<AbortController | null>(null);
  const fetchBoundedItems = useCallback(async (slug: string, limit: number) => {
    crawlAbortRef.current?.abort();
    const ctrl = new AbortController();
    crawlAbortRef.current = ctrl;

    setError(null);
    setListLoading(true);
    setAllItems([]);
    setCurrentPage(1);

    const accumulated: EngooListCard[] = [];
    let cursor: string | null = null;
    let firstPageDone = false;

    try {
      while (!ctrl.signal.aborted && accumulated.length < limit) {
        const batchSize = Math.min(50, limit - accumulated.length);
        const res: Response = await fetch(
          listQuery(slug, { cursor, pageSize: batchSize }),
          { signal: ctrl.signal },
        );
        const parsed = await parseResponseJson<EngooListApiResponse>(res);
        if (!parsed.ok) {
          setError(parsed.message);
          break;
        }
        if (ctrl.signal.aborted) break;
        const batch = parsed.data.items ?? [];
        accumulated.push(...batch);
        if (ctrl.signal.aborted) break;
        // Show first batch immediately while fetching rest
        if (!firstPageDone) {
          setAllItems([...accumulated]);
          setListLoading(false);
          firstPageDone = true;
        } else {
          setAllItems([...accumulated]);
        }
        cursor = parsed.data.nextCursor ?? null;
        if (!cursor || accumulated.length >= limit) break;
      }
    } catch {
      if (!ctrl.signal.aborted) setError("Network error");
    } finally {
      if (!ctrl.signal.aborted) {
        setAllItems([...accumulated.slice(0, limit)]);
        setListLoading(false);
      }
    }
  }, []);

  // Skip the initial "all" category fetch when the server already pre-fetched the data.
  const skipInitialRef = useRef(hasServerData);

  useEffect(() => {
    // Sport tab uses Guardian data — handled by its own effect below.
    if (isSportTab) {
      crawlAbortRef.current?.abort();
      return;
    }
    if (skipInitialRef.current) {
      skipInitialRef.current = false;
      // Load remaining pages in background if server data had a nextCursor.
      // Uses fetchBoundedItems via the shared abort ref so category switches
      // properly cancel this background work.
      if (initialData?.nextCursor) {
        const ctrl = new AbortController();
        crawlAbortRef.current = ctrl;
        void (async () => {
          const accumulated: EngooListCard[] = [...(initialData?.items ?? [])];
          let cursor: string | null = initialData?.nextCursor ?? null;
          try {
            while (cursor && !ctrl.signal.aborted && accumulated.length < MAX_ARTICLES) {
              const batchSize = Math.min(50, MAX_ARTICLES - accumulated.length);
              const res = await fetch(
                listQuery(activeCategory.slug, { cursor, pageSize: batchSize }),
                { signal: ctrl.signal },
              );
              if (ctrl.signal.aborted) break;
              const parsed = await parseResponseJson<EngooListApiResponse>(res);
              if (!parsed.ok || ctrl.signal.aborted) break;
              accumulated.push(...(parsed.data.items ?? []));
              if (ctrl.signal.aborted) break;
              setAllItems([...accumulated.slice(0, MAX_ARTICLES)]);
              cursor = parsed.data.nextCursor ?? null;
            }
          } catch { /* abort or network error */ }
        })();
      }
    } else {
      void fetchBoundedItems(activeCategory.slug, MAX_ARTICLES);
    }
    return () => { crawlAbortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory.slug, fetchBoundedItems, isSportTab]);

  // Guardian Sport loader. Runs once the first time the Sport tab is opened
  // (unless the server already pre-fetched Sport items for this request).
  const skipSportFetchRef = useRef(hasServerSport);
  useEffect(() => {
    if (!isSportTab) return;
    if (skipSportFetchRef.current) {
      skipSportFetchRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      setSportLoading(true);
      setSportError(null);
      setSportNoKey(false);
      try {
        const res = await fetch(
          "/api/guardian/list?section=sport&pageSize=50",
          { credentials: "same-origin" },
        );
        const text = await res.text();
        let json: {
          items?: GuardianListItem[];
          error?: string;
          code?: string;
        };
        try {
          json = JSON.parse(text) as typeof json;
        } catch {
          if (!cancelled) {
            setSportError(
              t("guardianListUnexpectedResponse").replace(
                "{status}",
                String(res.status),
              ),
            );
            setSportItems([]);
          }
          return;
        }
        if (cancelled) return;
        if (res.status === 503) {
          setSportNoKey(true);
          setSportItems([]);
          return;
        }
        if (!res.ok) {
          const msg = json.error ?? t("dailyNewsGuardianLoadError");
          const code = json.code?.trim();
          setSportError(code ? `${msg} (code: ${code})` : msg);
          setSportItems([]);
          return;
        }
        setSportItems(json.items ?? []);
      } catch {
        if (!cancelled) {
          setSportError(t("dailyNewsGuardianLoadError"));
          setSportItems([]);
        }
      } finally {
        if (!cancelled) setSportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSportTab]);

  // Deduplicate by masterId — the API can return the same article more than once
  const dedupedItems = useMemo(() => {
    const seen = new Set<string>();
    return allItems.filter((c) => {
      if (seen.has(c.masterId)) return false;
      seen.add(c.masterId);
      return true;
    });
  }, [allItems]);

  // Defensive client-side tab filter. The API already filters by topicLabel,
  // but if server-side filtering drifts or returns an unfiltered payload
  // (e.g. during a cache/backfill glitch), the visible list must still match
  // the selected tab.
  const categoryFilteredItems = useMemo(() => {
    if (isAllTab) return dedupedItems;
    const expectedLabel =
      activeCategory.slug in ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL
        ? ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL[
            activeCategory.slug as keyof typeof ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL
          ]
        : null;
    if (!expectedLabel) return dedupedItems;
    return dedupedItems.filter((c) => c.category === expectedLabel);
  }, [dedupedItems, isAllTab, activeCategory.slug]);

  const filteredForSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categoryFilteredItems;
    return categoryFilteredItems.filter((c) =>
      c.title.toLowerCase().includes(q),
    );
  }, [categoryFilteredItems, searchQuery]);

  const filteredSport = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sportItems;
    return sportItems.filter((x) =>
      x.webTitle.toLowerCase().includes(q),
    );
  }, [sportItems, searchQuery]);

  // Reset to page 1 when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeCategory.slug]);

  // Clear the Kindle error whenever the active tab changes so a stale message
  // from Sport doesn't linger when the user jumps to All / Business / etc.
  useEffect(() => {
    setKindleError(null);
  }, [activeCategory.slug]);

  const visibleFilteredCount = isSportTab
    ? filteredSport.length
    : filteredForSearch.length;
  const totalPages = Math.max(1, Math.ceil(visibleFilteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = filteredForSearch.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const pageSportItems = filteredSport.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const sportListReturnTo = "/news?category=sport";

  const downloadSportKindleEpub = useCallback(async () => {
    if (!isSportTab || filteredSport.length === 0) return;
    setKindleError(null);
    setKindleBusy(true);
    try {
      const articles = await fetchGuardianArticlesForKindleEpub(
        filteredSport,
        3,
        GUARDIAN_KINDLE_EPUB_MAX_ARTICLES,
      );
      const day = new Date().toISOString().slice(0, 10);
      const bookTitle = `Guardian Sport — ${day}`;
      const blob = await buildGuardianListEpubBlob(articles, bookTitle);
      const safeDay = day.replace(/-/g, "");
      triggerEpubDownload(blob, `guardian-sport-${safeDay}.epub`);
    } catch {
      setKindleError(t("dailyNewsSportKindleError"));
    } finally {
      setKindleBusy(false);
    }
  }, [isSportTab, filteredSport, t]);

  const { featured, spotlights, gridItems } = useMemo(() => {
    const list = pageItems;
    const useFeatured =
      isAllTab &&
      !isSportTab &&
      safePage === 1 &&
      !searchQuery.trim() &&
      list.length > 0;
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
  }, [pageItems, isAllTab, isSportTab, searchQuery, safePage]);

  const emptyAfterLoad = isSportTab
    ? !sportLoading && !sportError && !sportNoKey && sportItems.length === 0
    : !listLoading && !error && allItems.length === 0;
  const listHadDataButNoneVisible = isSportTab
    ? !sportLoading && filteredSport.length === 0 && sportItems.length > 0
    : !listLoading && filteredForSearch.length === 0 && allItems.length > 0;
  const emptySearch = listHadDataButNoneVisible;

  const showMoreStoriesBand =
    isAllTab &&
    !searchQuery.trim() &&
    (featured !== null || spotlights.length > 0);
  const storyStagger = (idx: number) =>
    featured !== null || spotlights.length > 0 ? 3 + idx : idx;

  return (
    <div className="min-h-screen w-full bg-[#F6F7F9] pb-12 font-sans text-[#111827] dark:bg-zinc-950 dark:text-zinc-100">
      <header className="mx-auto mb-3 max-w-6xl overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-md shadow-zinc-200/40 ring-1 ring-black/[0.03] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none dark:ring-white/[0.04]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-5">
          <div className="border-l-4 border-l-rose-600 pl-3 dark:border-l-rose-500">
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
              {t("dailyNewsPageTitle")}
            </h1>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[22rem] sm:flex-row sm:items-stretch sm:gap-3">
            <label className="flex w-full flex-1 items-center gap-2 rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5 shadow-inner shadow-zinc-200/20 dark:border-zinc-600 dark:bg-zinc-950/50 dark:shadow-none">
              <Search
                className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                aria-hidden
              />
              <input
                type="search"
                placeholder={t("dailyNewsSearchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:ring-0 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </label>
            {isSportTab &&
            !sportLoading &&
            !sportNoKey &&
            filteredSport.length > 0 ? (
              <div className="flex w-full flex-col gap-1 sm:w-auto sm:shrink-0">
                <button
                  type="button"
                  onClick={() => void downloadSportKindleEpub()}
                  disabled={kindleBusy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-rose-900 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800/80 dark:bg-zinc-900 dark:text-rose-100 dark:hover:bg-rose-950/40 sm:w-auto sm:whitespace-nowrap"
                >
                  {kindleBusy ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <BookDown className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {kindleBusy
                    ? t("dailyNewsSportKindleBuilding")
                    : t("dailyNewsSportKindleDownload")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {isSportTab && kindleError ? (
          <p className="border-t border-rose-100/80 px-4 py-2 text-center text-sm text-red-600 dark:border-rose-900/40 dark:text-red-400 sm:px-6">
            {kindleError}
          </p>
        ) : null}
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
        {isSportTab && sportNoKey ? (
          <p className="mb-6 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            {t("dailyNewsGuardianNoKey")}
          </p>
        ) : null}
        {isSportTab ? (
          sportError ? (
            <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
              {sportError}
            </p>
          ) : null
        ) : error ? (
          <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {isSportTab ? (
          sportLoading ? (
            <HomeSkeleton layout="category" />
          ) : emptyAfterLoad ? (
            <p className="py-20 text-center text-zinc-500 dark:text-zinc-400">
              {t("dailyNewsSportEmpty")}
            </p>
          ) : emptySearch ? (
            <p className="py-20 text-center text-zinc-500 dark:text-zinc-400">
              No articles match your search.
            </p>
          ) : (
            <section className="space-y-6">
              <h2 className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-2xl">
                <Tag
                  className="h-5 w-5 shrink-0 text-rose-500/80 dark:text-rose-400/80"
                  aria-hidden
                />
                {activeCategory.label}
              </h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {pageSportItems.map((item) => (
                  <div key={item.id} className="min-w-0">
                    <GuardianSportCard
                      item={item}
                      returnTo={sportListReturnTo}
                    />
                  </div>
                ))}
              </div>
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </section>
          )
        ) : listLoading ? (
          <HomeSkeleton layout={isAllTab ? "featured" : "category"} />
        ) : emptyAfterLoad ? (
          <p className="py-20 text-center text-zinc-500 dark:text-zinc-400">
            No articles in this category.
          </p>
        ) : emptySearch ? (
          <p className="py-20 text-center text-zinc-500 dark:text-zinc-400">
            No articles match your search.
          </p>
        ) : (
          <>
            {featured || spotlights.length > 0 ? (
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
                {featured ? (
                  <div className="rounded-[1.35rem] bg-gradient-to-br from-rose-100/50 via-white to-amber-50/40 p-[3px] shadow-[0_20px_60px_-20px_rgba(225,29,72,0.25)] dark:from-rose-950/40 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-none">
                    <EngooCard
                      card={featured}
                      variant="hero"
                      layout="overlay"
                      staggerIndex={0}
                      className="min-h-[320px] w-full rounded-[1.2rem] ring-2 ring-white/80 dark:ring-zinc-800 md:min-h-[400px]"
                    />
                  </div>
                ) : null}
                {spotlights.length > 0 ? (
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
                ) : null}
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
                {showMoreStoriesBand ? (
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
                    <div key={c.masterId} className="min-w-0">
                      <EngooCard
                        card={c}
                        layout="feed"
                        staggerIndex={storyStagger(i)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
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
