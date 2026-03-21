"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, FileEdit } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, useAuth } from "@/lib/auth-context";

type Row = {
    id: string;
    title: string;
    preview: string;
    truncated: boolean;
    updatedAt: string;
};

const PAGE_SIZE = 20;

/** Match `app/history/page.tsx` — search + selects + focus rings. */
const historyInputClass =
    "h-11 rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-700";

const historySelectClass =
    "h-11 rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-300 dark:focus:ring-zinc-700";

export default function StudyKitHistoryPage() {
    const { t } = useI18n();
    const router = useRouter();
    const { user, openAuthModal } = useAuth();
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
    const [page, setPage] = useState(1);

    const load = useCallback(() => {
        if (!user) {
            setRows([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        authFetch("/api/study-kit/sessions")
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { sessions?: Row[] } | null) => {
                if (data?.sessions)
                    setRows(data.sessions);
                else
                    setRows([]);
            })
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    }, [user]);

    useEffect(() => {
        load();
    }, [load]);

    const sortedRows = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const ta = new Date(a.updatedAt).getTime();
            const tb = new Date(b.updatedAt).getTime();
            return sortOrder === "newest" ? tb - ta : ta - tb;
        });
        return copy;
    }, [rows, sortOrder]);

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q)
            return sortedRows;
        return sortedRows.filter(
            (r) =>
                r.title.toLowerCase().includes(q) ||
                r.preview.toLowerCase().includes(q),
        );
    }, [sortedRows, search]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

    const paginatedRows = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filteredRows.slice(start, start + PAGE_SIZE);
    }, [filteredRows, page]);

    useEffect(() => {
        setPage(1);
    }, [search, sortOrder]);

    useEffect(() => {
        if (page > totalPages)
            setPage(totalPages);
    }, [page, totalPages]);

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <Link
                href="/study-kit"
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                {t("studyKitBackToForm")}
            </Link>

            {!user ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="text-base text-zinc-600 dark:text-zinc-400">
                        {t("studyKitHistorySignIn")}{" "}
                        <button
                            type="button"
                            onClick={() => openAuthModal()}
                            className="font-semibold text-zinc-900 underline decoration-zinc-400 underline-offset-2 hover:no-underline dark:text-zinc-100 dark:decoration-zinc-600"
                        >
                            {t("logIn")}
                        </button>
                    </p>
                </section>
            ) : loading ? (
                <p className="text-base text-zinc-600 dark:text-zinc-400">{t("loading")}</p>
            ) : rows.length === 0 ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                        {t("studyKitSessionHistory")}
                    </h1>
                    <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
                        {t("studyKitHistoryPageHint")}
                    </p>
                    <p className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-6 text-base text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                        {t("studyKitHistoryEmpty")}
                    </p>
                </section>
            ) : (
                <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                        {t("studyKitSessionHistory")}
                    </h1>
                    <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
                        {t("studyKitHistoryPageHint")}
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_140px_140px]">
                        <input
                            type="search"
                            placeholder={t("searchHistory")}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className={historyInputClass}
                            autoComplete="off"
                        />
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                            className={historySelectClass}
                            aria-label={t("studyKitHistorySortLabel")}
                        >
                            <option value="newest">{t("studyKitHistorySortNewest")}</option>
                            <option value="oldest">{t("studyKitHistorySortOldest")}</option>
                        </select>
                        <select
                            defaultValue="all"
                            className={historySelectClass}
                            aria-label={t("studyKitHistoryScopeAll")}
                        >
                            <option value="all">{t("studyKitHistoryScopeAll")}</option>
                        </select>
                    </div>

                    {filteredRows.length > 0 && (
                        <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                {t("showingPagination")
                                    .replace("{from}", String((page - 1) * PAGE_SIZE + 1))
                                    .replace("{to}", String(Math.min(page * PAGE_SIZE, filteredRows.length)))
                                    .replace("{total}", String(filteredRows.length))}
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                    aria-label={t("previousPage")}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="flex items-center gap-1 px-2">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter((p) => {
                                            if (totalPages <= 7)
                                                return true;
                                            if (p === 1 || p === totalPages)
                                                return true;
                                            if (Math.abs(p - page) <= 1)
                                                return true;
                                            return false;
                                        })
                                        .reduce<number[]>((acc, p, i, arr) => {
                                            if (i > 0 && p - (arr[i - 1] ?? 0) > 1)
                                                acc.push(-1);
                                            acc.push(p);
                                            return acc;
                                        }, [])
                                        .map((p, idx) =>
                                            p === -1 ? (
                                                <span key={`ellipsis-${idx}`} className="px-1 text-zinc-400">
                                                    …
                                                </span>
                                            ) : (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setPage(p)}
                                                    className={`h-9 min-w-[2.25rem] rounded-lg border px-2 text-sm font-medium transition ${p === page
                                                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                                                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}`}
                                                >
                                                    {p}
                                                </button>
                                            ),
                                        )}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                    aria-label={t("nextPage")}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="mt-5 space-y-4">
                        {filteredRows.length === 0 ? (
                            <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-base text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                                {t("studyKitHistoryNoSearchMatches")}
                            </p>
                        ) : (
                            paginatedRows.map((row) => (
                                <article
                                    key={row.id}
                                    className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                                >
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0">
                                            <p className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                                                {row.title}
                                            </p>
                                            <p className="mt-2 line-clamp-2 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                                                {row.preview}
                                                {row.truncated ? `… (${t("studyKitSavedTruncatedTag")})` : ""}
                                            </p>
                                            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
                                                {t("studyKitHistoryUpdated")}{" "}
                                                {new Date(row.updatedAt).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    router.push(`/study-kit/result?session=${encodeURIComponent(row.id)}`)
                                                }
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                            >
                                                <ExternalLink className="h-4 w-4" aria-hidden />
                                                {t("studyKitHistoryOpenSheet")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    router.push(`/study-kit?resume=${encodeURIComponent(row.id)}`)
                                                }
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                                            >
                                                <FileEdit className="h-4 w-4" aria-hidden />
                                                {t("studyKitHistoryRestoreForm")}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
