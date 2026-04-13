"use client";

import {
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type RefObject,
} from "react";
import { toast } from "react-toastify";
import {
    Circle,
    Maximize2,
    MessageSquare,
    Mic,
    MicOff,
    Minimize2,
    MonitorUp,
    PhoneOff,
    Square,
    Video,
    VideoOff,
} from "lucide-react";
import { useLocalParticipant } from "@livekit/components-react";
import { MicLevelBars } from "@/components/livekit/MicLevelBars";
import { useI18n } from "@/components/i18n-provider";
import { Tooltip } from "@/components/ui/Tooltip";
import { MEETS_SCREEN_SHARE_CAPTURE } from "@/lib/meets-livekit-options";
import { useMeetsLocalMicLevel } from "@/lib/use-meets-local-mic-level";

export type CallRecordingUiProps = {
    isRecording: boolean;
    recordingElapsedSec: number;
    recordBusy: boolean;
    onRecordToggle: () => void;
};

type CallControlsProps = {
    recording: CallRecordingUiProps;
    chatOpen?: boolean;
    onToggleChat?: () => void;
    onLeave: () => void | Promise<void>;
    /** Mini overlay: chỉ mic, cam, kết thúc — gọn cho PiP. */
    variant?: "full" | "mini";
    /** Thanh điều khiển nổi trên nền video tối — dock tối + shadow rõ. */
    toolbarSurface?: "default" | "darkDock";
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
    /** When set, the full toolbar auto-hides after 3s of no mouse activity inside this container. */
    idleContainerRef?: RefObject<HTMLElement | null>;
};

const btnLight =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus-visible:ring-white/20";

const btnLightOn =
    "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60";

const btnMuted =
    "!border-0 !bg-red-500 !text-white hover:!bg-red-600 dark:!bg-red-600 dark:hover:!bg-red-500";

const btnShareActive =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-emerald-600 text-white shadow-[0_0_0_2px_rgba(16,185,129,0.35)] transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-emerald-400/40";

/** Nút trên dock tối — icon trắng, nền tối nhẹ, giữ đỏ cho state tắt. */
const btnDock =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-white/10 text-white shadow-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30";

const btnDockOn =
    "bg-emerald-500/25 text-white hover:bg-emerald-500/35";

const toolbarDarkDock =
    "meet-toolbar-enter pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full px-2 py-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.35)] sm:gap-2 sm:px-2.5";

const toolbarDarkDockStyle: CSSProperties = {
    backgroundColor: "rgba(30,30,30,0.85)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "0.5px solid rgba(255,255,255,0.08)",
};

const IDLE_HIDE_MS = 3000;

