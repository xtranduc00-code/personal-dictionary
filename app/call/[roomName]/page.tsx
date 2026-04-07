"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useMeetCall } from "@/lib/meet-call-context";

export default function CallRoomPage() {
    const { t } = useI18n();
    const params = useParams();
    const roomName = typeof params.roomName === "string" ? params.roomName : "";
    const { requestJoin, connecting, error, session } = useMeetCall();

    useEffect(() => {
        if (!roomName) {
            return;
        }
        requestJoin(roomName);
    }, [roomName, requestJoin]);

    if (!roomName) {
        return (
            <p className="px-4 text-sm text-zinc-500 dark:text-zinc-400">
                {t("meetsInvalidRoom")}{" "}
                <Link
                    href="/call"
                    className="font-medium text-zinc-700 underline decoration-zinc-400/30 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                >
                    {t("meetsBackToHub")}
                </Link>
            </p>
        );
    }

    if (error === "invalid_room") {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-medium">{t("meetsInvalidRoom")}</p>
                <Link href="/call" className="mt-3 inline-block text-sm underline">
                    {t("meetsBackToHub")}
                </Link>
            </div>
        );
    }
    if (error === "no_url") {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
                <p className="font-medium">{t("meetsMissingPublicUrl")}</p>
            </div>
        );
    }
    if (error) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
                <p className="font-medium">{t("meetsTokenError")}</p>
                <p className="mt-1 text-sm opacity-90">{error}</p>
                <Link href="/call" className="mt-3 inline-block text-sm underline">
                    {t("meetsBackToHub")}
                </Link>
            </div>
        );
    }

    if (!session && connecting) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-500 dark:text-zinc-400">
                <p className="text-sm">{t("meetsConnecting")}</p>
            </div>
        );
    }

    /** Token OK / mic / LiveKit: MeetPersistentLayer + overlay xử lý UI. */
    if (session) {
        return null;
    }

    return null;
}
