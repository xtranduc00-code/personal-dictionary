"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Clock, LogOut, Maximize2, Mic, MicOff, PhoneOff, Users } from "lucide-react";
import {
    LiveKitRoom,
    RoomAudioRenderer,
    StartAudio,
    useLocalParticipant,
    useParticipants,
    useRoomContext,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, VideoPresets } from "livekit-client";
import { useI18n } from "@/components/i18n-provider";
import { CallChatPanel } from "@/components/livekit/CallChatPanel";
import { CallControls } from "@/components/livekit/CallControls";
import { CallRoomHeader } from "@/components/livekit/CallRoomHeader";
import { MeetLeaveConfirmModal } from "@/components/livekit/MeetLeaveConfirmModal";
import { MeetingEndedModal } from "@/components/livekit/MeetingEndedModal";
import { CallVideoGrid } from "@/components/livekit/CallVideoGrid";
import { MEETS_LIVEKIT_ROOM_OPTIONS } from "@/lib/meets-livekit-options";
import { useMeetCall } from "@/lib/meet-call-context";
import { formatMmSs } from "@/lib/meets-format";
import { useMeetsLocalRecording } from "@/lib/use-meets-local-recording";
import { useMeetsCamera1080Resolution } from "@/lib/use-meets-camera-resolution";

export type MeetMiniDragHandleProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
};

type Props = {
    token: string;
    serverUrl: string;
    roomDisplayName: string;
    layout: "full" | "mini";
    /** Chỉ dùng khi layout mini — kéo từ vùng header trong `CallRoomInner`. */
    miniDragHandle?: MeetMiniDragHandleProps;
};

const START_AUDIO_BTN_CLASS =
    "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm";

const START_AUDIO_BTN_MINI =
    "rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-800 shadow-sm";

const STAGE_VIGNETTE =
    "relative z-0 flex min-h-[min(52vh,560px)] flex-1 flex-col lg:min-h-0 after:pointer-events-none after:absolute after:inset-0 after:z-[2] after:rounded-xl after:shadow-[inset_0_0_48px_rgba(0,0,0,0.05)]";

const CHAT_DESKTOP_BASE =
    "hidden h-full min-h-0 w-full max-w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm";

const MOBILE_CHAT_DRAWER =
    "relative z-10 flex h-full w-[min(100%,320px)] flex-col border-l border-zinc-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]";

function useMeetRoomElapsedSec() {
    const room = useRoomContext();
    const [elapsedSec, setElapsedSec] = useState(0);
    const [timerRunning, setTimerRunning] = useState(false);

    useEffect(() => {
        const sync = () => {
            if (room.state === ConnectionState.Connected) {
                setTimerRunning(true);
            }
        };
        sync();
        room.on(RoomEvent.Connected, sync);
        room.on(RoomEvent.Reconnected, sync);
        const onDisconnected = () => {
            setTimerRunning(false);
            setElapsedSec(0);
        };
        room.on(RoomEvent.Disconnected, onDisconnected);
        return () => {
            room.off(RoomEvent.Connected, sync);
            room.off(RoomEvent.Reconnected, sync);
            room.off(RoomEvent.Disconnected, onDisconnected);
        };
    }, [room]);

    useEffect(() => {
        if (!timerRunning) {
            return;
        }
        const id = window.setInterval(() => {
            setElapsedSec((s) => s + 1);
        }, 1000);
        return () => window.clearInterval(id);
    }, [timerRunning]);

    return elapsedSec;
}

/* ── Compact floating pill + expandable mini panel ── */
const AUTO_COLLAPSE_MS = 4000;

