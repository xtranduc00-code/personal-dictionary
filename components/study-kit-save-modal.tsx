"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { Tooltip } from "@/components/ui/Tooltip";
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

type SubjectMode = "existing" | "new";

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
    const [subjectMode, setSubjectMode] = useState<SubjectMode>("existing");
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
        void (async () => {
            const list = user ? await apiListSavedTopics() : loadStudyTopics();
            if (cancelled)
                return;
            setTopics(list);
            const firstId = list[0]?.id ?? "";
            setTopicId(firstId);
            setSubjectMode(list.length > 0 ? "existing" : "new");
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
        let tid = "";
        if (subjectMode === "existing") {
            tid = topicId;
            if (!tid) {
                toast.info(t("studyKitSaveNoSubjectsYet"));
                return;
            }
        }
        else {
            const newName = newSubjectName.trim();
            if (!newName) {
                toast.info(t("studyKitSaveNoSubjectsYet"));
                return;
            }
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

    const hasTopics = topics.length > 0;
    const canSave =
        Boolean(sheetTitle.trim() || defaultTitleFromMarkdown(summary)) &&
        (subjectMode === "existing" ? Boolean(topicId) : Boolean(newSubjectName.trim()));

    const radioClass =
        "mt-0.5 h-4 w-4 shrink-0 border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950";

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

                <fieldset className="mt-5 space-y-3 border-0 p-0">
                    <legend className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {t("studyKitSaveSubjectPickLabel")}
                    </legend>

                    {hasTopics ? (
                        <div className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent px-1 py-0.5 hover:border-zinc-200/80 dark:hover:border-zinc-600/80">
                            <input
                                id="study-kit-subj-existing"
                                type="radio"
                                name="study-kit-subject-mode"
                                checked={subjectMode === "existing"}
                                onChange={() => setSubjectMode("existing")}
                                className={radioClass}
                            />
                            <div className="min-w-0 flex-1">
                                <label
                                    htmlFor="study-kit-subj-existing"
                                    className="block cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200"
                                >
                                    {t("studyKitSaveSubjectExisting")}
                                </label>
                                {subjectMode === "existing" ? (
                                    <select
                                        value={topicId}
                                        onChange={(e) => setTopicId(e.target.value)}
                                        aria-label={t("studyKitSaveSubjectPickLabel")}
                                        className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                    >
                                        {topics.map((top) => (
                                            <option key={top.id} value={top.id}>
                                                {top.name}
                                            </option>
                                        ))}
                                    </select>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            {t("studyKitSaveNoSubjectsYet")}
                        </p>
                    )}

                    {hasTopics ? (
                        <div className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent px-1 py-0.5 hover:border-zinc-200/80 dark:hover:border-zinc-600/80">
                            <input
                                id="study-kit-subj-new"
                                type="radio"
                                name="study-kit-subject-mode"
                                checked={subjectMode === "new"}
                                onChange={() => setSubjectMode("new")}
                                className={radioClass}
                            />
                            <div className="min-w-0 flex-1">
                                <label
                                    htmlFor="study-kit-subj-new"
                                    className="block cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200"
                                >
                                    {t("studyKitSaveSubjectNew")}
                                </label>
                                {subjectMode === "new" ? (
                                    <input
                                        id="study-kit-new-subject"
                                        type="text"
                                        value={newSubjectName}
                                        onChange={(e) => setNewSubjectName(e.target.value)}
                                        placeholder={t("studyKitSaveNewSubjectPlaceholder")}
                                        aria-label={t("studyKitSaveNewSubjectLabel")}
                                        className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                                    />
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label
                                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                                htmlFor="study-kit-new-subject-only"
                            >
                                {t("studyKitSaveNewSubjectLabel")}
                            </label>
                            <input
                                id="study-kit-new-subject-only"
                                type="text"
                                value={newSubjectName}
                                onChange={(e) => setNewSubjectName(e.target.value)}
                                placeholder={t("studyKitSaveNewSubjectPlaceholder")}
                                className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                            />
                        </div>
                    )}
                </fieldset>

                <div className="mt-5">
                    <label
                        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                        htmlFor="study-kit-sheet-title"
                    >
                        {t("studyKitSaveSheetNameLabel")}
                    </label>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {t("studyKitSaveSheetNameHint")}
                    </p>
                    <input
                        id="study-kit-sheet-title"
                        type="text"
                        value={sheetTitle}
                        onChange={(e) => setSheetTitle(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                </div>

                <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                        type="checkbox"
                        checked={mergeSameTitle}
                        onChange={(e) => setMergeSameTitle(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300"
                    />
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 leading-snug">
                        <span>{t("studyKitSaveMergeShort")}</span>
                        <Tooltip content={t("studyKitSaveMergeHelp")} placement="top">
                            <button
                                type="button"
                                className="inline-flex shrink-0 rounded-full p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                                aria-label={t("studyKitSaveMergeHelpAria")}
                            >
                                <Info className="h-4 w-4" aria-hidden />
                            </button>
                        </Tooltip>
                    </span>
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
