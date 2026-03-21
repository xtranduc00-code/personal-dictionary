"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, GraduationCap, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/lib/auth-context";
import {
    apiCreateSavedTopic,
    apiDeleteSavedTopic,
    apiImportLocalTopicsIfEmpty,
    apiListSavedTopics,
    apiRenameSavedTopic,
} from "@/lib/study-kit-saved-remote";
import {
    addStudyTopic,
    deleteStudyTopic,
    loadStudyTopics,
    updateStudyTopic,
    type StudySavedTopic,
} from "@/lib/study-kit-saved";

function sheetCountLabel(n: number, t: (k: import("@/lib/i18n").TranslationKey) => string) {
    return n === 1 ? t("studyKitSheetSingular") : t("studyKitSheetPlural").replace("{n}", String(n));
}

function StudyTopicFolder({
    topic,
    onRename,
    onDelete,
    t,
}: {
    topic: StudySavedTopic;
    onRename: (name: string) => void;
    onDelete: () => void;
    t: (key: import("@/lib/i18n").TranslationKey) => string;
}) {
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(topic.name);
    const n = topic.sheetCount ?? topic.sheets.length;

    function saveRename() {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== topic.name)
            onRename(trimmed);
        setEditing(false);
        setEditName(topic.name);
    }

    return (
        <li className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <Link
                href={`/study-kit/saved/${topic.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 no-underline"
            >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <FolderOpen className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                </span>
                <div className="min-w-0 flex-1">
                    {editing ? (
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={saveRename}
                            onKeyDown={(e) => {
                                if (e.key === "Enter")
                                    saveRename();
                                if (e.key === "Escape")
                                    setEditing(false);
                            }}
                            autoFocus
                            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                            onClick={(e) => e.preventDefault()}
                        />
                    ) : (
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                            {topic.name}
                        </p>
                    )}
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {sheetCountLabel(n, t)}
                    </p>
                </div>
            </Link>
            {!editing ? (
                <div className="flex shrink-0 gap-0.5">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            setEditing(true);
                            setEditName(topic.name);
                        }}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        title={t("renameTopicTitle")}
                        aria-label={t("ariaRenameTopic")}
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            onDelete();
                        }}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                        title={t("deleteTopicTitle")}
                        aria-label={t("ariaDeleteTopic")}
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            ) : null}
        </li>
    );
}

export default function StudyKitSavedPage() {
    const { t } = useI18n();
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const [topics, setTopics] = useState<StudySavedTopic[]>([]);
    const [newTopicName, setNewTopicName] = useState("");
    const [adding, setAdding] = useState(false);
    const [mounted, setMounted] = useState(false);
    /** False until local or server topics have been loaded for the current auth mode. */
    const [listReady, setListReady] = useState(false);

    const refreshLocal = useCallback(() => {
        setTopics(loadStudyTopics());
    }, []);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted || authLoading)
            return;
        let cancelled = false;
        (async () => {
            if (!user) {
                refreshLocal();
                if (!cancelled)
                    setListReady(true);
                return;
            }
            setListReady(false);
            let list = await apiListSavedTopics();
            if (cancelled)
                return;
            if (list.length === 0) {
                const local = loadStudyTopics();
                if (local.length > 0) {
                    const imp = await apiImportLocalTopicsIfEmpty(local);
                    if (cancelled)
                        return;
                    if (imp === "imported")
                        toast.success(t("studyKitSavedRestoredFromBrowser"));
                    else if (imp === "failed")
                        toast.error(t("studyKitSavedLoadServerErr"));
                    list = await apiListSavedTopics();
                }
            }
            if (cancelled)
                return;
            setTopics(list);
            setListReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [mounted, authLoading, user, refreshLocal, t]);

    async function handleAddTopic() {
        const name = newTopicName.trim();
        if (!name)
            return;
        if (user) {
            const row = await apiCreateSavedTopic(name);
            if (!row) {
                toast.warning(t("studyKitTopicLimit"));
                return;
            }
            setNewTopicName("");
            setAdding(false);
            setTopics(await apiListSavedTopics());
            return;
        }
        const row = addStudyTopic(name);
        if (!row) {
            toast.warning(t("studyKitTopicLimit"));
            return;
        }
        setNewTopicName("");
        setAdding(false);
        refreshLocal();
    }

    async function handleRenameTopic(id: string, name: string) {
        if (user) {
            const ok = await apiRenameSavedTopic(id, name);
            if (!ok) {
                toast.error(t("studyKitSavedLoadServerErr"));
                return;
            }
            setTopics(await apiListSavedTopics());
            return;
        }
        updateStudyTopic(id, name);
        refreshLocal();
    }

    async function handleDeleteTopic(id: string) {
        if (typeof window === "undefined" || !window.confirm(t("studyKitConfirmDeleteSubject")))
            return;
        if (user) {
            const ok = await apiDeleteSavedTopic(id);
            if (!ok) {
                toast.error(t("studyKitSavedLoadServerErr"));
                return;
            }
            setTopics(await apiListSavedTopics());
            return;
        }
        deleteStudyTopic(id);
        refreshLocal();
    }

    if (!mounted || authLoading || !listReady)
        return (
            <div className="mx-auto flex max-w-4xl justify-center px-4 py-16 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            </div>
        );

    return (
        <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                    <GraduationCap className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                        {t("studyKitSavedTitle")}
                    </h1>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {t(user ? "studyKitSavedIntroCloud" : "studyKitSavedIntro")}
                </p>
                <button
                    type="button"
                    onClick={() => router.push("/study-kit")}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                    {t("studyKitBackToForm")}
                </button>
            </section>

            <section>
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {t("topics")}
                    </h2>
                    {!adding ? (
                        <button
                            type="button"
                            onClick={() => setAdding(true)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                        >
                            <Plus className="h-4 w-4" />
                            {t("newTopic")}
                        </button>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                type="text"
                                placeholder={t("topicNamePlaceholder")}
                                value={newTopicName}
                                onChange={(e) => setNewTopicName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                        handleAddTopic();
                                    if (e.key === "Escape")
                                        setAdding(false);
                                }}
                                autoFocus
                                className="h-9 w-56 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                            />
                            <button
                                type="button"
                                onClick={handleAddTopic}
                                disabled={!newTopicName.trim()}
                                className="h-9 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                            >
                                {t("add")}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAdding(false);
                                    setNewTopicName("");
                                }}
                                className="h-9 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                            >
                                {t("cancel")}
                            </button>
                        </div>
                    )}
                </div>

                {!topics.length && !adding ? (
                    <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                        {t("noTopicsYet")}
                    </p>
                ) : null}

                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {topics.map((topic) => (
                        <StudyTopicFolder
                            key={topic.id}
                            topic={topic}
                            onRename={(name) => handleRenameTopic(topic.id, name)}
                            onDelete={() => handleDeleteTopic(topic.id)}
                            t={t}
                        />
                    ))}
                </ul>
            </section>
        </div>
    );
}
