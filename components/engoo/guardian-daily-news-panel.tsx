"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookDown, LayoutGrid, Loader2, Newspaper, Search } from "lucide-react";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import { useI18n } from "@/components/i18n-provider";
import { formatRelativeDaysAgo } from "@/lib/format-relative-days-ago";
import { Pagination } from "@/components/pagination";
import {
  buildGuardianListEpubBlob,
  fetchGuardianArticlesForKindleEpub,
  GUARDIAN_KINDLE_EPUB_MAX_ARTICLES,
  triggerEpubDownload,
} from "@/lib/guardian-kindle-epub";

const GUARDIAN_PILL =
  "border-rose-200/90 bg-rose-50 text-rose-950 dark:border-rose-800/80 dark:bg-rose-950/50 dark:text-rose-100";

function guardianListReturnHref(tab: "news" | "sport"): string {
  const base = "/news";
  const p = new URLSearchParams();
  p.set("src", "guardian");
  if (tab === "sport") p.set("gtab", "sport");
  return `${base}?${p.toString()}`;
}

function GuardianStoryGrid({
  items,
  returnTo,
}: {
  items: GuardianListItem[];
  returnTo: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
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
                className={`max-w-full truncate rounded-full border px-2.5 py-0.5 text-left text-[11px] font-semibold ${GUARDIAN_PILL}`}
              >
                The Guardian
              </span>
            </div>
          </div>
        </Link>
        );
      })}
    </div>
  );
}

function GuardianListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-2xl border border-zinc-200/90 bg-white dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="aspect-[16/10] bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-2 p-4">
            <div className="h-5 w-[85%] rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800/80" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GuardianDailyNewsPanel({
  initialNewsItems,
  initialSportItems,
}: {
  /** Server-pre-fetched world/news items — skips the initial client fetch when provided. */
  initialNewsItems?: GuardianListItem[] | null;
  /** Server-pre-fetched sport items — skips the initial client fetch when provided. */
  initialSportItems?: GuardianListItem[] | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: "news" | "sport" =
    searchParams.get("gtab") === "sport" ? "sport" : "news";

  const setGuardianTab = useCallback(
    (next: "news" | "sport") => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("src", "guardian");
      if (next === "sport") p.set("gtab", "sport");
      else p.delete("gtab");
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const hasServerNews = Array.isArray(initialNewsItems) && initialNewsItems.length > 0;
  const hasServerSport = Array.isArray(initialSportItems) && initialSportItems.length > 0;

  const [newsItems, setNewsItems] = useState<GuardianListItem[]>(
    hasServerNews ? initialNewsItems! : [],
  );
  const [sportItems, setSportItems] = useState<GuardianListItem[]>(
    hasServerSport ? initialSportItems! : [],
  );
  const [loadingNews, setLoadingNews] = useState(tab === "news" && !hasServerNews);
  const [loadingSport, setLoadingSport] = useState(tab === "sport" && !hasServerSport);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [sportError, setSportError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindleBusy, setKindleBusy] = useState(false);
  const [kindleError, setKindleError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const GUARDIAN_PAGE_SIZE = 9;

  const loadList = useCallback(
    async (section: "world" | "sport") => {
      const setLoading = section === "world" ? setLoadingNews : setLoadingSport;
      const setErr = section === "world" ? setNewsError : setSportError;
      const setData = section === "world" ? setNewsItems : setSportItems;

      setLoading(true);
      setErr(null);
      setNoKey(false);
      try {
        const res = await fetch(
          `/api/guardian/list?section=${section}&pageSize=30`,
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
          if (process.env.NODE_ENV === "development") {
            console.warn("[guardian/list:client] non-JSON body", {
              status: res.status,
              preview: text.replace(/\s+/g, " ").trim().slice(0, 200),
            });
          }
          setErr(
            t("guardianListUnexpectedResponse").replace(
              "{status}",
              String(res.status),
            ),
          );
          setData([]);
          return;
        }
        if (res.status === 503) {
          setNoKey(true);
          setData([]);
          return;
        }
        if (!res.ok) {
          const msg = json.error ?? t("dailyNewsGuardianLoadError");
          const code = json.code?.trim();
          setErr(code ? `${msg} (code: ${code})` : msg);
          setData([]);
          return;
        }
        setData(json.items ?? []);
      } catch {
        setErr(t("dailyNewsGuardianLoadError"));
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Skip the first fetch when the server already pre-fetched data for that tab.
  const skipNewsRef = useRef(hasServerNews);
  const skipSportRef = useRef(hasServerSport);

  useEffect(() => {
    if (tab !== "news") return;
    if (skipNewsRef.current) {
      skipNewsRef.current = false;
      return;
    }
    void loadList("world");
  }, [tab, loadList]);

  useEffect(() => {
    if (tab !== "sport") return;
    if (skipSportRef.current) {
      skipSportRef.current = false;
      return;
    }
    void loadList("sport");
  }, [tab, loadList]);

  const filteredNews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return newsItems;
    return newsItems.filter((x) => x.webTitle.toLowerCase().includes(q));
  }, [newsItems, searchQuery]);

  const filteredSport = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sportItems;
    return sportItems.filter((x) => x.webTitle.toLowerCase().includes(q));
  }, [sportItems, searchQuery]);

  // Reset page when tab or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [tab, searchQuery]);

  const loading = tab === "news" ? loadingNews : loadingSport;
  const error = tab === "news" ? newsError : sportError;
  const allFiltered = tab === "news" ? filteredNews : filteredSport;
  const totalPages = Math.max(1, Math.ceil(allFiltered.length / GUARDIAN_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const filtered = allFiltered.slice(
    (safePage - 1) * GUARDIAN_PAGE_SIZE,
    safePage * GUARDIAN_PAGE_SIZE,
  );
  const emptyMessage =
    tab === "news"
      ? t("dailyNewsGuardianEmpty")
      : t("dailyNewsSportEmpty");

  const listReturnTo = useMemo(() => guardianListReturnHref(tab), [tab]);

  const downloadSportKindleEpub = useCallback(async () => {
    if (tab !== "sport" || filteredSport.length === 0) return;
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
  }, [tab, filteredSport, t]);

  useEffect(() => {
    setKindleError(null);
  }, [tab]);

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
            {tab === "sport" && !loading && !noKey && filteredSport.length > 0 ? (
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
        {tab === "sport" && kindleError ? (
          <p className="border-t border-rose-100/80 px-4 py-2 text-center text-sm text-red-600 dark:border-rose-900/40 dark:text-red-400 sm:px-6">
            {kindleError}
          </p>
        ) : null}
        <nav
          className="flex gap-0.5 overflow-x-auto border-t border-zinc-100/90 bg-zinc-50/40 px-2 pb-1.5 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-zinc-800 dark:bg-zinc-950/30 sm:gap-1 sm:px-4 [&::-webkit-scrollbar]:hidden"
          aria-label={t("dailyNewsGuardianSubNavAria")}
        >
          {(
            [
              {
                id: "news" as const,
                label: t("dailyNewsGuardianNewsTab"),
                showGrid: true,
              },
              {
                id: "sport" as const,
                label: t("dailyNewsGuardianSportTab"),
                showGrid: false,
              },
            ] as const
          ).map(({ id, label, showGrid }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setGuardianTab(id)}
                className={`group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-200 sm:px-4 ${
                  active
                    ? "engoo-news-tab-active font-bold text-rose-800 dark:text-rose-200"
                    : "font-medium text-zinc-500 hover:bg-white/80 hover:text-rose-700 dark:text-zinc-400 dark:hover:bg-zinc-800/90 dark:hover:text-rose-300/90"
                }`}
              >
                {showGrid ? (
                  <LayoutGrid
                    className={`h-3.5 w-3.5 shrink-0 transition-colors ${active ? "text-rose-600 dark:text-rose-400" : "opacity-55 group-hover:opacity-80"}`}
                    aria-hidden
                  />
                ) : null}
                {label}
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
        {noKey ? (
          <p className="mb-6 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            {t("dailyNewsGuardianNoKey")}
          </p>
        ) : null}
        {error ? (
          <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        {loading ? (
          <GuardianListSkeleton />
        ) : !noKey && allFiltered.length === 0 ? (
          <p className="py-20 text-center text-zinc-500 dark:text-zinc-400">
            {emptyMessage}
          </p>
        ) : (
          <>
            <GuardianStoryGrid items={filtered} returnTo={listReturnTo} />
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
