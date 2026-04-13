"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import {
    buildRoomRecordingStream,
    chooseWebmMimeType,
    type ComposedRecordingHandle,
} from "@/lib/meets-local-recording";
import { MEETS_SCREEN_SHARE_CAPTURE } from "@/lib/meets-livekit-options";
import { downloadBlobAsFile } from "@/lib/meets-download-chat";
import { safeMeetFileBase } from "@/lib/meets-format";
import { convertWebmToMp4 } from "@/lib/meets-convert-webm-to-mp4";

export type PendingMeetRecording = {
    blob: Blob;
    mimeType: string;
};

function makeRecordingFilenameBase(roomDisplayName: string): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `meeting-${safeMeetFileBase(roomDisplayName)}-${ts}`;
}

async function convertAndDownload(
    webmBlob: Blob,
    baseName: string,
): Promise<PendingMeetRecording> {
    const toastId = toast.loading("Converting to MP4… 0%");
    try {
        const mp4Blob = await convertWebmToMp4(webmBlob, (percent) => {
            toast.update(toastId, {
                render: `Converting to MP4… ${percent}%`,
                isLoading: true,
            });
        });
        toast.update(toastId, {
            render: "Saved as MP4",
            type: "success",
            isLoading: false,
            autoClose: 3000,
        });
        downloadBlobAsFile(mp4Blob, `${baseName}.mp4`);
        return { blob: mp4Blob, mimeType: "video/mp4" };
    } catch {
        toast.update(toastId, {
            render: "MP4 conversion failed — saved as .webm instead",
            type: "warning",
            isLoading: false,
            autoClose: 4000,
        });
        downloadBlobAsFile(webmBlob, `${baseName}.webm`);
        return { blob: webmBlob, mimeType: webmBlob.type || "video/webm" };
    }
}

export function useMeetsLocalRecording(roomDisplayName?: string) {
    const { t } = useI18n();
    const room = useRoomContext();

    const [isRecording, setIsRecording] = useState(false);
    const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
    const [busyRec, setBusyRec] = useState<"start" | "stop" | null>(null);
    const [pendingRecording, setPendingRecording] = useState<PendingMeetRecording | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const composedHandleRef = useRef<ComposedRecordingHandle | null>(null);
    const onStopWaitersRef = useRef<Array<() => void>>([]);
    const roomDisplayNameRef = useRef(roomDisplayName ?? "");
    roomDisplayNameRef.current = roomDisplayName ?? "";

    const flushStopWaiters = useCallback(() => {
        const waiters = onStopWaitersRef.current;
        onStopWaitersRef.current = [];
        waiters.forEach((fn) => fn());
    }, []);

    useEffect(() => {
        if (!isRecording) return;
        setRecordingElapsedSec(0);
        const id = window.setInterval(() => {
            setRecordingElapsedSec((s) => s + 1);
        }, 1000);
        return () => window.clearInterval(id);
    }, [isRecording]);

    const clearPendingRecording = useCallback(() => {
        setPendingRecording(null);
    }, []);

    const cleanupComposed = useCallback(() => {
        const handle = composedHandleRef.current;
        if (!handle) return;
        handle.cleanup();
        // If we started screen share for recording, stop it
        if (handle.ownsScreenShare) {
            try {
                void room.localParticipant.setScreenShareEnabled(false);
            } catch { /* */ }
        }
        composedHandleRef.current = null;
    }, [room]);

    const startRecording = useCallback(async () => {
        setBusyRec("start");
        try {
            const handle = await buildRoomRecordingStream(room, MEETS_SCREEN_SHARE_CAPTURE);
            if (!handle) {
                toast.error(t("meetsRecordingNeedMedia"));
                return;
            }

            composedHandleRef.current = handle;

            const mimeType = chooseWebmMimeType();
            let mr: MediaRecorder;
            try {
                mr = mimeType
                    ? new MediaRecorder(handle.stream, { mimeType })
                    : new MediaRecorder(handle.stream);
            } catch {
                cleanupComposed();
                toast.error(t("meetsRecordingStartFailed"));
                return;
            }

            chunksRef.current = [];
            mr.ondataavailable = (ev) => {
                if (ev.data.size > 0) chunksRef.current.push(ev.data);
            };
            mr.onstop = () => {
                const type = mr.mimeType || mimeType || "video/webm";
                const blob = new Blob(chunksRef.current, { type });
                chunksRef.current = [];
                recorderRef.current = null;
                cleanupComposed();
                setIsRecording(false);
                setBusyRec(null);

                if (blob.size < 1) {
                    toast.warning(t("meetsRecordingEmpty"));
                    flushStopWaiters();
                    return;
                }
                toast.success(t("meetsToastRecordingStopped"));
                const baseName = makeRecordingFilenameBase(roomDisplayNameRef.current);
                void convertAndDownload(blob, baseName).then((pending) => {
                    setPendingRecording(pending);
                });
                flushStopWaiters();
            };
            mr.onerror = () => {
                toast.error(t("meetsRecordingStartFailed"));
                recorderRef.current = null;
                cleanupComposed();
                setIsRecording(false);
                setBusyRec(null);
                flushStopWaiters();
            };

            mr.start(1000);
            recorderRef.current = mr;
            setIsRecording(true);
            toast.success(t("meetsToastRecordingStarted"));
        } finally {
            setBusyRec(null);
        }
    }, [room, flushStopWaiters, cleanupComposed, t]);

    const stopRecording = useCallback((): Promise<void> => {
        const mr = recorderRef.current;
        if (!mr || mr.state !== "recording") {
            cleanupComposed();
            setIsRecording(false);
            return Promise.resolve();
        }
        setBusyRec("stop");
        return new Promise<void>((resolve) => {
            const done = () => {
                setBusyRec(null);
                resolve();
            };
            onStopWaitersRef.current.push(done);
            try {
                mr.stop();
            } catch {
                onStopWaitersRef.current = onStopWaitersRef.current.filter((f) => f !== done);
                cleanupComposed();
                setBusyRec(null);
                resolve();
            }
        });
    }, [cleanupComposed]);

    useEffect(() => {
        return () => {
            const mr = recorderRef.current;
            if (mr && mr.state === "recording") {
                try { mr.stop(); } catch { /* */ }
            }
            composedHandleRef.current?.cleanup();
            composedHandleRef.current = null;
        };
    }, []);

    return {
        isRecording,
        recordingElapsedSec,
        busyRec,
        startRecording,
        stopRecording,
        pendingRecording,
        clearPendingRecording,
    };
}
