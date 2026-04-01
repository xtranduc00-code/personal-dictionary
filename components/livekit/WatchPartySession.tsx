"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Copy, LogOut, RefreshCw } from "lucide-react";
import { LiveKitRoom, useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import {
    applyRemoteVideoState,
    encodeWatchSync,
    parseWatchSync,
    WATCH_SYNC_TOPIC,
    type WatchSyncEnvelope,
} from "@/lib/watch-party-protocol";
import { MEETS_LIVEKIT_ROOM_OPTIONS } from "@/lib/meets-livekit-options";

type SessionProps = {
    token: string;
    serverUrl: string;
    roomDisplayName: string;
};

export function WatchPartySession({ token, serverUrl, roomDisplayName }: SessionProps) {
    return (
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect
            audio={false}
            video={false}
            data-lk-theme="default"
            options={MEETS_LIVEKIT_ROOM_OPTIONS}
            className="!text-inherit flex min-h-0 w-full flex-1 flex-col text-[#111827] dark:text-zinc-100"
        >
            <WatchPartyInner roomDisplayName={roomDisplayName} />
        </LiveKitRoom>
    );
}

const SEEK_BROADCAST_MS = 220;

function WatchPartyInner({ roomDisplayName }: { roomDisplayName: string }) {
    const { t } = useI18n();
    const router = useRouter();
    const room = useRoomContext();
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [fileLabel, setFileLabel] = useState<string | null>(null);
    const applyingRemote = useRef(false);
    const lastSeekBroadcast = useRef(0);

    const publishState = useCallback(async () => {
        const v = videoRef.current;
        const lp = room.localParticipant;
        if (!v?.src || !lp || room.state !== ConnectionState.Connected) {
            return;
        }
        const msg: WatchSyncEnvelope = {
            v: 1,
            kind: "state",
            currentTime: v.currentTime,
            playing: !v.paused,
            sentAt: Date.now(),
        };
        try {
            await lp.publishData(encodeWatchSync(msg), {
                reliable: true,
                topic: WATCH_SYNC_TOPIC,
            });
        }
        catch {
            /* ignore */
        }
    }, [room]);

    const publishRequest = useCallback(async () => {
        const lp = room.localParticipant;
        if (!lp || room.state !== ConnectionState.Connected) {
            return;
        }
        const msg: WatchSyncEnvelope = { v: 1, kind: "req", sentAt: Date.now() };
        try {
            await lp.publishData(encodeWatchSync(msg), {
                reliable: true,
                topic: WATCH_SYNC_TOPIC,
            });
        }
        catch {
            /* ignore */
        }
    }, [room]);

    useEffect(() => {
        const onData = (
            payload: Uint8Array,
            participant?: { identity: string } | undefined,
            _kind?: unknown,
            topic?: string,
        ) => {
            if (topic !== WATCH_SYNC_TOPIC) {
                return;
            }
            if (!participant || participant.identity === room.localParticipant.identity) {
                return;
            }
            const msg = parseWatchSync(payload);
            if (!msg) {
                return;
            }
            if (msg.kind === "req") {
                void publishState();
                return;
            }
            const v = videoRef.current;
            if (!v?.src) {
                return;
            }
            applyingRemote.current = true;
            try {
                applyRemoteVideoState(v, msg.currentTime, msg.playing);
            }
            finally {
                window.requestAnimationFrame(() => {
                    applyingRemote.current = false;
                });
            }
        };

        room.on(RoomEvent.DataReceived, onData);
        return () => {
            room.off(RoomEvent.DataReceived, onData);
        };
    }, [room, publishState]);

    useEffect(() => {
        const onParticipantConnected = () => {
            void publishState();
        };
        room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
        return () => {
            room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
        };
    }, [room, publishState]);

    useEffect(() => {
        const askPeers = () => {
            if (room.remoteParticipants.size > 0) {
                void publishRequest();
            }
        };
        room.on(RoomEvent.Connected, askPeers);
        if (room.state === ConnectionState.Connected) {
            askPeers();
        }
        return () => {
            room.off(RoomEvent.Connected, askPeers);
        };
    }, [room, publishRequest]);

    useEffect(() => {
        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [objectUrl]);

    const onLocalInteraction = useCallback(() => {
        if (applyingRemote.current) {
            return;
        }
        void publishState();
    }, [publishState]);

    const onSeeked = useCallback(() => {
        if (applyingRemote.current) {
            return;
        }
        const now = Date.now();
        if (now - lastSeekBroadcast.current < SEEK_BROADCAST_MS) {
            return;
        }
        lastSeekBroadcast.current = now;
        void publishState();
    }, [publishState]);

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
        if (!f) {
            setObjectUrl(null);
            setFileLabel(null);
            return;
        }
        const url = URL.createObjectURL(f);
        setObjectUrl(url);
        setFileLabel(f.name);
    };

    const copyLink = async () => {
        const url = `${typeof window !== "undefined" ? window.location.origin : ""}/watch/${encodeURIComponent(roomDisplayName)}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t("meetsLinkCopied"));
        }
        catch {
            toast.error(t("meetsCopyFailed"));
        }
    };

    const leave = async () => {
        await room.disconnect();
        router.push("/watch");
    };

    const connected = room.state === ConnectionState.Connected;

    return (
        <div className="flex min-h-0 min-h-[100svh] flex-1 flex-col bg-[#F6F7F9] dark:bg-[#0a0a0b]">
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10 sm:gap-3 sm:px-4">
                <Clapperboard className="h-5 w-5 shrink-0 text-blue-600 dark:text-sky-400" aria-hidden />
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-sm font-semibold sm:text-base">{t("watchTogetherTitle")}</h1>
                    <p className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400 sm:text-xs">
                        {roomDisplayName}
                        {connected ? (
                            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                · {t("watchTogetherConnected")}
                            </span>
                        ) : null}
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
                    <button
                        type="button"
                        onClick={() => void copyLink()}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-white/15 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
                    >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        {t("watchTogetherCopyLink")}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void publishRequest();
                        }}
                        disabled={!connected}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
                    >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        {t("watchTogetherSyncNow")}
                    </button>
                    <button
                        type="button"
                        onClick={() => void leave()}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-950/80"
                    >
                        <LogOut className="h-3.5 w-3.5" aria-hidden />
                        {t("meetsLeaveRoom")}
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:flex-row sm:gap-4 sm:p-4">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                    <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {t("watchTogetherHint")}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*,.mkv,.webm,.mp4,.mov,.m4v"
                            className="sr-only"
                            onChange={onFileChange}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 dark:bg-sky-600 dark:hover:bg-sky-500"
                        >
                            {t("watchTogetherChooseFile")}
                        </button>
                        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {fileLabel ?? t("watchTogetherNoFile")}
                        </span>
                    </div>
                    <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-inner dark:border-white/10">
                        <video
                            ref={videoRef}
                            className="h-full max-h-[min(70vh,720px)] w-full object-contain sm:max-h-none sm:min-h-[280px]"
                            controls
                            playsInline
                            src={objectUrl ?? undefined}
                            onPlay={onLocalInteraction}
                            onPause={onLocalInteraction}
                            onSeeked={onSeeked}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
