"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    Bookmark,
    BookmarkCheck,
    ExternalLink,
} from "lucide-react";
import { toast } from "react-toastify";
import { ARTICLE_READ_BODY_CLASS } from "@/lib/article-read-body-class";
import { EngooReadingTutorPanel } from "@/components/engoo/engoo-reading-tutor-panel";
import { AddFlashcardModal, HighlightToolbar } from "@/components/ielts";
import { storeEngooCallContext } from "@/lib/engoo-call-context";
import { buildSmartReaderEngooTutorPayload } from "@/lib/smart-reader-tutor-payload";

type Article = {
    title: string;
    byline: string | null;
    content: string;
    textContent: string;
    excerpt: string | null;
    summary?: string | null;
    siteName: string | null;
    publishedTime: string | null;
    readingTime: number;
    coverImage: string | null;
    url: string;
};

const BOOKMARKS_KEY = "smart-reader-bookmarks";
const READ_KEY = "smart-reader-read";

/**
 * Reset any storage the publisher might use to meter free articles.
 * HBR specifically stores a counter in localStorage + sessionStorage; clearing
 * both before every load keeps us under the meter without ever opening the
 * publisher site in the browser itself.
 */
function resetPublisherStorage(): void {
    if (typeof window === "undefined") return;
    try {
        const doomed: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (!k) continue;
            if (/^(hbr|meter|article-count)/i.test(k)) {
                doomed.push(k);
            }
        }
        doomed.forEach((k) => window.localStorage.removeItem(k));
        window.sessionStorage.clear();
    } catch {
        /* Storage may be disabled (private mode). Safe to ignore. */
    }
}

function readBookmarks(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(BOOKMARKS_KEY);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : [];
    } catch {
        return [];
    }
}

function writeBookmarks(list: string[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
    } catch {
        /* ignore quota errors */
    }
}

function markRead(url: string): void {
    if (typeof window === "undefined") return;
    try {
        const raw = window.localStorage.getItem(READ_KEY);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        const list = Array.isArray(arr)
            ? arr.filter((v): v is string => typeof v === "string")
            : [];
        if (!list.includes(url)) {
            list.push(url);
            window.localStorage.setItem(READ_KEY, JSON.stringify(list));
        }
    } catch {
        /* ignore */
    }
}

export function SmartReaderClient() {
    const searchParams = useSearchParams();
    const url = searchParams.get("url")?.trim() ?? "";
    const src = searchParams.get("src")?.trim() ?? "";
    const returnTo = searchParams.get("returnTo")?.trim() || "/news";
    // Optimistic UI hints from the previous page: title + cover image URL
    // get embedded in the link so the reader can paint header + hero image
    // instantly while the body is still being fetched (Wayback ~10s).
    const optimisticTitle = searchParams.get("title")?.trim() || null;
    const optimisticCover = searchParams.get("cover")?.trim() || null;

    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bookmarked, setBookmarked] = useState(false);
    const [tutorOpen, setTutorOpen] = useState(false);
    const [toolbar, setToolbar] = useState<
        { x: number; y: number; selectedText: string } | null
    >(null);
    const [flashcardWord, setFlashcardWord] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const articleBodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!url) return;
        resetPublisherStorage();

        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);
        setError(null);
        setArticle(null);

        (async () => {
            try {
                const res = await fetch(
                    `/api/fetch-article?url=${encodeURIComponent(url)}`,
                    { signal: ctrl.signal },
                );
                // Netlify sometimes replies with a plain "Internal Server Error"
                // body when a serverless function crashes. Guard res.json() so
                // the user sees a usable message instead of a JSON parse error.
                const contentType = res.headers.get("content-type") ?? "";
                if (!contentType.includes("application/json")) {
                    if (ctrl.signal.aborted) return;
                    setError(
                        "Article temporarily unavailable. Open in browser instead.",
                    );
                    return;
                }
                const json = (await res.json()) as
                    | Article
                    | { error?: string };
                if (ctrl.signal.aborted) return;
                if (!res.ok || !("title" in json)) {
                    setError(
                        ("error" in json && json.error) ||
                            `Could not load the article (HTTP ${res.status}).`,
                    );
                    return;
                }
                setArticle(json);
                markRead(url);
                if (src === "hbr") {
                    import("@/components/daily-tasks/daily-tasks-auto-detect")
                        .then(({ markDailyTask }) => markDailyTask("read_hbr"))
                        .catch(() => {});
                }
            } catch (e) {
                if (!ctrl.signal.aborted) {
                    setError(e instanceof Error ? e.message : "Network error");
                }
            } finally {
                if (!ctrl.signal.aborted) setLoading(false);
            }
        })();
        return () => ctrl.abort();
    }, [url]);

    useEffect(() => {
        if (!url) return;
        setBookmarked(readBookmarks().includes(url));
    }, [url]);

    const toggleBookmark = useCallback(() => {
        if (!url) return;
        const list = readBookmarks();
        const idx = list.indexOf(url);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(url);
        writeBookmarks(list);
        setBookmarked(idx < 0);
        toast.success(idx < 0 ? "Bookmarked" : "Bookmark removed");
    }, [url]);

    const sourceLabel = useMemo(() => {
        if (src === "hbr") return "Harvard Business Review";
        if (src === "guardian") return "The Guardian";
        return article?.siteName ?? "Article";
    }, [src, article]);

    // Reset tutor on article change so a new piece doesn't inherit the previous panel.
    useEffect(() => {
        setTutorOpen(false);
    }, [url]);


    // Show the highlight toolbar on text selection inside the article body.
    useEffect(() => {
        const onMouseUp = () => {
            // Defer state read + update by a tick so the browser has time to
            // finalize the selection — and so the React re-render from
            // setToolbar happens AFTER the selection is committed, not
            // synchronously inside the mouseup event (which has been
            // observed to drop the selection on some configurations).
            setTimeout(() => {
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
                    setToolbar(null);
                    return;
                }
                const range = sel.getRangeAt(0);
                const root = articleBodyRef.current;
                if (
                    !root ||
                    (!root.contains(range.startContainer) &&
                        !root.contains(range.endContainer))
                ) {
                    setToolbar(null);
                    return;
                }
                const text = sel.toString().trim();
                if (!text) {
                    setToolbar(null);
                    return;
                }
                const rect = range.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) {
                    setToolbar(null);
                    return;
                }
                setToolbar({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    selectedText: text,
                });
            }, 0);
        };
        document.addEventListener("mouseup", onMouseUp);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setToolbar(null);
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mouseup", onMouseUp);
            document.removeEventListener("keydown", onKey);
        };
    }, []);