function MiniCallWidget({
    roomDisplayName,
    count,
    peopleLabel,
    elapsedSec,
    stageRef,
    miniDragHandle,
    recordingUi,
    expandToFullRoute,
    requestLeave,
    meetingEndedOpen,
    finishLeaveToHub,
    pendingRecording,
    leaveConfirmOpen,
    setLeaveConfirmOpen,
    confirmLeave,
}: {
    roomDisplayName: string;
    count: number;
    peopleLabel: string;
    elapsedSec: number;
    stageRef: React.RefObject<HTMLDivElement | null>;
    miniDragHandle?: MeetMiniDragHandleProps;
    recordingUi: import("@/components/livekit/CallControls").CallRecordingUiProps;
    expandToFullRoute: () => void;
    requestLeave: () => void;
    meetingEndedOpen: boolean;
    finishLeaveToHub: () => void;
    pendingRecording: import("@/lib/use-meets-local-recording").PendingMeetRecording | null;
    leaveConfirmOpen: boolean;
    setLeaveConfirmOpen: (v: boolean) => void;
    confirmLeave: () => void;
}) {
    const { t } = useI18n();
    const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
    const [isExpanded, setIsExpanded] = useState(true);

    // Auto-collapse into compact pill after a few seconds
    useEffect(() => {
        const id = window.setTimeout(() => setIsExpanded(false), AUTO_COLLAPSE_MS);
        return () => window.clearTimeout(id);
    }, []);

    const toggleMic = useCallback(async () => {
        try {
            await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
        } catch { /* ignore */ }
    }, [localParticipant, isMicrophoneEnabled]);

    // ── Compact pill ──
    if (!isExpanded) {
        return (
            <>
                <div
                    className="flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/90 py-1 pl-2.5 pr-1 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/90"
                    role="status"
                >
                    {/* Drag handle + status */}
                    <div
                        className={`flex min-w-0 items-center gap-1.5 ${miniDragHandle ? "touch-none cursor-grab select-none active:cursor-grabbing" : ""}`}
                        onPointerDown={miniDragHandle?.onPointerDown}
                        title={miniDragHandle ? t("meetsMiniDragHint") : undefined}
                    >
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        {count > 1 && (
                            <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                                <Users className="mr-0.5 inline h-2.5 w-2.5" />{count}
                            </span>
                        )}
                    </div>

                    {/* Mic toggle */}
                    <button
                        type="button"
                        onClick={() => void toggleMic()}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
                            isMicrophoneEnabled
                                ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
                                : "bg-red-500 text-white hover:bg-red-600"
                        }`}
                        aria-label={isMicrophoneEnabled ? t("meetsMuteMic") : t("meetsUnmuteMic")}
                    >
                        {isMicrophoneEnabled
                            ? <Mic className="h-3 w-3" strokeWidth={2.5} />
                            : <MicOff className="h-3 w-3" strokeWidth={2.5} />}
                    </button>

                    {/* Leave */}
                    <button
                        type="button"
                        onClick={requestLeave}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-500"
                        aria-label={t("meetsEndCall")}
                    >
                        <PhoneOff className="h-3 w-3" strokeWidth={2.5} />
                    </button>

                    {/* Expand */}
                    <button
                        type="button"
                        onClick={() => setIsExpanded(true)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        aria-label={t("meetsExpandCall")}
                    >
                        <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                </div>

                {/* Audio must keep playing even in compact mode */}
                <RoomAudioRenderer />

                <MeetingEndedModal
                    roomDisplayName={roomDisplayName}
                    open={meetingEndedOpen}
                    onDismiss={finishLeaveToHub}
                    pendingRecording={pendingRecording}
                />
                <MeetLeaveConfirmModal
                    open={leaveConfirmOpen}
                    onCancel={() => setLeaveConfirmOpen(false)}
                    onConfirm={confirmLeave}
                />
            </>
        );
    }

    // ── Expanded panel ──
    return (
        <>
        <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-[#0a0a0b] shadow-[0_12px_36px_rgba(0,0,0,0.3)] dark:border-white/10">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-2.5 py-1.5">
                <div
                    className={`min-w-0 flex-1 ${miniDragHandle ? "touch-none cursor-grab select-none active:cursor-grabbing" : ""}`}
                    onPointerDown={miniDragHandle?.onPointerDown}
                    title={miniDragHandle ? t("meetsMiniDragHint") : undefined}
                >
                    <p className="truncate font-mono text-[11px] font-semibold text-zinc-900">
                        {roomDisplayName}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
                        <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                            {peopleLabel}
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums" title={t("meetsCallTimerHint")}>
                            <Clock className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                            {formatMmSs(elapsedSec)}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={expandToFullRoute}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50"
                        title={t("meetsExpandCall")}
                        aria-label={t("meetsExpandCall")}
                    >
                        <Maximize2 className="h-3 w-3" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsExpanded(false)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100"
                        aria-label="Collapse"
                    >
                        <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={requestLeave}
                        className="inline-flex h-7 items-center justify-center gap-1 rounded-full bg-red-600 px-2 text-[10px] font-semibold text-white shadow-sm hover:bg-red-500"
                    >
                        <LogOut className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="hidden sm:inline">{t("meetsLeaveRoom")}</span>
                    </button>
                </div>
            </header>

            <div
                ref={stageRef}
                className="relative flex min-h-[120px] max-h-[200px] min-w-0 shrink-0 flex-col overflow-hidden bg-zinc-950"
            >
                <RoomAudioRenderer />
                <div className="absolute right-1.5 top-1.5 z-30">
                    <StartAudio label={t("meetsStartAudioLabel")} className={START_AUDIO_BTN_MINI} />
                </div>
                <div className="relative z-0 flex min-h-0 flex-1 flex-col">
                    <CallVideoGrid />
                </div>
                <div
                    className="pointer-events-none absolute left-0 right-0 z-50 flex justify-center px-2 pb-1.5"
                    style={{ bottom: "max(0.25rem, env(safe-area-inset-bottom, 0px))" }}
                >
                    <CallControls
                        variant="mini"
                        toolbarSurface="default"
                        recording={recordingUi}
                        onLeave={requestLeave}
                    />
                </div>
            </div>

            <MeetingEndedModal
                roomDisplayName={roomDisplayName}
                open={meetingEndedOpen}
                onDismiss={finishLeaveToHub}
                pendingRecording={pendingRecording}
            />
        </div>
        <MeetLeaveConfirmModal
            open={leaveConfirmOpen}
            onCancel={() => setLeaveConfirmOpen(false)}
            onConfirm={confirmLeave}
        />
        </>
    );
}

function CallRoomInner({
    roomDisplayName,
    layout,
    miniDragHandle,
}: {
    roomDisplayName: string;
    layout: "full" | "mini";
    miniDragHandle?: MeetMiniDragHandleProps;
}) {
    const { t } = useI18n();
    const router = useRouter();
    const { clearSession } = useMeetCall();
    const room = useRoomContext();
    const { isScreenShareEnabled } = useLocalParticipant();
    const participants = useParticipants();
    const stageRef = useRef<HTMLDivElement>(null);
    const [isStageFullscreen, setIsStageFullscreen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [meetingEndedOpen, setMeetingEndedOpen] = useState(false);
    const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
    const elapsedSec = useMeetRoomElapsedSec();

    const {
        isRecording,
        recordingElapsedSec,
        busyRec,
        startRecording,
        stopRecording,
        pendingRecording,
        clearPendingRecording,
    } = useMeetsLocalRecording(roomDisplayName);

    useMeetsCamera1080Resolution();

    useEffect(() => {
        const onFs = () => {
            setIsStageFullscreen(document.fullscreenElement === stageRef.current);
        };
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);

    const toggleStageFullscreen = useCallback(() => {
        if (layout === "mini") {
            return;
        }
        const el = stageRef.current;
        if (!el) {
            return;
        }
        if (document.fullscreenElement === el) {
            void document.exitFullscreen();
        }
        else {
            void el.requestFullscreen();
        }
    }, [layout]);

    const beginLeave = useCallback(async () => {
        if (layout === "full" && document.fullscreenElement === stageRef.current) {
            try {
                await document.exitFullscreen();
            }
            catch {
                /* ignore */
            }
        }
        if (isRecording) {
            await stopRecording();
        }
        await room.disconnect();
        setMeetingEndedOpen(true);
    }, [room, isRecording, stopRecording, layout]);

    const requestLeave = useCallback(() => {
        setLeaveConfirmOpen(true);
    }, []);

    const confirmLeave = useCallback(() => {
        setLeaveConfirmOpen(false);
        void beginLeave();
    }, [beginLeave]);

    const finishLeaveToHub = useCallback(() => {
        clearPendingRecording();
        setMeetingEndedOpen(false);
        clearSession();
        router.push("/call");
    }, [router, clearPendingRecording, clearSession]);

    const expandToFullRoute = useCallback(() => {
        router.push(`/call/${encodeURIComponent(roomDisplayName)}`);
    }, [router, roomDisplayName]);

    const toggleChat = useCallback(() => {
        setChatOpen((o) => !o);
    }, []);

    const closeMobileChat = useCallback(() => {
        setChatOpen(false);
    }, []);

    const onRecordToggle = useCallback(() => {
        if (isRecording) {
            void stopRecording();
        }
        else {
            void startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    const recordingUi = useMemo(
        () => ({
            isRecording,
            recordingElapsedSec,
            recordBusy: busyRec !== null,
            onRecordToggle,
        }),
        [isRecording, recordingElapsedSec, busyRec, onRecordToggle],
    );

    const desktopChatClass = useMemo(
        () => `${CHAT_DESKTOP_BASE} ${chatOpen ? "lg:flex" : "lg:hidden"}`,
        [chatOpen],
    );

    const count = participants.length;
    const peopleLabel =
        count === 1 ? t("meetsPeopleOne") : t("meetsPeopleMany").replace("{n}", String(count));

    if (layout === "mini") {
        return (
            <MiniCallWidget
                roomDisplayName={roomDisplayName}
                count={count}
                peopleLabel={peopleLabel}
                elapsedSec={elapsedSec}
                stageRef={stageRef}
                miniDragHandle={miniDragHandle}
                recordingUi={recordingUi}
                expandToFullRoute={expandToFullRoute}
                requestLeave={requestLeave}
                meetingEndedOpen={meetingEndedOpen}
                finishLeaveToHub={finishLeaveToHub}
                pendingRecording={pendingRecording}
                leaveConfirmOpen={leaveConfirmOpen}
                setLeaveConfirmOpen={setLeaveConfirmOpen}
                confirmLeave={confirmLeave}
            />
        );
    }

    return (
        <div className="relative flex min-h-0 w-full flex-1 flex-col bg-[#f9fafb] text-zinc-900">
            <CallRoomHeader
                roomDisplayName={roomDisplayName}
                isPresenting={isScreenShareEnabled}
                onLeaveClick={requestLeave}
            />
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 pt-3 sm:gap-5 sm:px-5 sm:pb-5 sm:pt-4 lg:flex-row lg:items-stretch">
                <div
                    ref={stageRef}
                    className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                >
                    <RoomAudioRenderer />
                    {isRecording ? (
                        <div
                            className="pointer-events-none absolute left-2.5 top-2.5 z-40 flex items-center gap-1.5 rounded-md bg-red-600/90 px-2 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm sm:left-3 sm:top-3"
                            role="status"
                            aria-live="polite"
                        >
                            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" />
                            <span className="font-mono tabular-nums">REC {formatMmSs(recordingElapsedSec)}</span>
                        </div>
                    ) : null}
                    <div className={STAGE_VIGNETTE}>
                        <div className="absolute right-2 top-2 z-30 sm:right-3 sm:top-3">
                            <StartAudio label={t("meetsStartAudioLabel")} className={START_AUDIO_BTN_CLASS} />
                        </div>
                        <div className="relative z-0 flex min-h-0 flex-1 flex-col">
                            <CallVideoGrid />
                        </div>
                    </div>
                    <div
                        className="pointer-events-none absolute left-0 right-0 z-50 flex justify-center px-3"
                        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
                    >
                        <CallControls
                            recording={recordingUi}
                            chatOpen={chatOpen}
                            onToggleChat={toggleChat}
                            onLeave={requestLeave}
                            isFullscreen={isStageFullscreen}
                            onToggleFullscreen={toggleStageFullscreen}
                            idleContainerRef={stageRef}
                        />
                    </div>
                </div>

                <CallChatPanel
                    variant="watch"
                    showChatHint
                    roomDisplayName={roomDisplayName}
                    className={desktopChatClass}
                />
            </div>

            {chatOpen ? (
                <div className="fixed inset-0 z-40 flex justify-end bg-zinc-900/20 backdrop-blur-[2px] lg:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 cursor-default"
                        aria-label={t("meetsToggleChatHide")}
                        onClick={closeMobileChat}
                    />
                    <div
                        className={MOBILE_CHAT_DRAWER}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label={t("meetsChatTitle")}
                    >
                        <CallChatPanel
                            variant="watch"
                            showChatHint
                            roomDisplayName={roomDisplayName}
                            className="flex min-h-0 flex-1 rounded-none border-0"
                        />
                    </div>
                </div>
            ) : null}

            <MeetingEndedModal
                roomDisplayName={roomDisplayName}
                open={meetingEndedOpen}
                onDismiss={finishLeaveToHub}
                pendingRecording={pendingRecording}
            />

            <MeetLeaveConfirmModal
                open={leaveConfirmOpen}
                onCancel={() => setLeaveConfirmOpen(false)}
                onConfirm={confirmLeave}
            />
        </div>
    );
}

export function CallRoomSession({
    token,
    serverUrl,
    roomDisplayName,
    layout,
    miniDragHandle,
}: Props) {
    return (
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect
            audio
            video={{ resolution: VideoPresets.h1080.resolution }}
            options={MEETS_LIVEKIT_ROOM_OPTIONS}
            data-lk-theme="default"
            className="!text-inherit flex min-h-0 w-full flex-1 flex-col text-zinc-900"
        >
            <CallRoomInner
                roomDisplayName={roomDisplayName}
                layout={layout}
                miniDragHandle={miniDragHandle}
            />
        </LiveKitRoom>
    );
}
