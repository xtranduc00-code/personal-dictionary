"use client";

import { memo, useCallback } from "react";
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
import { formatMmSs } from "@/lib/meets-format";
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
    onToggleStageFullscreen?: () => void;
    isStageFullscreen?: boolean;
    /** Mini overlay: chỉ mic, cam, kết thúc — gọn cho PiP. */
    variant?: "full" | "mini";
    /** Thanh điều khiển nổi trên nền video tối — dock tối + shadow rõ. */
    toolbarSurface?: "default" | "darkDock";
};

const btnLight =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus-visible:ring-white/20";

const btnLightOn =
    "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60";

const btnMuted =
    "!border-0 !bg-red-500 !text-white hover:!bg-red-600 dark:!bg-red-600 dark:hover:!bg-red-500";

const btnShareActive =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-emerald-600 text-white shadow-[0_0_0_2px_rgba(16,185,129,0.35)] transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-emerald-400/40";

/** Nút trên dock tối (luôn dùng khi toolbarSurface=darkDock). */
const btnDock =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-600/60 bg-zinc-800/95 text-zinc-100 shadow-sm transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";

const btnDockOn =
    "border-emerald-500/40 bg-emerald-900/45 text-emerald-100 hover:bg-emerald-900/60";

const toolbarDarkDock =
    "meet-toolbar-enter pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-[1.75rem] border border-white/12 bg-zinc-950/80 px-2 py-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-2xl ring-1 ring-black/40 sm:gap-2 sm:px-3";

export const CallControls = memo(function CallControls({
    recording,
    chatOpen,
    onToggleChat,
    onLeave,
    onToggleStageFullscreen,
    isStageFullscreen,
    variant = "full",
    toolbarSurface = "default",
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
    const onDarkDock = toolbarSurface === "darkDock" && !isMini;
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
        : "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[#EF4444] text-white shadow-sm transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 dark:bg-red-600 dark:hover:bg-red-500";

    if (isMini) {
        return (
            <div className="pointer-events-none flex flex-col items-center gap-1.5">
                {isRecording ? (
                    <div
                        className="pointer-events-none flex max-w-[min(100%,280px)] items-center gap-1.5 rounded-md border border-red-500/40 bg-red-700/90 px-2 py-1 text-[10px] font-semibold text-white"
                        role="status"
                        aria-live="polite"
                    >
                        <span className="shrink-0 font-mono tabular-nums">
                            {t("meetsRecPrefix")} {formatMmSs(recordingElapsedSec)}
                        </span>
                    </div>
                ) : null}
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
        <div className="pointer-events-none flex flex-col items-center gap-2">
            {isRecording ? (
                <div
                    className="pointer-events-none flex max-w-[min(100%,320px)] items-center gap-2 rounded-lg border border-red-400/50 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg dark:border-red-500/40 dark:bg-red-700"
                    role="status"
                    aria-live="polite"
                >
                    <span className="shrink-0 font-mono tabular-nums tracking-tight">
                        {t("meetsRecPrefix")} {formatMmSs(recordingElapsedSec)}
                    </span>
                    <span className="truncate opacity-95">· {t("meetsVideoRecordingLabel")}</span>
                </div>
            ) : null}

            <div
                className={
                    onDarkDock
                        ? toolbarDarkDock
                        : "meet-toolbar-enter pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-[#E5E7EB] bg-white/85 px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-white/12 dark:bg-black/50 dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)] dark:backdrop-blur-xl sm:gap-2 sm:px-3"
                }
                role="toolbar"
                aria-label={t("meetsControlsToolbar")}
            >
                <div
                    className="flex items-end gap-1"
                    role="group"
                    aria-label={t("meetsMicGroupAria")}
                >
                    {isMicrophoneEnabled ? (
                        <MicLevelBars
                            level={micLevel}
                            className={`mb-1 ${onDarkDock ? "text-emerald-300" : "text-emerald-600 dark:text-emerald-300"}`}
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
                                <Mic className="h-5 w-5" strokeWidth={2} />
                            ) : (
                                <MicOff className="h-5 w-5" strokeWidth={2} />
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
                            <Video className="h-5 w-5" strokeWidth={2} />
                        ) : (
                            <VideoOff className="h-5 w-5" strokeWidth={2} />
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
                            <Square className="h-5 w-5" strokeWidth={2} />
                        ) : (
                            <MonitorUp className="h-5 w-5" strokeWidth={2} />
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
                                    ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-900 text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                    : baseBtn
                            }
                            aria-pressed={chatOpen ?? false}
                            onClick={onToggleChat}
                            aria-label={chatOpen ? t("meetsToggleChatHide") : t("meetsToggleChat")}
                        >
                            <MessageSquare className="h-5 w-5" strokeWidth={2} />
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
                                ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-red-600 text-white shadow-[0_0_0_3px_rgba(239,68,68,0.35)] animate-pulse transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-60 dark:bg-red-600 dark:hover:bg-red-500"
                                : onDarkDock
                                  ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-red-400/80 bg-zinc-900/60 text-red-400 transition hover:bg-red-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 disabled:opacity-60"
                                  : "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-white/90 text-red-500 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 disabled:opacity-60 dark:border-red-500 dark:bg-zinc-900/80 dark:text-red-400 dark:hover:bg-red-950/50"
                        }
                        onClick={onRecordToggle}
                        aria-label={isRecording ? t("meetsRecordingStop") : t("meetsRecordingStartLocal")}
                        aria-pressed={isRecording}
                    >
                        {isRecording ? (
                            <Circle className="h-3 w-3 fill-white text-white" strokeWidth={0} />
                        ) : (
                            <Circle className="h-4 w-4 fill-transparent" strokeWidth={2.5} />
                        )}
                    </button>
                </Tooltip>

                {onToggleStageFullscreen ? (
                    <Tooltip content={t("ariaToggleFullscreen")} placement="top">
                        <button
                            type="button"
                            className={baseBtn}
                            onClick={onToggleStageFullscreen}
                            aria-label={t("ariaToggleFullscreen")}
                        >
                            {isStageFullscreen ? (
                                <Minimize2 className="h-5 w-5" strokeWidth={2} />
                            ) : (
                                <Maximize2 className="h-5 w-5" strokeWidth={2} />
                            )}
                        </button>
                    </Tooltip>
                ) : null}

                <Tooltip content={t("meetsEndCall")} placement="top">
                    <button
                        type="button"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[#EF4444] text-white shadow-sm transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 dark:bg-red-600 dark:hover:bg-red-500"
                        onClick={() => void onLeave()}
                        aria-label={t("meetsEndCall")}
                    >
                        <PhoneOff className="h-5 w-5" strokeWidth={2} />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
});
