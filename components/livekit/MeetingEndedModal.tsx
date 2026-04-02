"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { authFetch } from "@/lib/auth-context";
import { downloadBlobAsFile, downloadMeetChatTxt } from "@/lib/meets-download-chat";
import { safeMeetFileBase } from "@/lib/meets-format";
import { MEETS_MODAL_ACTION_BTN_CLASS } from "@/lib/meets-ui-classes";
import type { PendingMeetRecording } from "@/lib/use-meets-local-recording";

type Props = {
    roomDisplayName: string;
    open: boolean;
    onDismiss: () => void;
    pendingRecording: PendingMeetRecording | null;
};

export const MeetingEndedModal = memo(function MeetingEndedModal({
    roomDisplayName,
    open,
    onDismiss,
    pendingRecording,
}: Props) {
    const { t } = useI18n();
    const [chatBusy, setChatBusy] = useState(false);
    const [recBusy, setRecBusy] = useState(false);
    const [chatMessageCount, setChatMessageCount] = useState<number | null>(null);

    useEffect(() => {
        if (!open) {
            setChatMessageCount(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await authFetch(
                    `/api/meets/session/${encodeURIComponent(roomDisplayName)}`,
                );
                if (cancelled) {
                    return;
                }
                if (!res.ok) {
                    setChatMessageCount(0);
                    return;
                }
                const data = (await res.json()) as { chatMessageCount?: number };
                const n = data.chatMessageCount;
                setChatMessageCount(typeof n === "number" && n > 0 ? n : 0);
            }
            catch {
                if (!cancelled) {
                    setChatMessageCount(0);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, roomDisplayName]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onDismiss();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onDismiss]);

    const onDownloadChat = useCallback(async () => {
        setChatBusy(true);
        try {
            const ok = await downloadMeetChatTxt(roomDisplayName);
            if (ok) {
                toast.success(t("meetsChatExported"));
            }
            else {
                toast.error(t("meetsChatExportFailed"));
            }
        }
        finally {
            setChatBusy(false);
        }
    }, [roomDisplayName, t]);

    const onDownloadRecording = useCallback(() => {
        if (!pendingRecording) {
            return;
        }
        setRecBusy(true);
        try {
            const name = `meet-${safeMeetFileBase(roomDisplayName)}-${Date.now()}.webm`;
            downloadBlobAsFile(pendingRecording.blob, name);
            toast.success(t("meetsRecordingSavedLocal"));
        }
        finally {
            setRecBusy(false);
        }
    }, [pendingRecording, roomDisplayName, t]);

    if (!open) {
        return null;
    }

    const showChatDownload = chatMessageCount !== null && chatMessageCount > 0;
    const showRecordingDownload = Boolean(pendingRecording && pendingRecording.blob.size > 0);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/35 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meet-ended-title"
        >
            <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label={t("close")}
                onClick={onDismiss}
            />
            <div
                className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2
                    id="meet-ended-title"
                    className="text-lg font-semibold text-zinc-900"
                >
                    {t("meetsEndedTitle")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                    {t("meetsEndedSubtitle")}
                </p>
                {showRecordingDownload ? (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                        {t("meetsEndedRecordingNote")}
                    </p>
                ) : null}

                <div className="mt-6 flex flex-col gap-2">
                    {showRecordingDownload ? (
                        <button
                            type="button"
                            disabled={recBusy}
                            onClick={onDownloadRecording}
                            className={MEETS_MODAL_ACTION_BTN_CLASS}
                        >
                            <Download className="h-4 w-4 shrink-0 text-red-600" strokeWidth={2} />
                            {recBusy ? t("meetsEndedDownloading") : t("meetsEndedDownloadRecording")}
                        </button>
                    ) : null}
                    {showChatDownload ? (
                        <button
                            type="button"
                            disabled={chatBusy}
                            onClick={() => void onDownloadChat()}
                            className={MEETS_MODAL_ACTION_BTN_CLASS}
                        >
                            <Download className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={2} />
                            {chatBusy ? t("meetsEndedDownloading") : t("meetsEndedDownloadChat")}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
                    >
                        {t("meetsEndedBackToHub")}
                    </button>
                </div>
            </div>
        </div>
    );
});
