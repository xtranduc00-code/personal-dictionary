"use client";

import { memo, useEffect, useState } from "react";
import { Circle, Clock, LogOut, Maximize2, Minimize2, MonitorUp, Users } from "lucide-react";
import { useParticipants, useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import { useI18n } from "@/components/i18n-provider";
import { formatMmSs } from "@/lib/meets-format";
import { avatarColor, getInitials } from "@/lib/meets-avatar";

const MAX_HEADER_CHIPS = 5;

type Props = {
    roomDisplayName: string;
    /** Local participant is sharing their screen — Meet-style badge, no layout switch. */
    isPresenting?: boolean;
    /** Mở bước xác nhận rời phòng (parent gọi `beginLeave` sau khi user confirm). */
    onLeaveClick: () => void;
    onToggleStageFullscreen: () => void;
    isStageFullscreen: boolean;
};

export const CallRoomHeader = memo(function CallRoomHeader({
    roomDisplayName,
    isPresenting = false,
    onLeaveClick,
    onToggleStageFullscreen,
    isStageFullscreen,
}: Props) {
    const { t } = useI18n();
    const room = useRoomContext();
    const participants = useParticipants();
    const count = participants.length;
    const [elapsedSec, setElapsedSec] = useState(0);
    const [timerRunning, setTimerRunning] = useState(false);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const sync = () => {
            const ok = room.state === ConnectionState.Connected;
            setConnected(ok);
            if (ok) {
                setTimerRunning(true);
            }
        };
        sync();
        room.on(RoomEvent.Connected, sync);
        room.on(RoomEvent.Reconnected, sync);
        const onDisconnected = () => {
            setTimerRunning(false);
            setElapsedSec(0);
            setConnected(false);
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

    const peopleLabel =
        count === 1 ? t("meetsPeopleOne") : t("meetsPeopleMany").replace("{n}", String(count));

    return (
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3 py-2.5 shadow-sm sm:px-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 md:gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {connected ? (
                        <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-200"
                            title={t("meetsRoomConnected")}
                        >
                            <Circle className="h-1.5 w-1.5 fill-emerald-600 text-emerald-600" aria-hidden />
                            {t("meetsLiveBadge")}
                        </span>
                    ) : null}
                    <p
                        className="truncate font-mono text-sm font-bold tracking-tight text-zinc-900 sm:text-base"
                        title={roomDisplayName}
                    >
                        {roomDisplayName}
                    </p>
                    {isPresenting ? (
                        <span className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                            <MonitorUp className="h-3.5 w-3.5 shrink-0 text-emerald-700" strokeWidth={2} aria-hidden />
                            <span className="truncate">{t("meetsYouArePresenting")}</span>
                        </span>
                    ) : null}
                </div>
                <span className="hidden h-4 w-px shrink-0 bg-zinc-200 sm:block" aria-hidden />
                <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-zinc-600 sm:text-sm">
                    <span className="inline-flex items-center gap-2 whitespace-nowrap font-medium">
                        <Users className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={2} aria-hidden />
                        <span className="text-zinc-700">{peopleLabel}</span>
                        {participants.length > 0 ? (
                            <span className="inline-flex items-center -space-x-1.5">
                                {participants.slice(0, MAX_HEADER_CHIPS).map((p) => {
                                    const name = p.name || p.identity || "Guest";
                                    return (
                                        <span
                                            key={p.sid || p.identity}
                                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white ${avatarColor(name)}`}
                                            title={name}
                                        >
                                            {getInitials(name)}
                                        </span>
                                    );
                                })}
                                {participants.length > MAX_HEADER_CHIPS ? (
                                    <span
                                        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-zinc-700 px-1.5 text-[10px] font-semibold text-white ring-2 ring-white"
                                        aria-hidden
                                    >
                                        {`+${participants.length - MAX_HEADER_CHIPS}`}
                                    </span>
                                ) : null}
                            </span>
                        ) : null}
                    </span>
                    <span
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono tabular-nums text-zinc-800"
                        title={t("meetsCallTimerHint")}
                    >
                        <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                        {formatMmSs(elapsedSec)}
                    </span>
                </div>
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
                <button
                    type="button"
                    onClick={onToggleStageFullscreen}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
                    aria-label={t("ariaToggleFullscreen")}
                    title={t("ariaToggleFullscreen")}
                >
                    {isStageFullscreen ? (
                        <Minimize2 className="h-4 w-4" strokeWidth={2} />
                    ) : (
                        <Maximize2 className="h-4 w-4" strokeWidth={2} />
                    )}
                </button>
                <button
                    type="button"
                    onClick={onLeaveClick}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-red-600 px-3.5 text-sm font-bold text-white shadow-md shadow-red-900/30 transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                >
                    <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    {t("meetsLeaveRoom")}
                </button>
            </div>
        </header>
    );
});
