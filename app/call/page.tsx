"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Pencil, PhoneCall, Plus, Trash2, Video } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import {
    generateMeetRoomSlug,
    getRecentMeetRooms,
    MEETS_ROOM_NAME_RE,
    rememberMeetRoom,
    removeMeetRoomFromRecent,
    setMeetRoomLabel,
    type MeetRecentEntry,
} from "@/lib/meets-recent-rooms";

export default function CallHubPage() {
    const { t } = useI18n();
    const router = useRouter();
    const [slug, setSlug] = useState("");
    const [hint, setHint] = useState<string | null>(null);
    const [recent, setRecent] = useState<MeetRecentEntry[]>([]);
    const [editingRoom, setEditingRoom] = useState<string | null>(null);
    const [editLabelDraft, setEditLabelDraft] = useState("");

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
            router.push(`/call/${encodeURIComponent(room)}`);
        },
        [router, refreshRecent],
    );

    const createMeeting = () => {
        setHint(null);
        goToRoom(generateMeetRoomSlug());
    };

    const joinMeeting = () => {
        const trimmed = slug.trim();
        const room = trimmed === "" ? generateMeetRoomSlug() : trimmed;
        if (!MEETS_ROOM_NAME_RE.test(room)) {
            setHint(t("meetsInvalidRoom"));
            return;
        }
        setHint(null);
        goToRoom(room);
    };

    const copyRoomLink = async (room: string) => {
        const url = `${typeof window !== "undefined" ? window.location.origin : ""}/call/${encodeURIComponent(room)}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t("meetsLinkCopied"));
        }
        catch {
            toast.error(t("meetsCopyFailed"));
        }
    };

    const removeRecent = (room: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        removeMeetRoomFromRecent(room);
        if (editingRoom === room) {
            setEditingRoom(null);
        }
        refreshRecent();
    };

    const startEditLabel = (entry: MeetRecentEntry, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingRoom(entry.room);
        setEditLabelDraft(entry.label ?? "");
    };

    const saveEditLabel = (room: string) => {
        setMeetRoomLabel(room, editLabelDraft);
        setEditingRoom(null);
        refreshRecent();
    };

    const cancelEditLabel = () => {
        setEditingRoom(null);
        setEditLabelDraft("");
    };

    const card =
        "rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none";
    const inputClass =
        "w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 shadow-none outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-1 dark:focus:ring-white/15";
    const actionBtn =
        "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 sm:w-auto sm:min-w-[10rem] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:shadow-none dark:hover:bg-zinc-700 dark:focus-visible:ring-white/20";
    const createBtn =
        "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/50 focus-visible:ring-offset-2 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none dark:hover:bg-zinc-200 dark:focus-visible:ring-white/40";

    return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-12 pb-10 pt-2 sm:pt-4">
            <header className="text-center sm:text-left">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    <Video className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" strokeWidth={2} aria-hidden />
                    {t("meetsHubBadge")}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                    {t("meetsHubTitle")}
                </h1>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {t("meetsHubSubtitle")}
                </p>
            </header>

            <section className={card}>
                <div className="space-y-5">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {t("meetsCreateSectionTitle")}
                    </h2>
                    <p className="-mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {t("meetsCreateSectionHint")}
                    </p>
                    <button type="button" onClick={createMeeting} className={createBtn}>
                        <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                        {t("meetsCreateMeeting")}
                    </button>
                </div>

                <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center" aria-hidden>
                        <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
                    </div>
                    <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                        <span className="bg-white px-3 dark:bg-zinc-900">{t("meetsOrDivider")}</span>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                            {t("meetsJoinSectionTitle")}
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                            {t("meetsJoinSectionHint")}
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                        <div className="min-w-0 flex-1">
                            <label htmlFor="room-slug" className="sr-only">
                                {t("meetsRoomLabel")}
                            </label>
                            <input
                                id="room-slug"
                                type="text"
                                autoComplete="off"
                                placeholder={t("meetsRoomPlaceholder")}
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && joinMeeting()}
                                className={inputClass}
                            />
                        </div>
                        <button type="button" onClick={joinMeeting} className={actionBtn}>
                            <PhoneCall className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            {t("meetsJoinMeeting")}
                        </button>
                    </div>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("meetsJoinEmptyHint")}</p>
                    {hint ? (
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300" role="alert">
                            {hint}
                        </p>
                    ) : null}
                </div>
            </section>

            {recent.length > 0 ? (
                <section>
                    <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {t("meetsRecentHeading")}
                    </h2>
                    <ul className="flex flex-col gap-3">
                        {recent.map((entry) => (
                            <li key={entry.room}>
                                <div className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none dark:hover:border-zinc-600 dark:hover:bg-zinc-800">
                                    {editingRoom === entry.room ? (
                                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                                            <input
                                                type="text"
                                                autoComplete="off"
                                                value={editLabelDraft}
                                                onChange={(e) => setEditLabelDraft(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        saveEditLabel(entry.room);
                                                    }
                                                    if (e.key === "Escape") {
                                                        cancelEditLabel();
                                                    }
                                                }}
                                                className={inputClass}
                                                aria-label={t("meetsRenameRoom")}
                                            />
                                            <div className="flex shrink-0 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => saveEditLabel(entry.room)}
                                                    className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                                >
                                                    {t("meetsSaveLabel")}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEditLabel}
                                                    className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                >
                                                    {t("meetsCancelLabel")}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Link
                                            href={`/call/${encodeURIComponent(entry.room)}`}
                                            onClick={() => rememberMeetRoom(entry.room)}
                                            className="min-w-0 flex-1 text-left transition group-hover:text-zinc-900 dark:group-hover:text-white"
                                        >
                                            <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                {entry.label ?? entry.room}
                                            </span>
                                            {entry.label ? (
                                                <span className="mt-0.5 block truncate font-mono text-xs text-zinc-500 dark:text-zinc-500">
                                                    {t("meetsRoomIdCaption")}: {entry.room}
                                                </span>
                                            ) : null}
                                        </Link>
                                    )}
                                    {editingRoom === entry.room ? null : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={(e) => startEditLabel(entry, e)}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                                title={t("meetsRenameRoom")}
                                                aria-label={t("meetsRenameRoom")}
                                            >
                                                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void copyRoomLink(entry.room)}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                                title={t("meetsCopyLink")}
                                                aria-label={t("meetsCopyLink")}
                                            >
                                                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => removeRecent(entry.room, e)}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-300"
                                                title={t("meetsRemoveRecent")}
                                                aria-label={t("meetsRemoveRecent")}
                                            >
                                                <Trash2 className="h-4 w-4" strokeWidth={2} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
