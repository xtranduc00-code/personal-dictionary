"use client";

import { usePathname } from "next/navigation";
import { MeetsMicPrecheck } from "@/components/livekit/MeetsMicPrecheck";
import { CallRoomSession } from "@/components/livekit/CallRoomSession";
import { useMeetCall } from "@/lib/meet-call-context";
import { meetPathMatchesRoom } from "@/lib/meet-call-path";

/**
 * Giữ LiveKitRoom sống khi đổi route: full trên /call/:room khớp session, mini ở màn khác.
 *
 * Quan trọng: không được render hai `<CallRoomSession>` riêng cho full vs mini — React sẽ unmount
 * một cái và mount cái kia → Room reconnect → mất screen share. Luôn dùng một instance, chỉ đổi
 * `layout` + class vỏ bọc.
 */
const SHELL_FULL_OUTER =
    "absolute inset-0 z-20 flex min-h-0 flex-col bg-[#F6F7F9] dark:bg-[#0a0a0b]";
const SHELL_MINI_OUTER =
    "pointer-events-none fixed bottom-4 right-4 z-[70] w-[min(100vw-1.5rem,380px)] max-w-[calc(100vw-1.5rem)] md:bottom-6 md:right-6";

const SHELL_FULL_INNER = "flex min-h-0 flex-1 flex-col";
const SHELL_MINI_INNER =
    "pointer-events-auto max-h-[min(52vh,420px)] overflow-hidden rounded-2xl border border-zinc-200/80 bg-[#0a0a0b] shadow-[0_16px_48px_rgba(0,0,0,0.35)] dark:border-white/10 dark:shadow-black/60";

export function MeetPersistentLayer() {
    const pathname = usePathname();
    const { session, micPrecheckDone, setMicPrecheckDone } = useMeetCall();

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

    return (
        <div
            className={isFull ? SHELL_FULL_OUTER : SHELL_MINI_OUTER}
            data-meet-mini={isFull ? undefined : "true"}
        >
            <div className={isFull ? SHELL_FULL_INNER : SHELL_MINI_INNER}>
                <CallRoomSession
                    key={session.displayName}
                    token={session.token}
                    serverUrl={session.serverUrl}
                    roomDisplayName={session.displayName}
                    layout={isFull ? "full" : "mini"}
                />
            </div>
        </div>
    );
}
