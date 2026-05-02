"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { MeetsMicPrecheck } from "@/components/livekit/MeetsMicPrecheck";
import { CallRoomSession } from "@/components/livekit/CallRoomSession";
import { useMeetCall } from "@/lib/meet-call-context";
import { meetPathMatchesRoom } from "@/lib/meet-call-path";
import { useMeetMiniShellDrag } from "@/components/meet/use-meet-mini-shell-drag";

/**
 * Giữ LiveKitRoom sống khi đổi route: full trên /call/:room khớp session, mini ở màn khác.
 *
 * Quan trọng: không được render hai `<CallRoomSession>` riêng cho full vs mini — React sẽ unmount
 * một cái và mount cái kia → Room reconnect → mất screen share. Luôn dùng một instance, chỉ đổi
 * `layout` + class vỏ bọc.
 */
const SHELL_FULL_OUTER =
    "absolute inset-0 z-20 flex min-h-0 flex-col bg-[#F6F7F9] dark:bg-[#0a0a0b]";
const SHELL_MINI_OUTER_BASE =
    "pointer-events-none fixed z-[70] w-[min(100vw-1.5rem,380px)] max-w-[calc(100vw-1.5rem)]";
const SHELL_MINI_OUTER_DEFAULT_POS = "bottom-4 right-4 md:bottom-6 md:right-6";

const SHELL_FULL_INNER = "flex min-h-0 flex-1 flex-col";
const SHELL_MINI_INNER = "pointer-events-auto";

export function MeetPersistentLayer() {
    const pathname = usePathname() ?? "";
    const { session, micPrecheckDone, setMicPrecheckDone } = useMeetCall();
    const miniShellRef = useRef<HTMLDivElement>(null);
    const { pos: miniShellPos, onDragHandlePointerDown } = useMeetMiniShellDrag(miniShellRef);

    if (!session) {
        return null;
    }

    if (!micPrecheckDone) {
        return (
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm dark:bg-black/55"
                role="dialog"
                aria-modal="true"
                aria-label="Microphone check"
            >
                <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                    <MeetsMicPrecheck onReady={() => setMicPrecheckDone(true)} />
                </div>
            </div>
        );
    }

    const isFull = meetPathMatchesRoom(pathname, session.displayName);

    const sessionEl = (
        <CallRoomSession
            key={session.displayName}
            token={session.token}
            serverUrl={session.serverUrl}
            roomDisplayName={session.displayName}
            layout={isFull ? "full" : "mini"}
            miniDragHandle={
                isFull
                    ? undefined
                    : { onPointerDown: onDragHandlePointerDown }
            }
        />
    );

    if (isFull) {
        return (
            <div className={SHELL_FULL_OUTER}>
                <div className={SHELL_FULL_INNER}>{sessionEl}</div>
            </div>
        );
    }

    return (
        <div
            ref={miniShellRef}
            className={`${SHELL_MINI_OUTER_BASE} ${miniShellPos == null ? SHELL_MINI_OUTER_DEFAULT_POS : ""}`}
            style={
                miniShellPos
                    ? {
                          left: miniShellPos.left,
                          top: miniShellPos.top,
                          right: "auto",
                          bottom: "auto",
                      }
                    : undefined
            }
            data-meet-mini="true"
        >
            <div className={SHELL_MINI_INNER}>{sessionEl}</div>
        </div>
    );
}
