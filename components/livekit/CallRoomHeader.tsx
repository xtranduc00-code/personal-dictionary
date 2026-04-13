"use client";

import { memo, useEffect, useState } from "react";
import { Clock, LogOut, MonitorUp } from "lucide-react";
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
};

export const CallRoomHeader = memo(function CallRoomHeader({
    roomDisplayName,
    isPresenting = false,
    onLeaveClick,
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

    const participantLabel = count === 1 ? "1 participant" : `${count} participants`;

    const readableRoomName = humanizeRoomName(roomDisplayName, room.metadata);

    return (
        <header
            className="flex h-[52px] shrink-0 items-center justify-between bg-white px-5"
            style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
            <div className="flex min-w-0 items-center gap-3">
                {connected ? (
                    <span
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[12px] font-medium text-emerald-700"
                        title={t("meetsRoomConnected")}
                    >
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                        Live
                    </span>
                ) : null}
                <p
                    className="truncate text-[15px] font-medium text-zinc-900"
                    title={readableRoomName}
                >
                    {readableRoomName}
                </p>
                <div className="flex min-w-0 items-center gap-2 text-[12px] text-zinc-500">
                    <span aria-hidden>·</span>
                    <span className="whitespace-nowrap">{participantLabel}</span>
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
                    <span aria-hidden>·</span>
                    <span
                        className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"
                        title={t("meetsCallTimerHint")}
                    >
                        <Clock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                        {formatMmSs(elapsedSec)}
                    </span>
                </div>
                {isPresenting ? (
                    <span className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[12px] font-medium text-emerald-700">
                        <MonitorUp className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="truncate">{t("meetsYouArePresenting")}</span>
                    </span>
                ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <button
                    type="button"
                    onClick={onLeaveClick}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-[14px] text-[13px] font-medium text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                    style={{ backgroundColor: "#E24B4A" }}
                >
                    <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    {t("meetsLeaveRoom")}
                </button>
            </div>
        </header>
    );
});

function humanizeRoomName(raw: string, metadata?: string): string {
    if (metadata) {
        try {
            const parsed = JSON.parse(metadata) as { name?: unknown; displayName?: unknown };
            const fromMeta =
                (typeof parsed.name === "string" && parsed.name.trim()) ||
                (typeof parsed.displayName === "string" && parsed.displayName.trim());
            if (fromMeta) {
                return fromMeta;
            }
        } catch {
            // metadata is free-form; fall through to heuristics
        }
    }
    if (/^meet-[a-z0-9]+$/i.test(raw)) {
        return "Meeting room";
    }
    return raw || "Meeting room";
}