export const CallControls = memo(function CallControls({
    recording,
    chatOpen,
    onToggleChat,
    onLeave,
    variant = "full",
    toolbarSurface = "default",
    isFullscreen,
    onToggleFullscreen,
    idleContainerRef,
}: CallControlsProps) {
    const { t } = useI18n();
    const {
        localParticipant,
        isMicrophoneEnabled,
        isCameraEnabled,
        isScreenShareEnabled,
    } = useLocalParticipant();

    const micLevel = useMeetsLocalMicLevel(isMicrophoneEnabled);

    const toggleMic = useCallback(async () => {
        try {
            await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
        }
        catch {
            toast.error(t("meetsMicToggleFailed"));
        }
    }, [localParticipant, isMicrophoneEnabled, t]);

    const toggleCam = useCallback(() => {
        void localParticipant.setCameraEnabled(!isCameraEnabled);
    }, [localParticipant, isCameraEnabled]);

    const toggleShare = useCallback(() => {
        void localParticipant.setScreenShareEnabled(!isScreenShareEnabled, MEETS_SCREEN_SHARE_CAPTURE);
    }, [localParticipant, isScreenShareEnabled]);

    const { isRecording, recordingElapsedSec, recordBusy, onRecordToggle } = recording;

    const isMini = variant === "mini";
    const onDarkDock = !isMini;
    void toolbarSurface;
    const baseBtn = onDarkDock ? btnDock : btnLight;
    const onBtn = onDarkDock ? btnDockOn : btnLightOn;
    const micTooltip = isMicrophoneEnabled
        ? `${t("meetsMuteMic")} — ${t("meetsMicLevelHint")}`
        : t("meetsUnmuteMic");
    const camTooltip = isCameraEnabled ? t("meetsCamOff") : t("meetsCamOn");
    const shareTooltip = isScreenShareEnabled
        ? t("meetsStopShare")
        : `${t("meetsShareScreen")} (${t("meetsShareScreenAudioHint")})`;
    const endBtn = isMini
        ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-red-600 text-white shadow-sm transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 dark:bg-red-600 dark:hover:bg-red-500"
        : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-[#EF4444] text-white shadow-sm transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 dark:bg-red-600 dark:hover:bg-red-500";

    // Auto-hide after 3s of no mouse activity inside the call area (full toolbar only).
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [hidden, setHidden] = useState(false);
    const [barHover, setBarHover] = useState(false);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const keepVisible = isRecording || barHover;

    useEffect(() => {
        if (isMini) return;
        const container = idleContainerRef?.current ?? null;
        if (!container) {
            setHidden(false);
            return;
        }
        const setCursor = (v: string) => {
            container.style.cursor = v;
        };
        const arm = () => {
            if (idleTimer.current) clearTimeout(idleTimer.current);
            if (keepVisible) return;
            idleTimer.current = setTimeout(() => {
                setHidden(true);
                setCursor("none");
            }, IDLE_HIDE_MS);
        };
        const show = () => {
            setHidden(false);
            setCursor("");
            arm();
        };
        const hideNow = () => {
            if (idleTimer.current) clearTimeout(idleTimer.current);
            if (keepVisible) return;
            setHidden(true);
            setCursor("");
        };
        show();
        container.addEventListener("mousemove", show);
        container.addEventListener("mouseenter", show);
        container.addEventListener("mouseleave", hideNow);
        return () => {
            container.removeEventListener("mousemove", show);
            container.removeEventListener("mouseenter", show);
            container.removeEventListener("mouseleave", hideNow);
            if (idleTimer.current) clearTimeout(idleTimer.current);
            setCursor("");
        };
    }, [idleContainerRef, isMini, keepVisible]);

    if (isMini) {
        return (
            <div className="pointer-events-none flex flex-col items-center gap-1.5">
                <div
                    className="pointer-events-auto flex items-center justify-center gap-1.5 rounded-full border border-zinc-200 bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-md"
                    role="toolbar"
                    aria-label={t("meetsControlsToolbar")}
                >
                    <div className="flex items-end gap-0.5" role="group" aria-label={t("meetsMicGroupAria")}>
                        {isMicrophoneEnabled ? (
                            <MicLevelBars
                                level={micLevel}
                                className="mb-0.5 text-emerald-600"
                                barClassName="bg-emerald-500"
                            />
                        ) : null}
                        <Tooltip content={micTooltip} placement="top">
                            <button
                                type="button"
                                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-[#F3F4F6] text-[#374151] transition hover:bg-[#E5E7EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 ${isMicrophoneEnabled ? btnLightOn : ""} ${!isMicrophoneEnabled ? btnMuted : ""}`}
                                onClick={() => void toggleMic()}
                                aria-label={isMicrophoneEnabled ? t("meetsMuteMic") : t("meetsUnmuteMic")}
                                aria-pressed={!isMicrophoneEnabled}
                            >
                                {isMicrophoneEnabled ? (
                                    <Mic className="h-4 w-4" strokeWidth={2} />
                                ) : (
                                    <MicOff className="h-4 w-4" strokeWidth={2} />
                                )}
                            </button>
                        </Tooltip>
                    </div>
                    <Tooltip content={camTooltip} placement="top">
                        <button
                            type="button"
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-[#F3F4F6] text-[#374151] transition hover:bg-[#E5E7EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 ${isCameraEnabled ? btnLightOn : ""} ${!isCameraEnabled ? btnMuted : ""}`}
                            onClick={toggleCam}
                            aria-label={isCameraEnabled ? t("meetsCamOff") : t("meetsCamOn")}
                            aria-pressed={!isCameraEnabled}
                        >
                            {isCameraEnabled ? (
                                <Video className="h-4 w-4" strokeWidth={2} />
                            ) : (
                                <VideoOff className="h-4 w-4" strokeWidth={2} />
                            )}
                        </button>
                    </Tooltip>
                    <Tooltip content={shareTooltip} placement="top">
                        <button
                            type="button"
                            className={
                                isScreenShareEnabled
                                    ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-emerald-600 text-white shadow-[0_0_0_2px_rgba(16,185,129,0.35)] transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                                    : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-[#F3F4F6] text-[#374151] transition hover:bg-[#E5E7EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
                            }
                            onClick={toggleShare}
                            aria-label={isScreenShareEnabled ? t("meetsStopShare") : t("meetsShareScreen")}
                            aria-pressed={isScreenShareEnabled}
                        >
                            {isScreenShareEnabled ? (
                                <Square className="h-4 w-4" strokeWidth={2} />
                            ) : (
                                <MonitorUp className="h-4 w-4" strokeWidth={2} />
                            )}
                        </button>
                    </Tooltip>
                    <Tooltip content={t("meetsEndCall")} placement="top">
                        <button
                            type="button"
                            className={endBtn}
                            onClick={() => void onLeave()}
                            aria-label={t("meetsEndCall")}
                        >
                            <PhoneOff className="h-4 w-4" strokeWidth={2} />
                        </button>
                    </Tooltip>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={toolbarRef}
            className="flex flex-col items-center gap-1.5"
            style={{
                transition: "opacity 0.25s ease, transform 0.25s ease",
                opacity: hidden ? 0 : 1,
                transform: hidden ? "translateY(20px)" : "translateY(0)",
                pointerEvents: hidden ? "none" : "auto",
            }}
            onMouseEnter={() => setBarHover(true)}
            onMouseLeave={() => setBarHover(false)}
        >
            <div
                className={toolbarDarkDock}
                style={toolbarDarkDockStyle}
                role="toolbar"
                aria-label={t("meetsControlsToolbar")}
            >
                <div
                    className="flex items-end gap-0.5"
                    role="group"
                    aria-label={t("meetsMicGroupAria")}
                >
                    {isMicrophoneEnabled ? (
                        <MicLevelBars
                            level={micLevel}
                            className={`mb-0.5 ${onDarkDock ? "text-emerald-300" : "text-emerald-600 dark:text-emerald-300"}`}
                            barClassName={onDarkDock ? "bg-emerald-400" : "bg-emerald-500 dark:bg-emerald-400"}
                        />
                    ) : null}
                    <Tooltip content={micTooltip} placement="top">
                        <button
                            type="button"
                            className={`${baseBtn} ${isMicrophoneEnabled ? onBtn : ""} ${!isMicrophoneEnabled ? btnMuted : ""}`}
                            onClick={() => void toggleMic()}
                            aria-label={isMicrophoneEnabled ? t("meetsMuteMic") : t("meetsUnmuteMic")}
                            aria-pressed={!isMicrophoneEnabled}
                        >
                            {isMicrophoneEnabled ? (
                                <Mic className="h-[18px] w-[18px]" strokeWidth={2} />
                            ) : (
                                <MicOff className="h-[18px] w-[18px]" strokeWidth={2} />
                            )}
                        </button>
                    </Tooltip>
                </div>
                <Tooltip content={camTooltip} placement="top">
                    <button
                        type="button"
                        className={`${baseBtn} ${isCameraEnabled ? onBtn : ""} ${!isCameraEnabled ? btnMuted : ""}`}
                        onClick={toggleCam}
                        aria-label={isCameraEnabled ? t("meetsCamOff") : t("meetsCamOn")}
                        aria-pressed={!isCameraEnabled}
                    >
                        {isCameraEnabled ? (
                            <Video className="h-[18px] w-[18px]" strokeWidth={2} />
                        ) : (
                            <VideoOff className="h-[18px] w-[18px]" strokeWidth={2} />
                        )}
                    </button>
                </Tooltip>

                <Tooltip content={shareTooltip} placement="top">
                    <button
                        type="button"
                        className={isScreenShareEnabled ? btnShareActive : baseBtn}
                        onClick={toggleShare}
                        aria-label={isScreenShareEnabled ? t("meetsStopShare") : t("meetsShareScreen")}
                        aria-pressed={isScreenShareEnabled}
                    >
                        {isScreenShareEnabled ? (
                            <Square className="h-[18px] w-[18px]" strokeWidth={2} />
                        ) : (
                            <MonitorUp className="h-[18px] w-[18px]" strokeWidth={2} />
                        )}
                    </button>
                </Tooltip>

                {onToggleChat ? (
                    <Tooltip
                        content={chatOpen ? t("meetsToggleChatHide") : t("meetsToggleChat")}
                        placement="top"
                    >
                        <button
                            type="button"
                            className={
                                chatOpen
                                    ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-900 text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                    : baseBtn
                            }
                            aria-pressed={chatOpen ?? false}
                            onClick={onToggleChat}
                            aria-label={chatOpen ? t("meetsToggleChatHide") : t("meetsToggleChat")}
                        >
                            <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2} />
                        </button>
                    </Tooltip>
                ) : null}

                <Tooltip
                    content={
                        isRecording ? t("meetsRecordingStop") : t("meetsRecordingStartLocal")
                    }
                    placement="top"
                >
                    <button
                        type="button"
                        disabled={recordBusy}
                        className={
                            isRecording
                                ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-red-600 text-white shadow-[0_0_0_3px_rgba(239,68,68,0.35)] animate-pulse transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-60 dark:bg-red-600 dark:hover:bg-red-500"
                                : onDarkDock
                                  ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-red-400/80 bg-zinc-900/60 text-red-400 transition hover:bg-red-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 disabled:opacity-60"
                                  : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-white/90 text-red-500 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 disabled:opacity-60 dark:border-red-500 dark:bg-zinc-900/80 dark:text-red-400 dark:hover:bg-red-950/50"
                        }
                        onClick={onRecordToggle}
                        aria-label={isRecording ? t("meetsRecordingStop") : t("meetsRecordingStartLocal")}
                        aria-pressed={isRecording}
                    >
                        {isRecording ? (
                            <Circle className="h-3 w-3 fill-white text-white" strokeWidth={0} />
                        ) : (
                            <Circle className="h-3.5 w-3.5 fill-transparent" strokeWidth={2.5} />
                        )}
                    </button>
                </Tooltip>

                {onToggleFullscreen ? (
                    <Tooltip content={t("ariaToggleFullscreen")} placement="top">
                        <button
                            type="button"
                            className={baseBtn}
                            onClick={onToggleFullscreen}
                            aria-label={t("ariaToggleFullscreen")}
                            aria-pressed={isFullscreen ?? false}
                        >
                            {isFullscreen ? (
                                <Minimize2 className="h-[18px] w-[18px]" strokeWidth={2} />
                            ) : (
                                <Maximize2 className="h-[18px] w-[18px]" strokeWidth={2} />
                            )}
                        </button>
                    </Tooltip>
                ) : null}

                <Tooltip content={t("meetsEndCall")} placement="top">
                    <button
                        type="button"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-[#EF4444] text-white shadow-sm transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 dark:bg-red-600 dark:hover:bg-red-500"
                        onClick={() => void onLeave()}
                        aria-label={t("meetsEndCall")}
                    >
                        <PhoneOff className="h-[18px] w-[18px]" strokeWidth={2} />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
});
