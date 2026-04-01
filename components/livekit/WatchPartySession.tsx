"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Clapperboard,
    Copy,
    FastForward,
    LogOut,
    Maximize2,
    MessageSquare,
    Mic,
    MicOff,
    Minimize2,
    Pause,
    Play,
    RefreshCw,
    Rewind,
    Users,
} from "lucide-react";
import {
    LiveKitRoom,
    RoomAudioRenderer,
    StartAudio,
    useLocalParticipant,
    useParticipants,
    useRoomContext,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, type RemoteParticipant } from "livekit-client";
import { toast } from "react-toastify";
import { CallChatPanel } from "@/components/livekit/CallChatPanel";
import { MicLevelBars } from "@/components/livekit/MicLevelBars";
import { useI18n } from "@/components/i18n-provider";
import {
    applyRemoteVideoState,
    encodeWatchSync,
    parseWatchSync,
    WATCH_SYNC_TOPIC,
    type WatchSyncEnvelope,
} from "@/lib/watch-party-protocol";
import { useMeetsLocalMicLevel } from "@/lib/use-meets-local-mic-level";
import { MEETS_LIVEKIT_ROOM_OPTIONS } from "@/lib/meets-livekit-options";

type SessionProps = {
    token: string;
    serverUrl: string;
    roomDisplayName: string;
};

const START_AUDIO_BTN_CLASS =
    "rounded-lg border border-gray-600/40 bg-gray-900/75 px-3 py-2 text-xs font-medium text-white shadow-md backdrop-blur-md dark:border-white/15 dark:bg-black/70 dark:shadow-lg";

const MOBILE_CHAT_DRAWER =
    "relative z-10 flex h-full w-[min(100%,320px)] flex-col border-l border-zinc-700/80 bg-[#1a1f2e] shadow-[0_12px_40px_rgba(0,0,0,0.45)]";

const WATCH_CHAT_DESKTOP =
    "hidden h-full min-h-0 w-full max-w-[300px] shrink-0 !min-h-0 flex-col border-l border-zinc-700/80 !max-h-none lg:flex";

export function WatchPartySession({ token, serverUrl, roomDisplayName }: SessionProps) {
    return (
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect
            audio={false}
            video={false}
            options={MEETS_LIVEKIT_ROOM_OPTIONS}
            className="flex h-full min-h-0 w-full flex-1 flex-col text-[#111827] dark:text-zinc-100"
        >
            <WatchPartyInner roomDisplayName={roomDisplayName} />
        </LiveKitRoom>
    );
}

const SEEK_BROADCAST_MS = 220;
const WATCH_SKIP_SECONDS = 10;

function getDocumentFullscreenElement(): Element | null {
    const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
        mozFullScreenElement?: Element | null;
    };
    return (
        document.fullscreenElement
        ?? doc.webkitFullscreenElement
        ?? doc.mozFullScreenElement
        ?? null
    );
}

function formatWatchTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) {
        return "0:00";
    }
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
}

