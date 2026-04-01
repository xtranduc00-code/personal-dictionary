"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, PhoneCall, Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import {
    generateMeetRoomSlug,
    getRecentMeetRooms,
    MEETS_ROOM_NAME_RE,
    rememberMeetRoom,
    type MeetRecentEntry,
} from "@/lib/meets-recent-rooms";

export default function WatchHubPage() {
    const { t } = useI18n();
    const router = useRouter();
    const [slug, setSlug] = useState("");
    const [hint, setHint] = useState<string | null>(null);
    const [recent, setRecent] = useState<MeetRecentEntry[]>([]);

    const refreshRecent = useCallback(() => {
        setRecent(getRecentMeetRooms());
    }, []);

    useEffect(() => {
        refreshRecent();
    }, [refreshRecent]);

    const goToRoom = useCallback(
        (room: string) => {
            rememberMeetRoom(room);
            refreshRecent();
            router.push(`/watch/${encodeURIComponent(room)}`);
        },
        [router, refreshRecent],
    );

    const createRoom = () => {
        setHint(null);
        goToRoom(generateMeetRoomSlug());
    };

    const joinRoom = () => {
        const trimmed = slug.trim();
        const room = trimmed === "" ? generateMeetRoomSlug() : trimmed;
        if (!MEETS_ROOM_NAME_RE.test(room)) {
            setHint(t("meetsInvalidRoom"));
            return;
        }
        setHint(null);
        goToRoom(room);
    };

    const card =
        "rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] sm:p-9 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] dark:hover:translate-y-0 dark:hover:border-white/15 dark:hover:shadow-none dark:backdrop-blur-sm";
    const inputClass =
        "w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5 text-sm text-[#111827] shadow-none outline-none ring-0 placeholder:text-[#9CA3AF] focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-black/30 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/25 dark:focus:ring-1 dark:focus:ring-white/20";
    const actionBtn =
        "inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-blue-200 bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow-[0_1px_2px_rgba(59,130,246,0.08)] transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 sm:w-auto sm:min-w-[10rem] dark:border-sky-500/35 dark:bg-white/10 dark:text-sky-100 dark:shadow-none dark:hover:border-sky-400/50 dark:hover:bg-sky-950/40 dark:focus-visible:ring-sky-400/40";
    const createBtn =
        "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_-2px_rgba(59,130,246,0.55)] transition hover:bg-blue-500 hover:shadow-[0_6px_20px_-2px_rgba(59,130,246,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F7F9] dark:bg-sky-600 dark:shadow-[0_4px_18px_-4px_rgba(14,165,233,0.45)] dark:hover:bg-sky-500 dark:focus-visible:ring-sky-400/50 dark:focus-visible:ring-offset-[#0a0a0b]";

    return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-12 pb-10 pt-2 sm:pt-4">
            <header className="text-center sm:text-left">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200/90 bg-blue-50/90 px-3.5 py-1.5 text-xs font-semibold text-blue-800 shadow-[0_1px_2px_rgba(59,130,246,0.12)] dark:border-sky-500/25 dark:bg-sky-950/40 dark:text-sky-200 dark:shadow-none">
                    <Clapperboard className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" strokeWidth={2} aria-hidden />
                    {t("watchHubBadge")}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-[#0f172a] dark:text-white">
                    {t("watchHubTitle")}
                </h1>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#64748B] dark:text-zinc-400">
                    {t("watchHubSubtitle")}
                </p>
                <p className="mt-3 text-sm">
                    <Link
                        href="/call"
                        className="font-medium text-sky-700 underline decoration-sky-700/30 hover:text-sky-800 dark:text-sky-400 dark:decoration-sky-400/30 dark:hover:text-sky-300"
                    >
                        {t("meetsHubTitle")}
                    </Link>
                    <span className="text-[#64748B] dark:text-zinc-500"> — {t("meetsHubSubtitle")}</span>
                </p>
            </header>

            <section className={card}>
                <div className="space-y-5">
                    <h2 className="text-base font-semibold text-[#0f172a] dark:text-zinc-100">
                        {t("meetsCreateSectionTitle")}
                    </h2>
                    <p className="-mt-2 text-sm leading-relaxed text-[#64748B] dark:text-zinc-400">
                        {t("meetsCreateSectionHint")}
                    </p>
                    <button type="button" onClick={createRoom} className={createBtn}>
                        <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                        {t("meetsCreateMeeting")}
                    </button>
                </div>

                <div className="relative my-10">
                    <div className="absolute inset-0 flex items-center" aria-hidden>
                        <div className="w-full border-t border-[#E5E7EB] dark:border-white/10" />
                    </div>
                    <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8] dark:text-zinc-500">
                        <span className="bg-[#F6F7F9] px-3 dark:bg-[#0a0a0a]">{t("meetsOrDivider")}</span>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <h2 className="text-base font-semibold text-[#0f172a] dark:text-zinc-100">
                            {t("meetsJoinSectionTitle")}
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-[#64748B] dark:text-zinc-400">
                            {t("meetsJoinSectionHint")}
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                        <div className="min-w-0 flex-1">
                            <label htmlFor="watch-room-slug" className="sr-only">
                                {t("meetsRoomLabel")}
                            </label>
                            <input
                                id="watch-room-slug"
                                type="text"
                                autoComplete="off"
                                placeholder={t("meetsRoomPlaceholder")}
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                                className={inputClass}
                            />
                        </div>
                        <button type="button" onClick={joinRoom} className={actionBtn}>
                            <PhoneCall className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            {t("meetsJoinMeeting")}
                        </button>
                    </div>
                    <p className="text-xs text-[#94A3B8] dark:text-zinc-500">{t("meetsJoinEmptyHint")}</p>
                    {hint ? (
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300" role="alert">
                            {hint}
                        </p>
                    ) : null}
                </div>
            </section>

            {recent.length > 0 ? (
                <section>
                    <h2 className="mb-4 text-base font-semibold text-[#0f172a] dark:text-zinc-100">
                        {t("meetsRecentHeading")}
                    </h2>
                    <ul className="flex flex-col gap-3">
                        {recent.map((entry) => (
                            <li key={entry.room}>
                                <Link
                                    href={`/watch/${encodeURIComponent(entry.room)}`}
                                    onClick={() => rememberMeetRoom(entry.room)}
                                    className="block rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition hover:border-blue-200 hover:bg-blue-50/40 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-sky-500/30 dark:hover:bg-sky-950/25"
                                >
                                    <span className="block truncate text-sm font-semibold text-[#0f172a] dark:text-zinc-100">
                                        {entry.label ?? entry.room}
                                    </span>
                                    {entry.label ? (
                                        <span className="mt-0.5 block truncate font-mono text-xs text-[#64748B] dark:text-zinc-500">
                                            {t("meetsRoomIdCaption")}: {entry.room}
                                        </span>
                                    ) : null}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
