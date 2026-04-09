"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/lib/auth-context";
import { useMeetCall } from "@/lib/meet-call-context";

export default function CallRoomPage() {
    const { t } = useI18n();
    const params = useParams();
    const roomName = typeof params.roomName === "string" ? params.roomName : "";
    const { requestJoin, connecting, error, session } = useMeetCall();
    const { user } = useAuth();

    // Guest name entry state
    const [guestName, setGuestName] = useState("");
    const [nameConfirmed, setNameConfirmed] = useState(false);

    // Auto-join for logged-in users
    useEffect(() => {
        if (!roomName || !user) return;
        requestJoin(roomName);
    }, [roomName, user, requestJoin]);

    // Join after guest confirms name
    useEffect(() => {
        if (!roomName || user || !nameConfirmed) return;
        requestJoin(roomName, guestName || undefined);
    }, [roomName, user, nameConfirmed, guestName, requestJoin]);

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

    // Guest name entry screen (only for non-logged-in users who haven't confirmed)
    if (!user && !nameConfirmed) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
                <div className="w-full max-w-sm space-y-6">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
                            <UserRound className="h-8 w-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
                        </div>
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                            {t("meetsGuestNameTitle")}
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            {t("meetsGuestNameHint")}
                        </p>
                    </div>
                    <input
                        type="text"
                        autoComplete="off"
                        placeholder={t("meetsGuestNamePlaceholder")}
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && setNameConfirmed(true)}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-1 dark:focus:ring-white/15"
                    />
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => setNameConfirmed(true)}
                            className="w-full rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                            {guestName.trim() ? t("meetsGuestJoinWithName") : t("meetsGuestJoinAnonymous")}
                        </button>
                    </div>
                </div>
            </div>
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