function WatchPartyInner({ roomDisplayName }: { roomDisplayName: string }) {
    const { t } = useI18n();
    const router = useRouter();
    const room = useRoomContext();
    const participants = useParticipants();
    const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
    const micLevel = useMeetsLocalMicLevel(isMicrophoneEnabled);
    const [chatOpen, setChatOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [fileLabel, setFileLabel] = useState<string | null>(null);
    const applyingRemote = useRef(false);
    const lastSeekBroadcast = useRef(0);
    const scrubbingRef = useRef(false);
    const videoStageRef = useRef<HTMLDivElement>(null);
    const [uiTime, setUiTime] = useState(0);
    const [scrubTime, setScrubTime] = useState(0);
    const [scrubbing, setScrubbing] = useState(false);
    const [duration, setDuration] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [stageFullscreen, setStageFullscreen] = useState(false);
    const [showPartnerPlayBanner, setShowPartnerPlayBanner] = useState(false);
    const partnerPlayGateRef = useRef(false);

    const notifyRemotePlayBlocked = useCallback(() => {
        if (partnerPlayGateRef.current) {
            return;
        }
        partnerPlayGateRef.current = true;
        setShowPartnerPlayBanner(true);
        toast.info(t("watchPartnerPlayingTapPlay"), {
            toastId: "watch-partner-play",
            autoClose: 8000,
        });
    }, [t]);

    const clearPartnerPlayGate = useCallback(() => {
        partnerPlayGateRef.current = false;
        setShowPartnerPlayBanner(false);
    }, []);

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
            /** SDK / server có thể không gửi `topic`; chỉ bỏ qua khi topic khác hẳn gói sync của mình */
            if (topic != null && topic !== "" && topic !== WATCH_SYNC_TOPIC) {
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
            if (!msg.playing) {
                partnerPlayGateRef.current = false;
                setShowPartnerPlayBanner(false);
            }
            applyingRemote.current = true;
            try {
                applyRemoteVideoState(
                    v,
                    msg.currentTime,
                    msg.playing,
                    msg.playing ? notifyRemotePlayBlocked : undefined,
                );
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
    }, [room, publishState, notifyRemotePlayBlocked]);

    useEffect(() => {
        const onParticipantConnected = (p: RemoteParticipant) => {
            const label = p.name?.trim() || p.identity || "?";
            toast.info(t("watchSomeoneJoined").replace("{name}", label), {
                toastId: `watch-join-${p.identity}`,
                autoClose: 4000,
            });
            void publishState();
        };
        const onParticipantDisconnected = (p: RemoteParticipant) => {
            const label = p.name?.trim() || p.identity || "?";
            toast.info(t("watchSomeoneLeft").replace("{name}", label), {
                toastId: `watch-leave-${p.identity}`,
                autoClose: 3000,
            });
        };
        room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
        room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
        return () => {
            room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
            room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
        };
    }, [room, publishState, t]);

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

    useEffect(() => {
        if (!objectUrl) {
            setDuration(0);
            setUiTime(0);
            setScrubTime(0);
            setPlaying(false);
        }
    }, [objectUrl]);

    /** Khi đã chọn file và có người trong phòng — xin state để bắt kịp play/pause */
    useEffect(() => {
        if (!objectUrl || room.state !== ConnectionState.Connected) {
            return;
        }
        if (room.remoteParticipants.size === 0) {
            return;
        }
        const id = window.setTimeout(() => {
            void publishRequest();
        }, 400);
        return () => window.clearTimeout(id);
    }, [objectUrl, room.state, room.remoteParticipants.size, publishRequest]);

    /** Heartbeat khi đang phát — tránh lỡ gói đồng bộ đầu tiên */
    useEffect(() => {
        if (!playing || !objectUrl || room.state !== ConnectionState.Connected) {
            return;
        }
        if (room.remoteParticipants.size === 0) {
            return;
        }
        const id = window.setInterval(() => {
            if (applyingRemote.current) {
                return;
            }
            void publishState();
        }, 2500);
        return () => window.clearInterval(id);
    }, [playing, objectUrl, room.state, room.remoteParticipants.size, publishState]);

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

    const toggleMic = useCallback(async () => {
        try {
            await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
        }
        catch {
            toast.error(t("meetsMicToggleFailed"));
        }
    }, [localParticipant, isMicrophoneEnabled, t]);

    const connected = room.state === ConnectionState.Connected;

    const peopleCount = participants.length;
    const peopleLabel =
        peopleCount === 1 ? t("meetsPeopleOne") : t("meetsPeopleMany").replace("{n}", String(peopleCount));
    const peopleTitle = participants
        .map((p) => ((p.name && p.name.trim()) ? p.name : p.identity))
        .join(", ");

    const displayTime = scrubbing ? scrubTime : uiTime;
    const durationSafe = Number.isFinite(duration) && duration > 0 ? duration : 0;

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v?.src) {
            return;
        }
        if (v.paused) {
            void v
                .play()
                .then(() => {
                    clearPartnerPlayGate();
                })
                .catch(() => {
                    /* autoplay / gesture */
                });
        }
        else {
            v.pause();
        }
    };

    const toggleStageFullscreen = () => {
        const el = videoStageRef.current;
        if (!el) {
            return;
        }
        if (getDocumentFullscreenElement() === el) {
            const doc = document as Document & {
                webkitExitFullscreen?: () => Promise<void>;
                mozCancelFullScreen?: () => void;
            };
            if (doc.webkitExitFullscreen) {
                void doc.webkitExitFullscreen();
            }
            else if (doc.mozCancelFullScreen) {
                doc.mozCancelFullScreen();
            }
            else {
                void document.exitFullscreen();
            }
        }
        else {
            const node = el as HTMLElement & {
                webkitRequestFullscreen?: () => Promise<void>;
                mozRequestFullScreen?: () => Promise<void>;
            };
            if (node.webkitRequestFullscreen) {
                void node.webkitRequestFullscreen();
            }
            else if (node.mozRequestFullScreen) {
                void node.mozRequestFullScreen();
            }
            else {
                void el.requestFullscreen();
            }
        }
    };

    useEffect(() => {
        const syncStageFs = () => {
            const el = videoStageRef.current;
            setStageFullscreen(Boolean(el && getDocumentFullscreenElement() === el));
        };
        document.addEventListener("fullscreenchange", syncStageFs);
        document.addEventListener("webkitfullscreenchange", syncStageFs);
        document.addEventListener("mozfullscreenchange", syncStageFs);
        syncStageFs();
        return () => {
            document.removeEventListener("fullscreenchange", syncStageFs);
            document.removeEventListener("webkitfullscreenchange", syncStageFs);
            document.removeEventListener("mozfullscreenchange", syncStageFs);
        };
    }, []);

    const skipSeconds = useCallback(
        (delta: number) => {
            const v = videoRef.current;
            if (!v?.src) {
                return;
            }
            const maxT = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : durationSafe;
            const cap = maxT > 0 ? maxT : undefined;
            let next = v.currentTime + delta;
            if (next < 0) {
                next = 0;
            }
            if (cap != null && next > cap) {
                next = cap;
            }
            v.currentTime = next;
            setUiTime(next);
        },
        [durationSafe],
    );

    useEffect(() => {
        if (!scrubbing) {
            return;
        }
        const end = () => {
            scrubbingRef.current = false;
            setScrubbing(false);
            const v = videoRef.current;
            if (v) {
                setUiTime(v.currentTime);
            }
            void publishState();
        };
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        return () => {
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
        };
    }, [scrubbing, publishState]);

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F6F7F9] dark:bg-[#0a0a0b]">
            <RoomAudioRenderer />
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/80 px-2 py-1.5 dark:border-white/10 sm:gap-2 sm:px-3 sm:py-2">
                <Clapperboard className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400 sm:h-5 sm:w-5" aria-hidden />
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-xs font-semibold sm:text-sm md:text-base">{t("watchTogetherTitle")}</h1>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <p className="min-w-0 truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400 sm:text-[11px]">
                            {roomDisplayName}
                            {connected ? (
                                <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 sm:ml-2">
                                    · {t("watchTogetherConnected")}
                                </span>
                            ) : null}
                        </p>
                        {connected ? (
                            <span
                                className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-md bg-zinc-200/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
                                title={peopleTitle}
                            >
                                <Users className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                                <span className="truncate">{peopleLabel}</span>
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1 sm:gap-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            void toggleMic();
                        }}
                        disabled={!connected}
                        title={isMicrophoneEnabled ? t("meetsMuteMic") : t("meetsUnmuteMic")}
                        className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium disabled:opacity-50 sm:px-2.5 sm:text-xs ${
                            isMicrophoneEnabled
                                ? "border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-100"
                                : "border-zinc-200 bg-white text-zinc-800 dark:border-white/15 dark:bg-white/10 dark:text-zinc-100"
                        }`}
                    >
                        {isMicrophoneEnabled ? (
                            <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : (
                            <MicOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        {isMicrophoneEnabled ? (
                            <MicLevelBars level={micLevel} className="hidden !h-4 w-[18px] sm:flex" />
                        ) : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => setChatOpen(true)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 lg:hidden dark:border-white/15 dark:bg-white/10 dark:text-zinc-100"
                        aria-label={t("meetsToggleChat")}
                    >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("meetsChatTitle")}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => void copyLink()}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 sm:px-2.5 sm:text-xs dark:border-white/15 dark:bg-white/10 dark:text-zinc-100"
                    >
                        <Copy className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("watchTogetherCopyLink")}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void publishRequest();
                        }}
                        disabled={!connected}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 disabled:opacity-50 sm:px-2.5 sm:text-xs dark:border-white/15 dark:bg-white/10 dark:text-zinc-100"
                    >
                        <RefreshCw className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("watchTogetherSyncNow")}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => void leave()}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800 sm:px-2.5 sm:text-xs dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200"
                    >
                        <LogOut className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("meetsLeaveRoom")}</span>
                    </button>
                </div>
            </header>

            {showPartnerPlayBanner ? (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200/90 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/45 dark:text-amber-50 sm:text-sm">
                    <span className="min-w-0 leading-snug">{t("watchPartnerPlayingTapPlay")}</span>
                    <button
                        type="button"
                        onClick={() => {
                            const v = videoRef.current;
                            if (!v?.src) {
                                return;
                            }
                            void v
                                .play()
                                .then(() => {
                                    clearPartnerPlayGate();
                                })
                                .catch(() => {
                                    /* still blocked */
                                });
                        }}
                        className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 dark:bg-amber-700 dark:hover:bg-amber-600"
                    >
                        {t("watchPlayTogether")}
                    </button>
                </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1 sm:px-3 sm:pb-3 sm:pt-2">
                    <p className="mb-1 line-clamp-1 shrink-0 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400 sm:line-clamp-2 sm:text-xs">
                        {t("watchTogetherHint")}
                    </p>
                    <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
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
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 dark:bg-sky-600 dark:hover:bg-sky-500 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
                        >
                            {t("watchTogetherChooseFile")}
                        </button>
                        <span className="max-w-[min(100%,14rem)] truncate text-[10px] text-zinc-500 dark:text-zinc-400 sm:max-w-md sm:text-xs">
                            {fileLabel ?? t("watchTogetherNoFile")}
                        </span>
                    </div>

                    <div
                        ref={videoStageRef}
                        className="watch-party-video-stage relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-inner dark:border-white/10 sm:rounded-2xl"
                    >
                        <div className="pointer-events-none absolute right-2 top-2 z-20 sm:right-3 sm:top-3">
                            <div className="pointer-events-auto">
                                <StartAudio label={t("meetsStartAudioLabel")} className={START_AUDIO_BTN_CLASS} />
                            </div>
                        </div>

                        <div className="watch-party-video-area relative flex min-h-0 flex-1 items-center justify-center bg-black">
                            <video
                                ref={videoRef}
                                className="max-h-full max-w-full object-contain"
                                playsInline
                                preload="metadata"
                                src={objectUrl ?? undefined}
                            onPlay={() => {
                                setPlaying(true);
                                clearPartnerPlayGate();
                                onLocalInteraction();
                            }}
                                onPause={() => {
                                    setPlaying(false);
                                    onLocalInteraction();
                                }}
                                onSeeked={onSeeked}
                                onLoadedMetadata={(e) => {
                                    const v = e.currentTarget;
                                    setDuration(v.duration);
                                    setUiTime(v.currentTime);
                                    setVolume(v.volume);
                                    setPlaying(!v.paused);
                                }}
                                onTimeUpdate={(e) => {
                                    if (scrubbingRef.current) {
                                        return;
                                    }
                                    setUiTime(e.currentTarget.currentTime);
                                }}
                                onVolumeChange={(e) => {
                                    setVolume(e.currentTarget.volume);
                                }}
                                onEnded={() => {
                                    setPlaying(false);
                                    onLocalInteraction();
                                }}
                            />
                        </div>

                        <div className="watch-party-controls flex min-h-[2.25rem] shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden border-t border-zinc-700/80 bg-zinc-950 px-2 py-1 text-zinc-100 sm:gap-2 sm:px-2.5 sm:py-1.5">
                            <button
                                type="button"
                                disabled={!objectUrl}
                                onClick={() => skipSeconds(-WATCH_SKIP_SECONDS)}
                                title={t("watchSkipBack10")}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 sm:h-8 sm:w-8"
                                aria-label={t("watchSkipBack10")}
                            >
                                <Rewind className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                            <button
                                type="button"
                                disabled={!objectUrl}
                                onClick={togglePlay}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 sm:h-8 sm:w-8"
                                aria-label={playing ? t("watchPlayerPause") : t("watchPlayerPlay")}
                            >
                                {playing ? (
                                    <Pause className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                ) : (
                                    <Play className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                )}
                            </button>
                            <button
                                type="button"
                                disabled={!objectUrl}
                                onClick={() => skipSeconds(WATCH_SKIP_SECONDS)}
                                title={t("watchSkipForward10")}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 sm:h-8 sm:w-8"
                                aria-label={t("watchSkipForward10")}
                            >
                                <FastForward className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                            <span className="max-w-[5.5rem] shrink-0 truncate tabular-nums text-[10px] text-zinc-300 sm:max-w-none sm:text-xs md:text-sm">
                                {formatWatchTime(displayTime)} / {formatWatchTime(durationSafe)}
                            </span>
                            <label className="flex min-h-0 min-w-0 flex-1 items-center">
                                <span className="sr-only">{t("watchPlayerSeek")}</span>
                                <input
                                    type="range"
                                    aria-label={t("watchPlayerSeek")}
                                    disabled={!objectUrl || durationSafe <= 0}
                                    min={0}
                                    max={durationSafe > 0 ? durationSafe : 1}
                                    step={0.05}
                                    value={durationSafe > 0 ? Math.min(displayTime, durationSafe) : 0}
                                    onPointerDown={() => {
                                        const v = videoRef.current;
                                        if (!v?.src || durationSafe <= 0) {
                                            return;
                                        }
                                        scrubbingRef.current = true;
                                        setScrubbing(true);
                                        setScrubTime(v.currentTime);
                                    }}
                                    onChange={(e) => {
                                        const v = videoRef.current;
                                        const x = Number(e.target.value);
                                        if (!v?.src || !Number.isFinite(x)) {
                                            return;
                                        }
                                        setScrubTime(x);
                                        v.currentTime = x;
                                    }}
                                    className="h-1.5 w-full min-w-[4rem] flex-1 cursor-pointer accent-sky-500 disabled:opacity-40 sm:h-2 sm:min-w-[6rem]"
                                />
                            </label>
                            <label className="flex shrink-0 items-center">
                                <span className="sr-only">{t("watchPlayerVolume")}</span>
                                <input
                                    type="range"
                                    aria-label={t("watchPlayerVolume")}
                                    disabled={!objectUrl}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={volume}
                                    onChange={(e) => {
                                        const v = videoRef.current;
                                        const x = Number(e.target.value);
                                        if (!v?.src) {
                                            return;
                                        }
                                        v.volume = x;
                                        setVolume(x);
                                    }}
                                    className="h-1.5 w-14 cursor-pointer accent-sky-500 sm:h-2 sm:w-20 disabled:opacity-40"
                                />
                            </label>
                            <button
                                type="button"
                                disabled={!objectUrl}
                                onClick={toggleStageFullscreen}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
                                aria-label={stageFullscreen ? t("watchExitFullscreen") : t("watchPlayerFullscreen")}
                            >
                                {stageFullscreen ? (
                                    <Minimize2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                                ) : (
                                    <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                <CallChatPanel roomDisplayName={roomDisplayName} className={WATCH_CHAT_DESKTOP} />
            </div>

            {chatOpen ? (
                <div className="fixed inset-0 z-40 flex justify-end bg-[#111827]/35 backdrop-blur-sm dark:bg-black/60 lg:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 cursor-default"
                        aria-label={t("meetsToggleChatHide")}
                        onClick={() => setChatOpen(false)}
                    />
                    <div
                        className={MOBILE_CHAT_DRAWER}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label={t("meetsChatTitle")}
                    >
                        <CallChatPanel
                            roomDisplayName={roomDisplayName}
                            className="flex h-full min-h-0 flex-1 rounded-none border-0 !max-h-none"
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
