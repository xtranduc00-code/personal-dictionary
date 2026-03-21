"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft,
    ExternalLink,
    FileText,
    Loader2,
    Pencil,
    Trash2,
} from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/lib/auth-context";
import {
    apiDeleteSheet,
    apiFetchSavedTopic,
    apiUpdateSheet,
} from "@/lib/study-kit-saved-remote";
import {
    deleteSheetFromTopic,
    getStudyTopic,
    updateSheetInTopic,
    type StudySavedSheet,
    type StudySavedTopic,
} from "@/lib/study-kit-saved";

const STORAGE_KEY = "study-kit-result";
const STORAGE_TRUNCATED_KEY = "study-kit-truncated";

function formatSavedDate(iso: string, locale: string): string {
    try {
        const d = new Date(iso);
        return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(d);
    }
    catch {
        return iso;
    }
}

function SheetRow({
    topicId,
    sheet,
    locale,
    storage,
    onChanged,
    t,
}: {
    topicId: string;
    sheet: StudySavedSheet;
    locale: string;
    storage: "local" | "remote";
    onChanged: () => void;
    t: (k: import("@/lib/i18n").TranslationKey) => string;
}) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(sheet.title);
    const [editMd, setEditMd] = useState(sheet.markdown);

    useEffect(() => {
        setEditTitle(sheet.title);
        setEditMd(sheet.markdown);
    }, [sheet.title, sheet.markdown]);

    const openSheet = () => {
        try {
            sessionStorage.setItem(STORAGE_KEY, sheet.markdown);
            sessionStorage.setItem(
                STORAGE_TRUNCATED_KEY,
                sheet.truncated ? "true" : "false",
            );
            router.push("/study-kit/result");
        }
        catch {
            toast.error(t("studyKitSavedOpenErr"));
        }
    };

    const saveEdit = async () => {
        if (storage === "remote") {
            const ok = await apiUpdateSheet(topicId, sheet.id, {
                title: editTitle,
                markdown: editMd,
            });
            if (!ok) {
                toast.error(t("studyKitSheetUpdateErr"));
                return;
            }
        }
        else {
            const ok = updateSheetInTopic(topicId, sheet.id, {
                title: editTitle,
                markdown: editMd,
            });
            if (!ok) {
                toast.error(t("studyKitSheetUpdateErr"));
                return;
            }
        }
        setEditing(false);
        onChanged();
    };

    const remove = async () => {
        if (typeof window === "undefined" || !window.confirm(t("studyKitConfirmDeleteSheet")))
            return;
        if (storage === "remote") {
            const ok = await apiDeleteSheet(topicId, sheet.id);
            if (!ok) {
                toast.error(t("studyKitSheetUpdateErr"));
                return;
            }
        }
        else {
            deleteSheetFromTopic(topicId, sheet.id);
        }
        onChanged();
        toast.info(t("studyKitSavedRemoved"));
    };

    return (
        <li className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            {editing ? (
                <div className="space-y-2">
                    <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <textarea
                        value={editMd}
                        onChange={(e) => setEditMd(e.target.value)}
                        rows={10}
                        className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs leading-relaxed dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={saveEdit}
                            className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                        >
                            {t("saveLabel")}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setEditing(false);
                                setEditTitle(sheet.title);
                                setEditMd(sheet.markdown);
                            }}
                            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                        >
                            {t("cancel")}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {sheet.title}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            {formatSavedDate(sheet.savedAt, locale)}
                            {sheet.truncated ? (
                                <span className="ml-2 rounded bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                                    {t("studyKitSavedTruncatedTag")}
                                </span>
                            ) : null}
                        </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                        <button
                            type="button"
                            onClick={openSheet}
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950 dark:hover:text-blue-300"
                            title={t("studyKitSavedOpen")}
                            aria-label={t("studyKitSavedOpen")}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                            title={t("editLabel")}
                            aria-label={t("editLabel")}
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={remove}
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                            title={t("deleteButton")}
                            aria-label={t("deleteButton")}
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </li>
    );
}

export default function StudyKitSavedTopicPage() {
    const params = useParams();
    const topicId = typeof params.topicId === "string" ? params.topicId : "";
    const { t, locale } = useI18n();
    const { user, isLoading: authLoading } = useAuth();
    const [topic, setTopic] = useState<StudySavedTopic | null>(null);
    const [mounted, setMounted] = useState(false);
    const [topicReady, setTopicReady] = useState(false);

    const refresh = useCallback(async () => {
        if (!topicId) {
            setTopic(null);
            return;
        }
        if (user)
            setTopic(await apiFetchSavedTopic(topicId));
        else
            setTopic(getStudyTopic(topicId) ?? null);
    }, [topicId, user]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted || authLoading)
            return;
        let cancelled = false;
        (async () => {
            if (!topicId) {
                setTopic(null);
                if (!cancelled)
                    setTopicReady(true);
                return;
            }
            if (user)
                setTopicReady(false);
            await refresh();
            if (!cancelled)
                setTopicReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [mounted, authLoading, topicId, user, refresh]);

    if (!mounted || authLoading || !topicReady)
        return (
            <div className="mx-auto flex max-w-4xl justify-center px-4 py-16 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            </div>
        );

    if (!topicId || !topic) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                <p>{t("studyKitTopicNotFound")}</p>
                <Link
                    href="/study-kit/saved"
                    className="mt-4 inline-block text-blue-600 hover:underline dark:text-sky-400"
                >
                    {t("studyKitBackToSubjects")}
                </Link>
            </div>
        );
    }

    const sheets = [...topic.sheets].sort(
        (a, b) =>
            new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );

    return (
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
            <div>
                <Link
                    href="/study-kit/saved"
                    className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t("studyKitBackToSubjects")}
                </Link>
                <div className="mt-4 flex items-center gap-2">
                    <FileText className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                        {topic.name}
                    </h1>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {t("studyKitSheetsInSubjectHint")}
                </p>
            </div>

            {sheets.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                    {t("studyKitNoSheetsYet")}
                </p>
            ) : (
                <ul className="space-y-2">
                    {sheets.map((s) => (
                        <SheetRow
                            key={s.id}
                            topicId={topicId}
                            sheet={s}
                            locale={locale}
                            storage={user ? "remote" : "local"}
                            onChanged={() => void refresh()}
                            t={t}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
