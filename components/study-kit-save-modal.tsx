"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/lib/auth-context";
import {
    apiCreateSavedTopic,
    apiListSavedTopics,
    apiMergeOrAddSheet,
} from "@/lib/study-kit-saved-remote";
import {
    addSheetToTopic,
    addStudyTopic,
    defaultTitleFromMarkdown,
    findMergeCandidateSheet,
    loadStudyTopics,
    mergeIntoExistingSheet,
    type StudySavedTopic,
} from "@/lib/study-kit-saved";

export function StudyKitSaveToFolderModal({
    open,
    onClose,
    summary,
    truncated,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    summary: string;
    truncated: boolean;
    onSaved?: () => void;
}) {
    const { t } = useI18n();
    const { user } = useAuth();
    const [topics, setTopics] = useState<StudySavedTopic[]>([]);
    const [topicId, setTopicId] = useState("");
    const [newSubjectName, setNewSubjectName] = useState("");
    const [sheetTitle, setSheetTitle] = useState("");
    const [mergeSameTitle, setMergeSameTitle] = useState(true);

    useEffect(() => {
        if (!open)
            return;
        const defTitle = defaultTitleFromMarkdown(summary);
        setSheetTitle(defTitle);
        setNewSubjectName("");
        setMergeSameTitle(true);
        let cancelled = false;
        (async () => {
            const list = user ? await apiListSavedTopics() : loadStudyTopics();
            if (cancelled)
                return;
            setTopics(list);
            setTopicId(list[0]?.id ?? "");
        })();
        return () => {
            cancelled = true;
        };
    }, [open, summary, user]);

    if (!open)
        return null;

    const refreshTopics = async () => {
        const list = user ? await apiListSavedTopics() : loadStudyTopics();
        setTopics(list);
        if (!list.some((x) => x.id === topicId))
            setTopicId(list[0]?.id ?? "");
    };

    const handleSave = async () => {
        let tid = topicId;
        const newName = newSubjectName.trim();
        if (newName) {
            if (user) {
                const created = await apiCreateSavedTopic(newName);
                if (!created) {
                    toast.warning(t("studyKitTopicLimit"));
                    return;
                }
                tid = created.id;
                await refreshTopics();
            }
            else {
                const created = addStudyTopic(newName);
                if (!created) {
                    toast.warning(t("studyKitTopicLimit"));
                    return;
                }
                tid = created.id;
                await refreshTopics();
            }
            setNewSubjectName("");
        }
        if (!tid) {
            toast.info(t("studyKitSaveNoSubjectsYet"));
            return;
        }
        const title = sheetTitle.trim() || defaultTitleFromMarkdown(summary);
        if (user) {
            const result = await apiMergeOrAddSheet(tid, {
                title,
                markdown: summary,
                truncated,
                mergeSameTitle,
            });
            if (result === "failed") {
                toast.warning(t("studyKitSheetLimit"));
                return;
            }
            toast.success(
                result === "merged" ? t("studyKitSavedMergedToast") : t("studyKitSavedToast"),
            );
            onSaved?.();
            onClose();
            return;
        }
        if (mergeSameTitle) {
            const existing = findMergeCandidateSheet(tid, title);
            if (existing) {
                const ok = mergeIntoExistingSheet(tid, existing.id, {
                    title,
                    markdown: summary,
                    truncated,
                });
                if (!ok) {
                    toast.warning(t("studyKitSheetLimit"));
                    return;
                }
                toast.success(t("studyKitSavedMergedToast"));
                onSaved?.();
                onClose();
                return;
            }
        }
        const row = addSheetToTopic(tid, {
            title,
            markdown: summary,
            truncated,
        });
        if (!row) {
            toast.warning(t("studyKitSheetLimit"));
            return;
        }
        toast.success(t("studyKitSavedToast"));
        onSaved?.();
        onClose();
    };

    const canSave =
        Boolean(sheetTitle.trim() || defaultTitleFromMarkdown(summary)) &&
        (Boolean(topicId) || Boolean(newSubjectName.trim()));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-black/50"
                aria-label={t("ariaClose")}
                onClick={onClose}
            />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {t("studyKitSaveModalTitle")}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        aria-label={t("ariaClose")}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {t("studyKitSaveModalHint")}
                </p>

                <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("studyKitSaveSubjectLabel")}
                </label>
                {topics.length > 0 ? (
                    <select
                        value={topicId}
                        onChange={(e) => setTopicId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                        {topics.map((top) => (
                            <option key={top.id} value={top.id}>
                                {top.name}
                            </option>
                        ))}
                    </select>
                ) : (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {t("studyKitSaveNoSubjectsYet")}
                    </p>
                )}

                <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("studyKitSaveNewSubjectLabel")}
                </label>
                <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder={t("studyKitSaveNewSubjectPlaceholder")}
                    className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />

                <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("studyKitSaveSheetNameLabel")}
                </label>
                <input
                    type="text"
                    value={sheetTitle}
                    onChange={(e) => setSheetTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />

                <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                        type="checkbox"
                        checked={mergeSameTitle}
                        onChange={(e) => setMergeSameTitle(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300"
                    />
                    <span>{t("studyKitSaveMergeSameTitle")}</span>
                </label>

                <div className="mt-6 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!canSave}
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                        {t("studyKitSaveModalConfirm")}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                    >
                        {t("cancel")}
                    </button>
                </div>
            </div>
        </div>
    );
}
