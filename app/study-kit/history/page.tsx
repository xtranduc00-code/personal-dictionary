"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, FileEdit, Sparkles } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, useAuth } from "@/lib/auth-context";

type Row = {
    id: string;
    title: string;
    preview: string;
    truncated: boolean;
    updatedAt: string;
};

const pageShell =
    "-mx-4 w-[calc(100%+2rem)] bg-[#F6F7F9] pb-20 pt-1 antialiased md:-mx-8 md:w-[calc(100%+4rem)] md:pb-24 dark:bg-[#0a0a0b]";

export default function StudyKitHistoryPage() {
    const { t } = useI18n();
    const router = useRouter();
    const { user, openAuthModal } = useAuth();
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);

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

    return (
        <div className={pageShell} style={{ minHeight: "calc(100dvh - 3.5rem)" }}>
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <div className="mb-8">
                    <Link
                        href="/study-kit"
                        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#64748B] transition hover:text-[#334155] dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        {t("studyKitBackToForm")}
                    </Link>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200/90 bg-blue-50/90 px-3 py-1 text-xs font-semibold text-blue-800 dark:border-sky-500/25 dark:bg-sky-950/40 dark:text-sky-200">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        {t("studyKit")}
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] dark:text-zinc-50">
                        {t("studyKitSessionHistory")}
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-[#64748B] dark:text-zinc-400">
                        {t("studyKitHistoryPageHint")}
                    </p>
                </div>

                {!user ? (
                    <p className="rounded-xl border border-blue-200/90 bg-blue-50/90 px-4 py-3 text-sm text-blue-950 dark:border-sky-500/25 dark:bg-sky-950/35 dark:text-sky-100">
                        {t("studyKitHistorySignIn")}{" "}
                        <button
                            type="button"
                            onClick={() => openAuthModal()}
                            className="font-semibold underline decoration-blue-800/30 underline-offset-2 hover:no-underline dark:decoration-sky-200/30"
                        >
                            {t("logIn")}
                        </button>
                    </p>
                ) : loading ? (
                    <p className="text-sm text-[#64748B] dark:text-zinc-400">{t("loading")}</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-[#64748B] dark:text-zinc-400">{t("studyKitHistoryEmpty")}</p>
                ) : (
                    <ul className="space-y-3">
                        {rows.map((row) => (
                            <li
                                key={row.id}
                                className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950/40"
                            >
                                <p className="font-semibold text-[#0f172a] dark:text-zinc-100">{row.title}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-[#64748B] dark:text-zinc-400">
                                    {row.preview}
                                    {row.truncated ? `… (${t("studyKitSavedTruncatedTag")})` : ""}
                                </p>
                                <p className="mt-2 text-[10px] text-[#94A3B8] dark:text-zinc-500">
                                    {t("studyKitHistoryUpdated")}{" "}
                                    {new Date(row.updatedAt).toLocaleString()}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(`/study-kit/result?session=${encodeURIComponent(row.id)}`)
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 dark:bg-sky-600 dark:hover:bg-sky-500"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                        {t("studyKitHistoryOpenSheet")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(`/study-kit?resume=${encodeURIComponent(row.id)}`)
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/90 bg-zinc-50 px-3 py-2 text-xs font-semibold text-[#334155] transition hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    >
                                        <FileEdit className="h-3.5 w-3.5" aria-hidden />
                                        {t("studyKitHistoryRestoreForm")}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
