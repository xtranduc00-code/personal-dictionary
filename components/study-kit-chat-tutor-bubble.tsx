"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { StudyKitChatMarkdown } from "@/components/study-kit-chat-markdown";

export function StudyKitChatTutorBubble({
    content,
    onSave,
    onDelete,
}: {
    content: string;
    onSave: (next: string) => void;
    onDelete: () => void;
}) {
    const { t } = useI18n();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(content);

    useEffect(() => {
        if (!editing)
            setDraft(content);
    }, [content, editing]);

    const save = () => {
        const next = draft.trim();
        if (!next) {
            toast.warning(t("studyKitChatEmptyReply"));
            return;
        }
        onSave(next);
        setEditing(false);
    };

    const cancel = () => {
        setDraft(content);
        setEditing(false);
    };

    const rows = Math.min(18, Math.max(4, draft.split("\n").length + 2));

    return (
        <>
            <div className="mb-0.5 flex items-start justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-zinc-500">
                    {t("studyKitChatTutor")}
                </span>
                {!editing ? (
                    <div className="flex shrink-0 gap-0.5">
                        <button
                            type="button"
                            onClick={() => {
                                setDraft(content);
                                setEditing(true);
                            }}
                            className="rounded p-1 text-[#64748B] transition hover:bg-zinc-200/80 hover:text-[#334155] dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            title={t("studyKitChatEditReply")}
                            aria-label={t("studyKitChatEditReply")}
                        >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            className="rounded p-1 text-[#64748B] transition hover:bg-rose-100/90 hover:text-rose-800 dark:text-zinc-500 dark:hover:bg-rose-950/50 dark:hover:text-rose-200"
                            title={t("studyKitChatDeleteReply")}
                            aria-label={t("studyKitChatDeleteReply")}
                        >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    </div>
                ) : null}
            </div>
            {editing ? (
                <div className="space-y-2">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={rows}
                        spellCheck
                        className="w-full resize-y rounded-lg border border-zinc-200/90 bg-white px-2.5 py-2 font-mono text-[12px] leading-relaxed text-[#0f172a] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-zinc-900/70 dark:text-zinc-100 dark:focus:border-sky-500/50"
                    />
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={save}
                            className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 dark:bg-sky-600 dark:hover:bg-sky-500"
                        >
                            {t("studyKitChatSaveReply")}
                        </button>
                        <button
                            type="button"
                            onClick={cancel}
                            className="rounded-lg border border-zinc-200/90 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-[#475569] hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                            {t("studyKitChatCancelEdit")}
                        </button>
                    </div>
                </div>
            ) : (
                <StudyKitChatMarkdown markdown={content} />
            )}
        </>
    );
}
