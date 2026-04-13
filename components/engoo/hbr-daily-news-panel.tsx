"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Newspaper, Search } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { formatRelativeDaysAgo } from "@/lib/format-relative-days-ago";
import { Pagination } from "@/components/pagination";
import type { RssItem } from "@/app/api/rss/route";

const HBR_PILL =
    "border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-100";

type HbrTabId =
    | "latest"
    | "topics"
    | "reading-lists"
    | "data-visuals"
    | "case-selections"
    | "executive";

const HBR_TABS: { id: HbrTabId; label: string }[] = [
    { id: "latest", label: "Latest" },
    { id: "topics", label: "Topics" },
    { id: "reading-lists", label: "Reading Lists" },
    { id: "data-visuals", label: "Data & Visuals" },
    { id: "case-selections", label: "Case Selections" },
    { id: "executive", label: "HBR Executive" },
];

function readerHref(url: string, returnTo: string): string {
    return `/news/read?src=hbr&url=${encodeURIComponent(url)}&returnTo=${encodeURIComponent(returnTo)}`;
}

function HBRStoryGrid({
    items,
    returnTo,
}: {
    items: RssItem[];
    returnTo: string;
}) {
    return (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
                <Link
                    key={item.id}
                    href={readerHref(item.url, returnTo)}
                    prefetch={false}
                    className="group flex flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.14)] ring-1 ring-zinc-900/[0.04] transition duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_22px_50px_-12px_rgba(15,23,42,0.22)] hover:ring-amber-200/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 dark:bg-zinc-900 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)] dark:ring-white/[0.06]"
                >
                    <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                        {item.thumbnail ? (
                            <Image
                                src={item.thumbnail}
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
                            {item.title}
                        </h3>
                        {item.publishedAt ? (
                            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                                {formatRelativeDaysAgo(item.publishedAt)}
                                {item.readingTime
                                    ? ` · ${item.readingTime} MIN READ`
                                    : ""}
                            </p>
                        ) : null}
                        {item.summary ? (
                            <p className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                                {item.summary}
                            </p>
                        ) : null}
                        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-3">
                            <span
                                className={`max-w-full truncate rounded-full border px-2.5 py-0.5 text-left text-[11px] font-semibold ${HBR_PILL}`}
                            >
                                {item.category ?? "Harvard Business Review"}
                            </span>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
}

function HBRListSkeleton() {
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

const PAGE_SIZE = 30;

export function HBRDailyNewsPanel({
    initialItems,
}: {
    initialItems?: RssItem[] | null;
}) {
    const { t } = useI18n();
    const hasServerItems = Array.isArray(initialItems) && initialItems.length > 0;

    const [tab, setTab] = useState<HbrTabId>("latest");
    const [items, setItems] = useState<RssItem[]>(hasServerItems ? initialItems! : []);
    const [loading, setLoading] = useState(!hasServerItems);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slow, setSlow] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const abortRef = useRef<AbortController | null>(null);

    const loadTabProgressive = useCallback(
        async (nextTab: HbrTabId, opts: { skipIfServer?: boolean } = {}) => {
            if (opts.skipIfServer) return;
            abortRef.current?.abort();
            const ctrl = new AbortController();
            abortRef.current = ctrl;
            setLoading(true);
            setLoadingMore(false);
            setError(null);
            setSlow(false);
            setItems([]);

            // Trigger "Loading is taking longer than usual…" after 5s.
            const slowTimer = setTimeout(() => {
                if (!ctrl.signal.aborted) setSlow(true);
            }, 5_000);

            try {
                const res = await fetch(
                    `/api/rss?source=hbr&section=${encodeURIComponent(nextTab)}`,
                    { signal: ctrl.signal, credentials: "same-origin" },
                );
                if (ctrl.signal.aborted) return;

                // Detect 504 HTML / non-JSON error pages from Netlify before
                // we try to parse them as JSON or NDJSON.
                const contentType = res.headers.get("content-type") ?? "";
                if (!res.ok) {
                    setError(
                        "Could not load articles. Tap to retry.",
                    );
                    return;
                }

                if (contentType.includes("application/x-ndjson") && res.body) {
                    // Progressive streaming mode — append batches as they arrive.
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    let firstBatchReceived = false;
                    const seen = new Set<string>();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (ctrl.signal.aborted) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() ?? "";

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;
                            let chunk: {
                                type?: string;
                                articles?: RssItem[];
                                hasMore?: boolean;
                            };
                            try {
                                chunk = JSON.parse(trimmed);
                            } catch {
                                continue;
                            }
                            if (chunk.type === "batch" && Array.isArray(chunk.articles)) {
                                const fresh = chunk.articles.filter(
                                    (a) => a.url && !seen.has(a.url),
                                );
                                fresh.forEach((a) => seen.add(a.url));
                                if (fresh.length > 0) {
                                    setItems((prev) => [...prev, ...fresh]);
                                }
                                if (!firstBatchReceived) {
                                    firstBatchReceived = true;
                                    setLoading(false);
                                    setLoadingMore(Boolean(chunk.hasMore));
                                } else {
                                    setLoadingMore(Boolean(chunk.hasMore));
                                }
                            } else if (chunk.type === "done") {
                                setLoadingMore(false);
                            }
                        }
                    }
                } else {
                    // Cache hit — plain JSON response.
                    const data = (await res.json()) as { items?: RssItem[] };
                    if (ctrl.signal.aborted) return;
                    setItems(data.items ?? []);
                }
            } catch (e) {
                if (!ctrl.signal.aborted) {
                    // Don't surface raw error text — just offer a retry.
                    setError("Could not load articles. Tap to retry.");
                    void e;
                }
            } finally {
                clearTimeout(slowTimer);
                if (!ctrl.signal.aborted) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [],
    );

    // SSR pre-fetch covers the "latest" tab only; re-fetch on every tab change.
    useEffect(() => {
        const skip = tab === "latest" && hasServerItems;
        void loadTabProgressive(tab, { skipIfServer: skip });
        return () => {
            abortRef.current?.abort();
        };
    }, [tab, hasServerItems, loadTabProgressive]);

    // Fire a non-blocking warm-cache request on first mount so the next tab
    // switch after this one has a Blob cache hit. Idempotent and safe to
    // double-call — the warm route is fire-and-forget itself.
    useEffect(() => {
        const ctrl = new AbortController();
        fetch("/api/hbr-warm-cache", {
            method: "GET",
            signal: ctrl.signal,
            credentials: "same-origin",
        }).catch(() => {});
        return () => ctrl.abort();
    }, []);

    const retry = useCallback(() => {
        void loadTabProgressive(tab);
    }, [tab, loadTabProgressive]);

    useEffect(() => {
        setCurrentPage(1);
        setSearchQuery("");
    }, [tab]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (it) =>
                it.title.toLowerCase().includes(q) ||
                (it.summary?.toLowerCase().includes(q) ?? false),
        );
    }, [items, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const pageItems = filtered.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE,
    );

    const returnTo = "/news?src=hbr";

    return (
        <div className="min-h-screen w-full bg-[#F6F7F9] pb-12 font-sans text-[#111827] dark:bg-zinc-950 dark:text-zinc-100">
            <header className="mx-auto mb-3 max-w-6xl overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-md shadow-zinc-200/40 ring-1 ring-black/[0.03] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none dark:ring-white/[0.04]">
                <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-5">
                    <div className="border-l-4 border-l-rose-600 pl-3 dark:border-l-rose-500">
                        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
                            {t("dailyNewsSourceHBR")}
                        </h1>
                    </div>
                    <label className="flex w-full flex-1 items-center gap-2 rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5 shadow-inner shadow-zinc-200/20 sm:w-auto sm:min-w-[22rem] sm:flex-none dark:border-zinc-600 dark:bg-zinc-950/50 dark:shadow-none">
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
                </div>
                <nav
                    className="flex gap-0.5 overflow-x-auto border-t border-zinc-100/90 bg-zinc-50/40 px-2 pb-1.5 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-zinc-800 dark:bg-zinc-950/30 sm:gap-1 sm:px-4 [&::-webkit-scrollbar]:hidden"
                    aria-label="HBR sections"
                >
                    {HBR_TABS.map(({ id, label }) => {
                        const active = tab === id;
                        const showGrid = id === "latest";
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={`group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-200 sm:px-4 ${
                                    active
                                        ? "engoo-news-tab-active font-bold text-rose-800 dark:text-rose-200"
                                        : "font-medium text-zinc-500 hover:bg-white/80 hover:text-rose-700 dark:text-zinc-400 dark:hover:bg-zinc-800/90 dark:hover:text-rose-300/90"
                                }`}
                                aria-pressed={active}
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
                {error ? (
                    <div className="mb-4 flex flex-col items-center gap-3 rounded-2xl border border-zinc-200/70 bg-white px-5 py-8 text-center text-sm dark:border-zinc-800 dark:bg-zinc-900/85">
                        <p className="text-zinc-700 dark:text-zinc-300">{error}</p>
                        <button
                            type="button"
                            onClick={retry}
                            className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                            Retry
                        </button>
                    </div>
                ) : null}
                {loading ? (
                    <>
                        <HBRListSkeleton />
                        {slow ? (
                            <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                                Loading is taking longer than usual…
                            </p>
                        ) : null}
                    </>
                ) : !error && pageItems.length === 0 ? (
                    <p className="py-20 text-center text-zinc-500 dark:text-zinc-400">
                        No articles in this section yet.
                    </p>
                ) : (
                    <>
                        <HBRStoryGrid items={pageItems} returnTo={returnTo} />
                        {loadingMore ? (
                            <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                                Loading more…
                            </p>
                        ) : null}
                        {totalPages > 1 ? (
                            <Pagination
                                currentPage={safePage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                            />
                        ) : null}
                    </>
                )}
            </main>
        </div>
    );
}
