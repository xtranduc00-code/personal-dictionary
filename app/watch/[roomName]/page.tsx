"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { WatchPartySession } from "@/components/livekit/WatchPartySession";
import { authFetch } from "@/lib/auth-context";
import { MEETS_ROOM_NAME_RE } from "@/lib/meets-recent-rooms";

type TokenState =
    | { status: "idle" | "loading" }
    | { status: "ready"; token: string; serverUrl: string; room: string }
    | { status: "error"; code: string; detail?: string };

export default function WatchRoomPage() {
    const { t } = useI18n();
    const params = useParams();
    const roomSegment = typeof params.roomName === "string" ? params.roomName : "";
    const [state, setState] = useState<TokenState>({ status: "idle" });
    const genRef = useRef(0);

    const roomDecoded = (() => {
        try {
            return decodeURIComponent(roomSegment);
        }
        catch {
            return roomSegment;
        }
    })();

    useEffect(() => {
        if (!roomSegment) {
            return;
        }
        if (!MEETS_ROOM_NAME_RE.test(roomDecoded)) {
            setState({ status: "error", code: "invalid_room" });
            return;
        }
        const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
        if (!serverUrl) {
            setState({ status: "error", code: "no_url" });
            return;
        }
        const gen = ++genRef.current;
        setState({ status: "loading" });
        void (async () => {
            try {
                const res = await authFetch(
                    `/api/livekit-token?room=${encodeURIComponent(roomDecoded)}`,
                );
                const data = (await res.json()) as { token?: string; error?: string };
                if (gen !== genRef.current) {
                    return;
                }
                if (!res.ok) {
                    setState({
                        status: "error",
                        code: "token",
                        detail: data.error ?? `http_${res.status}`,
                    });
                    return;
                }
                if (!data.token) {
                    setState({ status: "error", code: "no_token" });
                    return;
                }
                setState({
                    status: "ready",
                    token: data.token,
                    serverUrl,
                    room: roomDecoded,
                });
            }
            catch {
                if (gen !== genRef.current) {
                    return;
                }
                setState({ status: "error", code: "fetch_failed" });
            }
        })();
    }, [roomSegment, roomDecoded]);

    if (!roomSegment) {
        return (
            <p className="px-4 text-sm text-[#6B7280] dark:text-zinc-400">
                {t("meetsInvalidRoom")}{" "}
                <Link
                    href="/watch"
                    className="font-medium text-zinc-700 underline decoration-zinc-700/30 hover:text-zinc-800 dark:text-zinc-400 dark:decoration-zinc-400/30 dark:hover:text-zinc-300"
                >
                    {t("watchTogetherNav")}
                </Link>
            </p>
        );
    }

    if (state.status === "error") {
        if (state.code === "invalid_room") {
            return (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="font-medium">{t("meetsInvalidRoom")}</p>
                    <Link href="/watch" className="mt-3 inline-block text-sm underline">
                        {t("watchTogetherNav")}
                    </Link>
                </div>
            );
        }
        if (state.code === "no_url") {
            return (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
                    <p className="font-medium">{t("meetsMissingPublicUrl")}</p>
                </div>
            );
        }
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
                <p className="font-medium">{t("meetsTokenError")}</p>
                {state.detail ? (
                    <p className="mt-1 text-sm opacity-90">{state.detail}</p>
                ) : null}
                <Link href="/watch" className="mt-3 inline-block text-sm underline">
                    {t("watchTogetherNav")}
                </Link>
            </div>
        );
    }

    if (state.status === "loading" || state.status === "idle") {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] dark:text-zinc-400">
                <p className="text-sm">{t("meetsConnecting")}</p>
            </div>
        );
    }

    if (state.status !== "ready") {
        return null;
    }

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <WatchPartySession
                token={state.token}
                serverUrl={state.serverUrl}
                roomDisplayName={state.room}
            />
        </div>
    );
}
