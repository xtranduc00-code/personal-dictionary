"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Clapperboard,
    FastForward,
    Film,
    Info,
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
import {
    applyRemoteYoutubeState,
    loadYoutubeIframeApi,
    parseYouTubeVideoId,
    YT_STATE_PAUSED,
    YT_STATE_PLAYING,
    type YtPlayerApi,
} from "@/lib/youtube-watch";
import { useMeetsLocalMicLevel } from "@/lib/use-meets-local-mic-level";
import { MEETS_LIVEKIT_ROOM_OPTIONS } from "@/lib/meets-livekit-options";

type SessionProps = {
    token: string;
    serverUrl: string;
    roomDisplayName: string;
};

const START_AUDIO_BTN_CLASS =
    "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm";

const MOBILE_CHAT_DRAWER =
    "relative z-10 flex h-full w-[min(100%,320px)] flex-col border-l border-zinc-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]";

const WATCH_CHAT_DESKTOP =
    "hidden h-full min-h-0 w-full max-w-[min(280px,32vw)] shrink-0 flex-col overflow-hidden !rounded-lg border border-zinc-200 bg-white lg:flex";

export function WatchPartySession({ token, serverUrl, roomDisplayName }: SessionProps) {
    return (
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect
            audio={false}
            video={false}
            options={MEETS_LIVEKIT_ROOM_OPTIONS}
            className="flex h-full min-h-0 w-full flex-1 flex-col text-zinc-900"
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

function shortWatchRoomDisplay(name: string): string {
    if (name.length <= 24) {
        return name;
    }
    return `${name.slice(0, 10)}…${name.slice(-8)}`;
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
    const ytHostRef = useRef<HTMLDivElement>(null);
    const [youtubeId, setYoutubeId] = useState<string | null>(null);
    const [youtubeUrlDraft, setYoutubeUrlDraft] = useState("");
    const [ytReady, setYtReady] = useState(false);
    const [fileDropActive, setFileDropActive] = useState(false);
    const ytPlayerRef = useRef<YtPlayerApi | null>(null);
    const youtubeIdRef = useRef<string | null>(null);
    const publishStateRef = useRef<() => Promise<void>>(async () => {});
    const volumeRef = useRef(1);
    type YoutubeSyncMsg = Extract<WatchSyncEnvelope, { kind: "state" }> & {
        source: "youtube";
        youtubeId: string;
    };
    const pendingYoutubeSyncRef = useRef<YoutubeSyncMsg | null>(null);

    useEffect(() => {
        youtubeIdRef.current = youtubeId;
    }, [youtubeId]);

    useEffect(() => {
        volumeRef.current = volume;
    }, [volume]);

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
        const lp = room.localParticipant;
        if (!lp || room.state !== ConnectionState.Connected) {
            return;
        }
        const yid = youtubeIdRef.current;
        const yp = ytPlayerRef.current;
        if (yid && yp) {
            let currentTime = 0;
            let playing = false;
            try {
                currentTime = yp.getCurrentTime();
                playing = yp.getPlayerState() === YT_STATE_PLAYING;
            }
            catch {
                return;
            }
            const msg: WatchSyncEnvelope = {
                v: 1,
                kind: "state",
                currentTime,
                playing,
                sentAt: Date.now(),
                source: "youtube",
                youtubeId: yid,
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
            return;
        }
        const v = videoRef.current;
        if (!v?.src) {
            return;
        }
        const msg: WatchSyncEnvelope = {
            v: 1,
            kind: "state",
            currentTime: v.currentTime,
            playing: !v.paused,
            sentAt: Date.now(),
            source: "file",
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

    useEffect(() => {
        publishStateRef.current = publishState;
    }, [publishState]);

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
            if (msg.source === "youtube" && msg.youtubeId) {
                if (!msg.playing) {
                    partnerPlayGateRef.current = false;
                    setShowPartnerPlayBanner(false);
                }
                pendingYoutubeSyncRef.current = {
                    v: 1,
                    kind: "state",
                    source: "youtube",
                    youtubeId: msg.youtubeId,
                    currentTime: msg.currentTime,
                    playing: msg.playing,
                    sentAt: msg.sentAt,
                };
                setObjectUrl((url) => {
                    if (url) {
                        URL.revokeObjectURL(url);
                    }
                    return null;
                });
                setYoutubeId((cur) => (cur === msg.youtubeId ? cur : msg.youtubeId!));
                queueMicrotask(() => {
                    const p = ytPlayerRef.current;
                    if (!p || youtubeIdRef.current !== msg.youtubeId) {
                        return;
                    }
                    applyingRemote.current = true;
                    try {
                        applyRemoteYoutubeState(
                            p,
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
                });
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
        if (!objectUrl && !youtubeId) {
            setDuration(0);
            setUiTime(0);
            setScrubTime(0);
            setPlaying(false);
        }
    }, [objectUrl, youtubeId]);

    /** YouTube IFrame API — tạo / hủy player theo videoId (mount DOM cố định, tránh React removeChild vs iframe) */
    useEffect(() => {
        if (!youtubeId) {
            setYtReady(false);
            ytPlayerRef.current = null;
            return;
        }
        let cancelled = false;
        const cleanupTarget = { current: null as YtPlayerApi | null };
        void (async () => {
            await loadYoutubeIframeApi();
            if (cancelled || typeof window === "undefined" || !window.YT?.Player) {
                return;
            }
            const host = ytHostRef.current;
            if (!host) {
                return;
            }
            const player = new window.YT.Player(host, {
                videoId: youtubeId,
                width: "100%",
                height: "100%",
                playerVars: {
                    /** Ẩn UI mặc định — Watch Together dùng thanh điều khiển riêng */
                    controls: 0,
                    /** Ẩn nút fullscreen trong iframe (đã có expand ở custom bar) */
                    fs: 0,
                    rel: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    iv_load_policy: 3,
                    /** Giảm phím tắt trong iframe; tránh focus UI phụ */
                    disablekb: 1,
                    origin: window.location.origin,
                },
                events: {
                    onReady: (e) => {
                        if (cancelled) {
                            return;
                        }
                        ytPlayerRef.current = e.target;
                        setYtReady(true);
                        try {
                            const d = e.target.getDuration();
                            if (Number.isFinite(d) && d > 0) {
                                setDuration(d);
                            }
                            e.target.setVolume(volumeRef.current * 100);
                        }
                        catch {
                            /* ignore */
                        }
                        const pending = pendingYoutubeSyncRef.current;
                        if (
                            pending
                            && pending.source === "youtube"
                            && pending.youtubeId === youtubeIdRef.current
                        ) {
                            applyingRemote.current = true;
                            try {
                                applyRemoteYoutubeState(
                                    e.target,
                                    pending.currentTime,
                                    pending.playing,
                                    pending.playing ? notifyRemotePlayBlocked : undefined,
                                );
                            }
                            finally {
                                window.requestAnimationFrame(() => {
                                    applyingRemote.current = false;
                                });
                            }
                            pendingYoutubeSyncRef.current = null;
                        }
                        void publishStateRef.current();
                    },
                    onStateChange: (ev) => {
                        if (cancelled || applyingRemote.current) {
                            return;
                        }
                        const st = ev.data;
                        setPlaying(st === YT_STATE_PLAYING);
                        if (st === YT_STATE_PLAYING) {
                            clearPartnerPlayGate();
                        }
                        if (st === YT_STATE_PLAYING || st === YT_STATE_PAUSED) {
                            void publishStateRef.current();
                        }
                    },
                },
            });
            if (cancelled) {
                try {
                    player.destroy();
                }
                catch {
                    /* ignore */
                }
                return;
            }
            cleanupTarget.current = player;
        })();
        return () => {
            cancelled = true;
            setYtReady(false);
            ytPlayerRef.current = null;
            try {
                cleanupTarget.current?.destroy();
            }
            catch {
                /* ignore */
            }
            cleanupTarget.current = null;
        };
    }, [youtubeId, notifyRemotePlayBlocked, clearPartnerPlayGate]);

    /** Cập nhật thời gian / duration từ YouTube player */
    useEffect(() => {
        if (!youtubeId || !ytReady) {
            return;
        }
        const id = window.setInterval(() => {
            if (scrubbingRef.current || applyingRemote.current) {
                return;
            }
            const p = ytPlayerRef.current;
            if (!p) {
                return;
            }
            try {
                setUiTime(p.getCurrentTime());
                const dur = p.getDuration();
                if (Number.isFinite(dur) && dur > 0) {
                    setDuration(dur);
                }
            }
            catch {
                /* ignore */
            }
        }, 300);
        return () => window.clearInterval(id);
    }, [youtubeId, ytReady]);

    /** Khi đã có nguồn phát và có người trong phòng — xin state để bắt kịp play/pause */
    useEffect(() => {
        if (room.state !== ConnectionState.Connected) {
            return;
        }
        if (room.remoteParticipants.size === 0) {
            return;
        }
        if (!objectUrl && !(youtubeId && ytReady)) {
            return;
        }
        const id = window.setTimeout(() => {
            void publishRequest();
        }, 400);
        return () => window.clearTimeout(id);
    }, [
        objectUrl,
        youtubeId,
        ytReady,
        room.state,
        room.remoteParticipants.size,
        publishRequest,
    ]);

    /** Heartbeat khi đang phát — tránh lỡ gói đồng bộ đầu tiên */
    useEffect(() => {
        if (!playing || room.state !== ConnectionState.Connected) {
            return;
        }
        if (room.remoteParticipants.size === 0) {
            return;
        }
        if (!objectUrl && !(youtubeId && ytReady)) {
            return;
        }
        const id = window.setInterval(() => {
            if (applyingRemote.current) {
                return;
            }
            void publishState();
        }, 2500);
        return () => window.clearInterval(id);
    }, [
        playing,
        objectUrl,
        youtubeId,
        ytReady,
        room.state,
        room.remoteParticipants.size,
        publishState,
    ]);

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

    const ingestPickedFile = useCallback((f: File | null) => {
        setYoutubeId(null);
        setObjectUrl((prev) => {
            if (prev) {
                URL.revokeObjectURL(prev);
            }
            if (!f) {
                return null;
            }
            return URL.createObjectURL(f);
        });
    }, []);

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        ingestPickedFile(f);
        e.target.value = "";
    };

    const onVideoDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setFileDropActive(true);
    }, []);

    const onVideoDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) {
            return;
        }
        setFileDropActive(false);
    }, []);

    const onVideoDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setFileDropActive(false);
            const f = e.dataTransfer.files?.[0];
            if (!f) {
                return;
            }
            const ok =
                f.type.startsWith("video/")
                || /\.(mkv|webm|mp4|mov|m4v)$/i.test(f.name);
            if (!ok) {
                toast.error(t("watchDropInvalidType"));
                return;
            }
            ingestPickedFile(f);
        },
        [ingestPickedFile, t],
    );

    const loadYoutubeFromDraft = useCallback(() => {
        const id = parseYouTubeVideoId(youtubeUrlDraft);
        if (!id) {
            toast.error(t("watchYoutubeInvalidUrl"));
            return;
        }
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            setObjectUrl(null);
        }
        setYoutubeUrlDraft("");
        setYoutubeId(id);
        const lp = room.localParticipant;
        if (lp && room.state === ConnectionState.Connected) {
            void (async () => {
                try {
                    await lp.publishData(
                        encodeWatchSync({
                            v: 1,
                            kind: "state",
                            currentTime: 0,
                            playing: false,
                            sentAt: Date.now(),
                            source: "youtube",
                            youtubeId: id,
                        }),
                        { reliable: true, topic: WATCH_SYNC_TOPIC },
                    );
                }
                catch {
                    /* ignore */
                }
            })();
        }
    }, [objectUrl, room, t, youtubeUrlDraft]);

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
    const hasMedia = Boolean(objectUrl || (youtubeId && ytReady));
    const showEmptyStage = !objectUrl && !youtubeId;

    const togglePlay = () => {
        if (youtubeId && ytPlayerRef.current) {
            const p = ytPlayerRef.current;
            try {
                if (p.getPlayerState() === YT_STATE_PLAYING) {
                    p.pauseVideo();
                }
                else {
                    p.playVideo();
                    clearPartnerPlayGate();
                }
            }
            catch {
                /* ignore */
            }
            void publishState();
            return;
        }
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
            if (youtubeId && ytPlayerRef.current) {
                const p = ytPlayerRef.current;
                try {
                    let next = p.getCurrentTime() + delta;
                    if (next < 0) {
                        next = 0;
                    }
                    const maxT = durationSafe > 0 ? durationSafe : p.getDuration();
                    if (Number.isFinite(maxT) && maxT > 0 && next > maxT) {
                        next = maxT;
                    }
                    p.seekTo(next, true);
                    setUiTime(next);
                }
                catch {
                    /* ignore */
                }
                void publishState();
                return;
            }
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
        [durationSafe, youtubeId, publishState],
    );

    useEffect(() => {
        if (!scrubbing) {
            return;
        }
        const end = () => {
            scrubbingRef.current = false;
            setScrubbing(false);
            const v = videoRef.current;
            if (v?.src) {
                setUiTime(v.currentTime);
            }
            else {
                const p = ytPlayerRef.current;
                if (p) {
                    try {
                        setUiTime(p.getCurrentTime());
                    }
                    catch {
                        /* ignore */
                    }
                }
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
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f9fafb]">
            <RoomAudioRenderer />
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-2 py-1.5 shadow-sm sm:gap-2 sm:px-3 sm:py-2">
                <Clapperboard className="h-4 w-4 shrink-0 text-blue-600 sm:h-5 sm:w-5" aria-hidden />
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-xs font-semibold text-zinc-900 sm:text-sm md:text-base">{t("watchTogetherTitle")}</h1>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-zinc-600 sm:text-[11px]">
                            <span
                                className="inline-flex max-w-[min(100%,18rem)] items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans"
                                title={roomDisplayName}
                            >
                                <span className="shrink-0 font-medium text-zinc-500">
                                    {t("watchRoomLabel")}
                                </span>
                                <span className="truncate font-mono text-zinc-800">
                                    {shortWatchRoomDisplay(roomDisplayName)}
                                </span>
                            </span>
                            {connected ? (
                                <span className="shrink-0 text-emerald-600">
                                    · {t("watchTogetherConnected")}
                                </span>
                            ) : null}
                        </p>
                        {connected ? (
                            <span
                                className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700"
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
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                : "border-zinc-200 bg-white text-zinc-700 shadow-sm"
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
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-sm lg:hidden"
                        aria-label={t("meetsToggleChat")}
                    >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("meetsChatTitle")}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => void leave()}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800 sm:px-2.5 sm:text-xs"
                    >
                        <LogOut className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("meetsLeaveRoom")}</span>
                    </button>
                </div>
            </header>

            {showPartnerPlayBanner ? (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:text-sm">
                    <span className="min-w-0 leading-snug">{t("watchPartnerPlayingTapPlay")}</span>
                    <button
                        type="button"
                        onClick={() => {
                            if (youtubeId && ytPlayerRef.current) {
                                try {
                                    ytPlayerRef.current.playVideo();
                                    clearPartnerPlayGate();
                                }
                                catch {
                                    /* still blocked */
                                }
                                return;
                            }
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
                        className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
                    >
                        {t("watchPlayTogether")}
                    </button>
                </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                    className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-2 pt-2 sm:gap-2.5 sm:px-3 sm:pb-3 sm:pt-2.5"
                    onDragOver={onVideoDragOver}
                    onDragLeave={onVideoDragLeave}
                    onDrop={onVideoDrop}
                >
                    <div
                        title={t("watchDropZonePrompt")}
                        className="flex min-w-0 shrink-0 flex-nowrap items-center gap-2 py-0.5 max-sm:overflow-x-auto max-sm:pb-0.5"
                    >
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
                            className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                            {t("watchTogetherChooseFile")}
                        </button>
                        <span
                            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                            aria-hidden
                        >
                            {t("watchSourceOr")}
                        </span>
                        <input
                            type="url"
                            value={youtubeUrlDraft}
                            onChange={(e) => setYoutubeUrlDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    loadYoutubeFromDraft();
                                }
                            }}
                            placeholder={t("watchYoutubePlaceholder")}
                            className="h-8 min-w-[6rem] flex-1 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-900 placeholder:text-zinc-400 sm:min-w-[10rem] sm:max-w-md"
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            onClick={loadYoutubeFromDraft}
                            className="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                            {t("watchYoutubeLoad")}
                        </button>
                        <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                            title={t("watchTogetherHint")}
                            aria-label={t("watchTogetherHint")}
                        >
                            <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:min-w-0">
                            <div
                                ref={videoStageRef}
                                className={`watch-party-video-stage relative flex min-h-[38svh] flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-950 shadow-none lg:min-h-0 ${
                                    fileDropActive ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-[#f9fafb]" : ""
                                }`}
                            >
                        <div className="pointer-events-none absolute right-2 top-2 z-20 sm:right-3 sm:top-3">
                            <div className="pointer-events-auto">
                                <StartAudio label={t("meetsStartAudioLabel")} className={START_AUDIO_BTN_CLASS} />
                            </div>
                        </div>

                        <div className="watch-party-video-area relative flex min-h-0 flex-1 items-stretch bg-black">
                            {showEmptyStage ? (
                                <div
                                    className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-zinc-950/95 px-6 text-center"
                                    aria-hidden
                                >
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                                        <Film className="h-7 w-7 text-blue-400" strokeWidth={1.75} />
                                    </div>
                                    <p className="text-sm font-semibold text-zinc-100">
                                        {t("watchEmptyStageTitle")}
                                    </p>
                                    <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
                                        {t("watchEmptyStageHint")}
                                    </p>
                                </div>
                            ) : null}
                            <div
                                ref={ytHostRef}
                                className={`watch-party-yt-host absolute inset-0 z-0 min-h-[12rem] w-full min-w-0 ${youtubeId ? "" : "hidden"}`}
                                aria-hidden={!youtubeId}
                            />
                            {youtubeId && !ytReady ? (
                                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/80 px-4 text-center text-xs text-zinc-300 sm:text-sm">
                                    {t("watchYoutubeLoading")}
                                </div>
                            ) : null}
                            {objectUrl && !youtubeId ? (
                                <video
                                    ref={videoRef}
                                    className="absolute inset-0 z-[2] h-full w-full object-cover"
                                    playsInline
                                    preload="metadata"
                                    src={objectUrl}
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
                            ) : null}
                        </div>

                        <div className="watch-party-controls flex min-h-[2.25rem] shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden border-t border-zinc-800/80 bg-zinc-900 px-2 py-1 sm:gap-2 sm:px-2 sm:py-1.5">
                            <button
                                type="button"
                                disabled={!hasMedia}
                                onClick={() => skipSeconds(-WATCH_SKIP_SECONDS)}
                                title={t("watchSkipBack10")}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 text-zinc-100 shadow-sm hover:bg-zinc-700 disabled:opacity-40 sm:h-8 sm:w-8"
                                aria-label={t("watchSkipBack10")}
                            >
                                <Rewind className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                            <button
                                type="button"
                                disabled={!hasMedia}
                                onClick={togglePlay}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 text-zinc-100 shadow-sm hover:bg-zinc-700 disabled:opacity-40 sm:h-8 sm:w-8"
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
                                disabled={!hasMedia}
                                onClick={() => skipSeconds(WATCH_SKIP_SECONDS)}
                                title={t("watchSkipForward10")}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 text-zinc-100 shadow-sm hover:bg-zinc-700 disabled:opacity-40 sm:h-8 sm:w-8"
                                aria-label={t("watchSkipForward10")}
                            >
                                <FastForward className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                            <button
                                type="button"
                                disabled={!connected}
                                onClick={() => {
                                    void publishRequest();
                                }}
                                title={t("watchSyncNowTooltip")}
                                className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-zinc-600 bg-zinc-800 px-2 text-zinc-100 shadow-sm hover:bg-zinc-700 disabled:opacity-40 sm:min-w-[2rem] sm:px-2.5"
                                aria-label={t("watchTogetherSyncNow")}
                            >
                                <RefreshCw className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                <span className="hidden text-[11px] font-medium sm:inline">{t("watchTogetherSyncNow")}</span>
                            </button>
                            <span className="max-w-[5.5rem] shrink-0 truncate tabular-nums text-[10px] text-zinc-300 sm:max-w-none sm:text-xs md:text-sm">
                                {formatWatchTime(displayTime)} / {formatWatchTime(durationSafe)}
                            </span>
                            <label className="flex min-h-0 min-w-0 flex-1 items-center">
                                <span className="sr-only">{t("watchPlayerSeek")}</span>
                                <input
                                    type="range"
                                    aria-label={t("watchPlayerSeek")}
                                    disabled={!hasMedia || durationSafe <= 0}
                                    min={0}
                                    max={durationSafe > 0 ? durationSafe : 1}
                                    step={0.05}
                                    value={durationSafe > 0 ? Math.min(displayTime, durationSafe) : 0}
                                    onPointerDown={() => {
                                        if (youtubeId && ytPlayerRef.current && durationSafe > 0) {
                                            const p = ytPlayerRef.current;
                                            try {
                                                scrubbingRef.current = true;
                                                setScrubbing(true);
                                                setScrubTime(p.getCurrentTime());
                                            }
                                            catch {
                                                /* ignore */
                                            }
                                            return;
                                        }
                                        const v = videoRef.current;
                                        if (!v?.src || durationSafe <= 0) {
                                            return;
                                        }
                                        scrubbingRef.current = true;
                                        setScrubbing(true);
                                        setScrubTime(v.currentTime);
                                    }}
                                    onChange={(e) => {
                                        const x = Number(e.target.value);
                                        if (!Number.isFinite(x)) {
                                            return;
                                        }
                                        if (youtubeId && ytPlayerRef.current) {
                                            ytPlayerRef.current.seekTo(x, true);
                                            setScrubTime(x);
                                            return;
                                        }
                                        const v = videoRef.current;
                                        if (!v?.src) {
                                            return;
                                        }
                                        setScrubTime(x);
                                        v.currentTime = x;
                                    }}
                                    className="h-1.5 w-full min-w-[4rem] flex-1 cursor-pointer accent-sky-400 disabled:opacity-40 sm:h-2 sm:min-w-[6rem]"
                                />
                            </label>
                            <label className="flex shrink-0 items-center">
                                <span className="sr-only">{t("watchPlayerVolume")}</span>
                                <input
                                    type="range"
                                    aria-label={t("watchPlayerVolume")}
                                    disabled={!hasMedia}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={volume}
                                    onChange={(e) => {
                                        const x = Number(e.target.value);
                                        if (youtubeId && ytPlayerRef.current) {
                                            try {
                                                ytPlayerRef.current.setVolume(Math.round(x * 100));
                                            }
                                            catch {
                                                /* ignore */
                                            }
                                            setVolume(x);
                                            return;
                                        }
                                        const v = videoRef.current;
                                        if (!v?.src) {
                                            return;
                                        }
                                        v.volume = x;
                                        setVolume(x);
                                    }}
                                    className="h-1.5 w-14 cursor-pointer accent-sky-400 sm:h-2 sm:w-20 disabled:opacity-40"
                                />
                            </label>
                            <button
                                type="button"
                                disabled={!hasMedia}
                                onClick={toggleStageFullscreen}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 text-zinc-100 shadow-sm hover:bg-zinc-700 disabled:opacity-40"
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

                        <CallChatPanel variant="watch" roomDisplayName={roomDisplayName} className={WATCH_CHAT_DESKTOP} />
                    </div>
                </div>
            </div>

            {chatOpen ? (
                <div className="fixed inset-0 z-40 flex justify-end bg-zinc-900/20 backdrop-blur-[2px] lg:hidden">
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
                            variant="watch"
                            roomDisplayName={roomDisplayName}
                            className="flex h-full min-h-0 flex-1 rounded-none border-0 !max-h-none"
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