const handleFlashcard = useCallback((word: string) => {
        setFlashcardWord(word);
        window.getSelection()?.removeAllRanges();
        setToolbar(null);
    }, []);

    const tutorPayload = useMemo(() => {
        if (loading || error || !article) return null;
        return buildSmartReaderEngooTutorPayload({
            title: article.title,
            html: article.content,
            sourceUrl: article.url,
            sourceLabel,
            thumbnailUrl: article.coverImage,
        });
    }, [loading, error, article, sourceLabel]);

    const openReadingTutor = useCallback(() => {
        if (!tutorPayload) return;
        storeEngooCallContext(tutorPayload.masterId, tutorPayload);
        setTutorOpen(true);
    }, [tutorPayload]);

    return (
        <div
            className={`relative min-h-screen w-full bg-zinc-100/90 font-sans text-zinc-900 transition-[padding] duration-200 dark:bg-zinc-950 dark:text-zinc-100 ${
                tutorOpen ? "pb-[58vh] md:pb-6 md:pr-[440px]" : "pb-20"
            }`}
        >
            <div className="mx-auto max-w-6xl px-3 pt-6 sm:px-4 sm:pt-8">
                <header className="mb-4 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-900/95">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                        <Link
                            href={returnTo}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight text-zinc-800 underline-offset-2 hover:underline dark:text-zinc-300"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                            Back to list
                        </Link>
                        {article ? (
                            <>
                                <span
                                    className="hidden text-zinc-300 sm:inline dark:text-zinc-600"
                                    aria-hidden
                                >
                                    ·
                                </span>
                                <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                                >
                                    Original on {sourceLabel}
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                </a>
                            </>
                        ) : null}
                        <button
                            type="button"
                            onClick={toggleBookmark}
                            disabled={!article}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                            aria-pressed={bookmarked}
                            aria-label={bookmarked ? "Remove bookmark" : "Save"}
                        >
                            {bookmarked ? (
                                <BookmarkCheck className="h-4 w-4" strokeWidth={2} />
                            ) : (
                                <Bookmark className="h-4 w-4" strokeWidth={2} />
                            )}
                        </button>
                    </div>
                </header>

                <main className="w-full min-w-0">
                    {!url ? (
                        <div className="rounded-2xl border border-zinc-200/70 bg-white px-5 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/85 dark:text-zinc-400">
                            No article url provided.
                        </div>
                    ) : loading && optimisticTitle ? (
                        // Optimistic UI: while the body is being fetched
                        // (Wayback round-trip ~10s), paint the header + hero
                        // image + a skeleton body so the page feels instant.
                        <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white px-5 py-8 shadow-[0_4px_32px_-8px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-900/85 sm:px-8 sm:py-10">
                            <article className="w-full min-w-0">
                                <h1 className="text-balance text-[1.65rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                                    {optimisticTitle}
                                </h1>
                                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                                    Reader view · {sourceLabel}
                                </p>
                                {optimisticCover ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={optimisticCover}
                                        alt={optimisticTitle}
                                        loading="eager"
                                        className="mt-6 block w-full max-h-[400px] rounded-lg object-cover"
                                    />
                                ) : null}
                                <hr className="my-8 border-0 border-t border-zinc-200/80 dark:border-zinc-700/80 sm:my-10" />
                                <div className="animate-pulse space-y-4">
                                    <div className="h-4 w-[90%] rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                                    <div className="h-4 w-[95%] rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                                    <div className="h-4 w-[85%] rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                                    <div className="h-4 w-[92%] rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                                    <div className="h-4 w-[78%] rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                                    <div className="mt-8 h-6 w-[40%] rounded bg-zinc-300/80 dark:bg-zinc-700/80" />
                                    <div className="h-4 w-[88%] rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                                    <div className="h-4 w-[93%] rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                                    <div className="h-4 w-[80%] rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                                </div>
                            </article>
                        </div>
                    ) : loading ? (
                        <div className="py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
                            Loading…
                        </div>
                    ) : error || !article ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-8 text-center text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                            <p className="font-semibold">Could not load the article.</p>
                            <p className="mt-1">{error ?? "Unknown error."}</p>
                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="mt-4 inline-flex items-center gap-1 font-medium underline"
                            >
                                <ExternalLink className="h-4 w-4" /> Open in browser
                            </a>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white px-5 py-8 shadow-[0_4px_32px_-8px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-900/85 sm:px-8 sm:py-10">
                            <article className="w-full min-w-0">
                                <h1 className="text-balance text-[1.65rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                                    {article.title}
                                </h1>
                                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                                    Reader view · {sourceLabel}
                                </p>
                                {article.coverImage ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={article.coverImage}
                                        alt={article.title}
                                        loading="lazy"
                                        className="mt-6 block w-full max-h-[400px] rounded-lg object-cover"
                                    />
                                ) : null}
                                <hr className="my-8 border-0 border-t border-zinc-200/80 dark:border-zinc-700/80 sm:my-10" />
                                {article.summary ? (
                                    <aside className="mb-8 rounded-xl border border-zinc-200 bg-zinc-50/70 p-5 text-[0.95rem] leading-7 text-zinc-700 dark:border-zinc-700/80 dark:bg-zinc-800/40 dark:text-zinc-300">
                                        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            Summary
                                        </div>
                                        <div
                                            className="prose prose-zinc max-w-none dark:prose-invert prose-p:my-2"
                                            dangerouslySetInnerHTML={{ __html: article.summary }}
                                        />
                                    </aside>
                                ) : null}
                                <div
                                    ref={articleBodyRef}
                                    className={`${ARTICLE_READ_BODY_CLASS} select-text`}
                                    dangerouslySetInnerHTML={{ __html: article.content }}
                                />
                            </article>
                        </div>
                    )}
                </main>
            </div>

            {!tutorOpen && tutorPayload ? (
                <button
                    type="button"
                    onClick={openReadingTutor}
                    className="fixed bottom-6 right-5 z-[80] flex items-center gap-2 rounded-full bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] md:bottom-8 md:right-8"
                >
                    <span className="inline-flex h-5 w-5 items-center justify-center">
                        <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="h-5 w-5"
                            aria-hidden
                        >
                            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                        </svg>
                    </span>
                    Start Call
                </button>
            ) : null}

            <EngooReadingTutorPanel
                open={tutorOpen}
                onClose={() => setTutorOpen(false)}
                masterId={tutorPayload?.masterId ?? ""}
                payload={tutorPayload}
            />

            {toolbar ? (
                <HighlightToolbar
                    x={toolbar.x}
                    y={toolbar.y}
                    hasHighlightId={false}
                    selectedText={toolbar.selectedText}
                    onHighlight={() => setToolbar(null)}
                    onUnhighlight={() => setToolbar(null)}
                    onFlashcard={handleFlashcard}
                    showHighlightButtons={false}
                    preserveEditorSelectionOnToolbarMouseDown
                />
            ) : null}

            {flashcardWord ? (
                <AddFlashcardModal
                    initialWord={flashcardWord}
                    onClose={() => setFlashcardWord(null)}
                />
            ) : null}
        </div>
    );
}
