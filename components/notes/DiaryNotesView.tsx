"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
    ArrowLeft,
    CalendarDays,
    Loader2,
    Pencil,
    PenLine,
    Trash2,
} from "lucide-react";
import { AddFlashcardModal, HighlightToolbar } from "@/components/ielts";
import { authFetch } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";
import {
    diaryMonthLabel,
    isDefaultDiaryTitle,
    localDateYmd,
} from "@/lib/diary-note-utils";

const DIARY_FLASHCARD_SELECTION_MAX_LEN = 500;

const RichTextEditor = dynamic(
    () => import("@/components/RichTextEditor").then((m) => m.RichTextEditor),
    {
        ssr: false,
        loading: () => (
            <div
                className="min-h-[min(45dvh,280px)] animate-pulse rounded-lg bg-zinc-100 md:min-h-[260px] dark:bg-zinc-800/60"
                aria-hidden
            />
        ),
    },
);

type DiaryEntry = {
    id: string;
    title: string;
    body: string;
    diaryDate: string | null;
    updatedAt: string;
};

function parseDiaryEntry(raw: Record<string, unknown>): DiaryEntry | null {
    const id = String(raw.id ?? "");
    if (!id) {
        return null;
    }
    const nt = raw.noteType ?? raw.note_type;
    if (nt !== "diary") {
        return null;
    }
    const diaryDate =
        typeof raw.diaryDate === "string"
            ? raw.diaryDate
            : typeof raw.diary_date === "string"
              ? raw.diary_date
              : null;
    return {
        id,
        title: typeof raw.title === "string" ? raw.title : "",
        body: typeof raw.body === "string" ? raw.body : "",
        diaryDate,
        updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
    };
}

function groupByMonth(entries: DiaryEntry[], locale: "en" | "vi") {
    const groups = new Map<string, DiaryEntry[]>();
    const order: string[] = [];
    for (const e of entries) {
        const key =
            e.diaryDate && e.diaryDate.length >= 7 ? e.diaryDate.slice(0, 7) : "unknown";
        if (!groups.has(key)) {
            order.push(key);
            groups.set(key, []);
        }
        groups.get(key)!.push(e);
    }
    return order.map((key) => ({
        key,
        label:
            key === "unknown"
                ? "…"
                : diaryMonthLabel(`${key}-01`, locale),
        items: groups.get(key)!,
    }));
}

function sortDiaryEntriesNewestFirst(list: DiaryEntry[]): DiaryEntry[] {
    return [...list].sort((a, b) => {
        const da = a.diaryDate ?? "";
        const db = b.diaryDate ?? "";
        if (da !== db) {
            return db.localeCompare(da);
        }
        return b.updatedAt.localeCompare(a.updatedAt);
    });
}

/** Closest remaining entry by calendar distance to the deleted `diaryDate`. */
function pickNearestDiaryAfterDelete(
    deleted: DiaryEntry,
    remaining: DiaryEntry[],
): string | null {
    if (remaining.length === 0) {
        return null;
    }
    const del = deleted.diaryDate;
    if (!del) {
        return remaining[0]!.id;
    }
    const delT = new Date(`${del}T12:00:00`).getTime();
    if (!Number.isFinite(delT)) {
        return remaining[0]!.id;
    }
    let best = remaining[0]!;
    let bestDist = Infinity;
    for (const e of remaining) {
        const d = e.diaryDate;
        if (!d) {
            continue;
        }
        const t = new Date(`${d}T12:00:00`).getTime();
        if (!Number.isFinite(t)) {
            continue;
        }
        const dist = Math.abs(t - delT);
        if (dist < bestDist) {
            bestDist = dist;
            best = e;
        }
        else if (dist === bestDist && d > (best.diaryDate ?? "")) {
            best = e;
        }
    }
    return best.id;
}

export function DiaryNotesView() {
    const { t, locale } = useI18n();
    const loc = locale === "vi" ? "vi" : "en";

    const [entries, setEntries] = useState<DiaryEntry[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [loadingList, setLoadingList] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [writeBusy, setWriteBusy] = useState(false);
    const [hydratedNoteId, setHydratedNoteId] = useState<string | null>(null);
    const [postHydrateEpoch, setPostHydrateEpoch] = useState(0);
    const [editingListId, setEditingListId] = useState<string | null>(null);
    const [listRenameDraft, setListRenameDraft] = useState("");
    const [entryToDelete, setEntryToDelete] = useState<DiaryEntry | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const listRenameInputRef = useRef<HTMLInputElement | null>(null);
    const listRenameCommittingRef = useRef(false);
    const skipRenameBlurRef = useRef(false);
    const diaryEditorRootRef = useRef<HTMLDivElement | null>(null);
    const [diarySelToolbar, setDiarySelToolbar] = useState<{
        x: number;
        y: number;
        text: string;
    } | null>(null);
    const [showFlashcardModal, setShowFlashcardModal] = useState(false);
    const [flashcardInitialWord, setFlashcardInitialWord] = useState("");

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skipAutosaveRef = useRef(true);
    const saveNoteRef = useRef<
        | ((
              noteId: string,
              nextTitle: string,
              nextBody: string,
              options?: { keepalive?: boolean },
          ) => Promise<void>)
        | null
    >(null);
    const serverBaselineRef = useRef<{
        id: string | null;
        title: string;
        body: string;
        updatedAt: string;
    }>({ id: null, title: "", body: "", updatedAt: "" });
    const persistStateRef = useRef({
        selectedId: null as string | null,
        title: "",
        body: "",
    });
    const entriesRef = useRef(entries);
    entriesRef.current = entries;
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;

    const selected = entries.find((e) => e.id === selectedId) ?? null;
    const isEditorReady = Boolean(selectedId && hydratedNoteId === selectedId);

    persistStateRef.current = { selectedId, title, body };

    const loadDiary = useCallback(async () => {
        setLoadingList(true);
        setLoadError(false);
        try {
            const res = await authFetch("/api/notes?scope=diary");
            if (res.status === 401) {
                setEntries([]);
                setSelectedId(null);
                return;
            }
            if (!res.ok) {
                setLoadError(true);
                toast.error(t("notesLoadFailed"));
                setEntries([]);
                return;
            }
            const data = await res.json();
            const rawList = Array.isArray(data) ? data : [];
            const list = sortDiaryEntriesNewestFirst(
                rawList
                    .map((x) => parseDiaryEntry(x as Record<string, unknown>))
                    .filter((x): x is DiaryEntry => x != null),
            );
            setEntries(list);
            const todayYmd = localDateYmd(new Date());
            const todayEntry = list.find((e) => e.diaryDate === todayYmd);
            setSelectedId((prev) => {
                if (prev && list.some((e) => e.id === prev)) {
                    return prev;
                }
                /** Chỉ auto-mở entry hôm nay; không tạo sẵn, không ép mở ngày khác. */
                return todayEntry?.id ?? null;
            });
        } catch {
            setLoadError(true);
            toast.error(t("notesLoadFailed"));
            setEntries([]);
        } finally {
            setLoadingList(false);
        }
    }, [t]);

    useEffect(() => {
        void loadDiary();
    }, [loadDiary]);

    useEffect(() => {
        setDiarySelToolbar(null);
    }, [selectedId]);

    useEffect(() => {
        if (!isEditorReady) {
            setDiarySelToolbar(null);
        }
    }, [isEditorReady]);

    useEffect(() => {
        const onMouseUp = () => {
            const root = diaryEditorRootRef.current;
            if (!root) {
                setDiarySelToolbar(null);
                return;
            }
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                setDiarySelToolbar(null);
                return;
            }
            const anchor = sel.anchorNode;
            const focusNode = sel.focusNode;
            if (
                !anchor ||
                !focusNode ||
                !root.contains(anchor) ||
                !root.contains(focusNode)
            ) {
                setDiarySelToolbar(null);
                return;
            }
            const raw = sel
                .toString()
                .replace(/\s+/g, " ")
                .trim();
            if (!raw || raw.length > DIARY_FLASHCARD_SELECTION_MAX_LEN) {
                setDiarySelToolbar(null);
                return;
            }
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                setDiarySelToolbar(null);
                return;
            }
            const x = rect.left + rect.width / 2;
            const y = rect.top;
            setDiarySelToolbar({ x, y, text: raw });
        };
        document.addEventListener("mouseup", onMouseUp);
        return () => document.removeEventListener("mouseup", onMouseUp);
    }, [isEditorReady, selectedId]);

    useEffect(() => {
        if (!diarySelToolbar) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setDiarySelToolbar(null);
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [diarySelToolbar]);

    const openFlashcardFromSelection = useCallback((word: string) => {
        window.getSelection()?.removeAllRanges();
        setDiarySelToolbar(null);
        setFlashcardInitialWord(word.trim());
        setShowFlashcardModal(true);
    }, []);

    const finishHydrate = useCallback((noteId: string | null) => {
        setHydratedNoteId(noteId);
        queueMicrotask(() => {
            window.setTimeout(() => {
                skipAutosaveRef.current = false;
                setPostHydrateEpoch((e) => e + 1);
            }, 0);
        });
    }, []);

    useEffect(() => {
        skipAutosaveRef.current = true;
        if (!selectedId) {
            setTitle("");
            setBody("");
            serverBaselineRef.current = {
                id: null,
                title: "",
                body: "",
                updatedAt: "",
            };
            finishHydrate(null);
            return;
        }
        const e = entriesRef.current.find((x) => x.id === selectedId);
        if (!e) {
            setTitle("");
            setBody("");
            finishHydrate(null);
            return;
        }
        setTitle(e.title);
        setBody(e.body);
        serverBaselineRef.current = {
            id: e.id,
            title: e.title,
            body: e.body,
            updatedAt: e.updatedAt,
        };
        finishHydrate(e.id);
    }, [selectedId, finishHydrate]);

    const saveNote = useCallback(
        async (
            noteId: string,
            nextTitle: string,
            nextBody: string,
            options?: { keepalive?: boolean },
        ) => {
            try {
                const payload = JSON.stringify({ title: nextTitle, body: nextBody });
                const payloadBytes = new TextEncoder().encode(payload).length;
                const useKeepalive =
                    Boolean(options?.keepalive) &&
                    payloadBytes > 0 &&
                    payloadBytes < 60_000;
                const res = await authFetch(`/api/notes/${noteId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: payload,
                    ...(useKeepalive ? { keepalive: true as const } : {}),
                });
                if (!res.ok) {
                    toast.error(t("notesSaveFailed"));
                    return;
                }
                const updated = (await res.json()) as Record<string, unknown>;
                const nextT = String(updated.title ?? "");
                const nextB = String(updated.body ?? "");
                const nextU = String(updated.updatedAt ?? "");
                setEntries((prev) =>
                    prev.map((n) =>
                        String(n.id) === noteId
                            ? { ...n, title: nextT, body: nextB, updatedAt: nextU }
                            : n,
                    ),
                );
                if (serverBaselineRef.current.id === noteId) {
                    serverBaselineRef.current = {
                        id: noteId,
                        title: nextT,
                        body: nextB,
                        updatedAt: nextU,
                    };
                }
            } catch {
                toast.error(t("notesSaveFailed"));
            }
        },
        [t],
    );

    useEffect(() => {
        saveNoteRef.current = saveNote;
    }, [saveNote]);

    useEffect(() => {
        if (skipAutosaveRef.current) {
            return;
        }
        if (!selectedId) {
            return;
        }
        if (hydratedNoteId !== selectedId) {
            return;
        }
        const b = serverBaselineRef.current;
        if (b.id !== selectedId) {
            return;
        }
        if (title === b.title && body === b.body) {
            return;
        }
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            saveTimeoutRef.current = null;
            if (skipAutosaveRef.current) {
                return;
            }
            const p = persistStateRef.current;
            const bl = serverBaselineRef.current;
            if (!p.selectedId) {
                return;
            }
            if (hydratedNoteId !== p.selectedId) {
                return;
            }
            if (bl.id !== p.selectedId) {
                return;
            }
            if (p.title === bl.title && p.body === bl.body) {
                return;
            }
            void saveNote(p.selectedId, p.title, p.body);
        }, 300);
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [title, body, selectedId, saveNote, postHydrateEpoch, hydratedNoteId]);

    const flushPendingSave = useCallback(async () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        const { selectedId: sid, title: nt, body: nb } = persistStateRef.current;
        const bl = serverBaselineRef.current;
        if (!sid) {
            return;
        }
        if (hydratedNoteId !== sid) {
            return;
        }
        if (bl.id !== sid) {
            return;
        }
        if (nt === bl.title && nb === bl.body) {
            return;
        }
        const fn = saveNoteRef.current;
        if (fn) {
            await fn(sid, nt, nb, { keepalive: true });
        }
    }, [hydratedNoteId]);

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === "hidden") {
                void flushPendingSave();
            }
        };
        const flushSync = () => {
            void flushPendingSave();
        };
        window.addEventListener("pagehide", flushSync);
        window.addEventListener("beforeunload", flushSync);
        document.addEventListener("visibilitychange", onVis);
        return () => {
            window.removeEventListener("pagehide", flushSync);
            window.removeEventListener("beforeunload", flushSync);
            document.removeEventListener("visibilitychange", onVis);
            void flushPendingSave();
        };
    }, [flushPendingSave]);

    useEffect(() => {
        if (!editingListId) {
            return;
        }
        const tmr = window.setTimeout(() => {
            listRenameInputRef.current?.focus();
        }, 0);
        return () => window.clearTimeout(tmr);
    }, [editingListId]);

    const finishListRename = useCallback(
        async (noteId: string, raw: string) => {
            if (listRenameCommittingRef.current) {
                return;
            }
            const trimmed = raw.trim();
            if (!trimmed) {
                setEditingListId(null);
                return;
            }
            const entry = entriesRef.current.find((x) => x.id === noteId);
            if (!entry) {
                setEditingListId(null);
                return;
            }
            if (trimmed === entry.title) {
                setEditingListId(null);
                return;
            }
            listRenameCommittingRef.current = true;
            try {
                if (noteId === selectedIdRef.current) {
                    await flushPendingSave();
                }
                const res = await authFetch(`/api/notes/${noteId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: trimmed }),
                });
                if (!res.ok) {
                    toast.error(t("notesSaveFailed"));
                    return;
                }
                const updated = (await res.json()) as Record<string, unknown>;
                const nextT = String(updated.title ?? trimmed);
                const nextU = String(updated.updatedAt ?? "");
                setEntries((prev) =>
                    prev.map((n) =>
                        n.id === noteId
                            ? { ...n, title: nextT, updatedAt: nextU || n.updatedAt }
                            : n,
                    ),
                );
                if (selectedIdRef.current === noteId) {
                    setTitle(nextT);
                    serverBaselineRef.current = {
                        ...serverBaselineRef.current,
                        id: noteId,
                        title: nextT,
                        body: serverBaselineRef.current.body,
                        updatedAt: nextU || serverBaselineRef.current.updatedAt,
                    };
                }
                setEditingListId(null);
            } catch {
                toast.error(t("notesSaveFailed"));
            } finally {
                listRenameCommittingRef.current = false;
            }
        },
        [flushPendingSave, t],
    );

    const cancelListRename = useCallback(() => {
        skipRenameBlurRef.current = true;
        setEditingListId(null);
    }, []);

    const confirmDeleteDiaryEntry = useCallback(async () => {
        const ent = entryToDelete;
        if (!ent) {
            return;
        }
        setDeleteBusy(true);
        try {
            await flushPendingSave();
            const res = await authFetch(`/api/notes/${ent.id}`, { method: "DELETE" });
            if (!res.ok) {
                toast.error(t("notesSaveFailed"));
                return;
            }
            const remaining = entriesRef.current.filter((x) => x.id !== ent.id);
            const sorted = sortDiaryEntriesNewestFirst(remaining);
            setEntries(sorted);
            setEntryToDelete(null);
            setEditingListId((cur) => (cur === ent.id ? null : cur));
            const nextId = pickNearestDiaryAfterDelete(ent, sorted);
            if (ent.id === selectedIdRef.current) {
                setSelectedId(nextId);
                if (!nextId) {
                    setHydratedNoteId(null);
                }
            }
            toast.success(t("toastNoteDeleted"));
        } catch {
            toast.error(t("notesSaveFailed"));
        } finally {
            setDeleteBusy(false);
        }
    }, [entryToDelete, flushPendingSave, t]);

    const writeToday = useCallback(async () => {
        setWriteBusy(true);
        try {
            const ymd = localDateYmd(new Date());
            const res = await authFetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    noteType: "diary",
                    diaryDate: ymd,
                    locale: loc,
                }),
            });
            if (res.status === 503) {
                toast.error(t("notesDiaryMigrationHint"));
                return;
            }
            if (!res.ok) {
                toast.error(t("notesSaveFailed"));
                return;
            }
            const raw = (await res.json()) as Record<string, unknown>;
            const ent = parseDiaryEntry(raw);
            if (!ent) {
                toast.error(t("notesLoadFailed"));
                return;
            }
            setEntries((prev) => {
                const rest = prev.filter((x) => x.id !== ent.id);
                return sortDiaryEntriesNewestFirst([ent, ...rest]);
            });
            setSelectedId(ent.id);
        } catch {
            toast.error(t("notesSaveFailed"));
        } finally {
            setWriteBusy(false);
        }
    }, [loc, t]);

    const monthGroups = groupByMonth(entries, loc);
    const todayYmd = localDateYmd(new Date());

    return (
        <div className="flex h-[min(100dvh,100vh)] max-h-[min(100dvh,100vh)] min-h-0 flex-col overflow-hidden rounded-none border-0 border-zinc-200 bg-zinc-50 md:h-[calc(100vh-2rem)] md:max-h-[calc(100vh-2rem)] md:rounded-xl md:border md:border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 md:dark:border-zinc-800">
            <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
                <aside className="flex max-h-[42vh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:max-h-none md:w-80 md:border-b-0 md:border-r">
                    <header className="flex shrink-0 flex-col gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                            <Link
                                href="/notes"
                                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                                {t("notesDiaryBackToNotes")}
                            </Link>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                                    <PenLine className="h-4 w-4" strokeWidth={2.25} />
                                </span>
                                <h1 className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-lg">
                                    {t("notesDiary")}
                                </h1>
                            </div>
                            <button
                                type="button"
                                onClick={() => void writeToday()}
                                disabled={writeBusy}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:text-sm"
                            >
                                {writeBusy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : null}
                                {t("notesDiaryWriteToday")}
                            </button>
                        </div>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                        {loadingList ? (
                            <div className="flex justify-center py-10 text-zinc-400 dark:text-zinc-500">
                                <Loader2 className="h-7 w-7 animate-spin" />
                            </div>
                        ) : loadError ? (
                            <p className="px-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
                                {t("notesLoadFailed")}
                            </p>
                        ) : entries.length === 0 ? (
                            <p className="px-2 text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                                {t("notesDiaryEmpty")}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-5">
                                {monthGroups.map((g) => (
                                    <section key={g.key}>
                                        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            {g.label}
                                        </h2>
                                        <ul className="flex flex-col gap-1.5">
                                            {g.items.map((e) => {
                                                const on = e.id === selectedId;
                                                const isToday =
                                                    Boolean(e.diaryDate) &&
                                                    e.diaryDate === todayYmd;
                                                const rowShell = [
                                                    "group flex items-stretch gap-0.5 rounded-lg border text-sm transition",
                                                    on
                                                        ? "border-transparent bg-amber-50 shadow-sm dark:bg-amber-950/25"
                                                        : isToday
                                                          ? "border-amber-200/70 bg-amber-50/45 text-zinc-800 ring-1 ring-amber-200/50 dark:border-amber-800/50 dark:bg-amber-950/25 dark:text-zinc-100 dark:ring-amber-800/35"
                                                          : "border-transparent text-zinc-700 hover:border-neutral-200 hover:bg-neutral-50 dark:text-zinc-200 dark:hover:border-neutral-700 dark:hover:bg-neutral-900/50",
                                                ].join(" ");
                                                const editing = editingListId === e.id;
                                                return (
                                                    <li key={e.id}>
                                                        <div className={rowShell}>
                                                            {editing ? (
                                                                <input
                                                                    ref={listRenameInputRef}
                                                                    value={listRenameDraft}
                                                                    onChange={(ev) =>
                                                                        setListRenameDraft(
                                                                            ev.target.value,
                                                                        )
                                                                    }
                                                                    onKeyDown={(ev) => {
                                                                        if (ev.key === "Enter") {
                                                                            ev.preventDefault();
                                                                            void finishListRename(
                                                                                e.id,
                                                                                ev.currentTarget
                                                                                    .value,
                                                                            );
                                                                        }
                                                                        if (ev.key === "Escape") {
                                                                            ev.preventDefault();
                                                                            cancelListRename();
                                                                        }
                                                                    }}
                                                                    onBlur={(ev) => {
                                                                        if (
                                                                            skipRenameBlurRef.current
                                                                        ) {
                                                                            skipRenameBlurRef.current =
                                                                                false;
                                                                            return;
                                                                        }
                                                                        void finishListRename(
                                                                            e.id,
                                                                            ev.currentTarget.value,
                                                                        );
                                                                    }}
                                                                    onFocus={(ev) => {
                                                                        if (
                                                                            isDefaultDiaryTitle(
                                                                                e.title,
                                                                                e.diaryDate,
                                                                                loc,
                                                                            )
                                                                        ) {
                                                                            ev.target.select();
                                                                        }
                                                                    }}
                                                                    className="mx-1 my-1 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
                                                                    aria-label={t(
                                                                        "notesDiaryRenameAria",
                                                                    )}
                                                                />
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEditingListId(
                                                                                null,
                                                                            );
                                                                            setSelectedId(e.id);
                                                                        }}
                                                                        className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left"
                                                                    >
                                                                        <CalendarDays
                                                                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
                                                                            strokeWidth={2}
                                                                            aria-hidden
                                                                        />
                                                                        <span className="min-w-0 flex-1">
                                                                            <span className="line-clamp-2 font-medium leading-snug">
                                                                                {e.title ||
                                                                                    e.diaryDate ||
                                                                                    "—"}
                                                                            </span>
                                                                            {isToday ? (
                                                                                <span className="mt-0.5 inline-block rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-800/60 dark:text-amber-50">
                                                                                    {t(
                                                                                        "notesDiaryToday",
                                                                                    )}
                                                                                </span>
                                                                            ) : null}
                                                                        </span>
                                                                    </button>
                                                                    <div className="flex shrink-0 items-start gap-0.5 py-1 pr-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                                                        <button
                                                                            type="button"
                                                                            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                                                                            title={t(
                                                                                "notesDiaryRenameAria",
                                                                            )}
                                                                            aria-label={t(
                                                                                "notesDiaryRenameAria",
                                                                            )}
                                                                            onMouseDown={(ev) =>
                                                                                ev.preventDefault()
                                                                            }
                                                                            onClick={(ev) => {
                                                                                ev.stopPropagation();
                                                                                setEditingListId(
                                                                                    e.id,
                                                                                );
                                                                                setListRenameDraft(
                                                                                    e.title ||
                                                                                        e.diaryDate ||
                                                                                        "",
                                                                                );
                                                                            }}
                                                                        >
                                                                            <Pencil
                                                                                className="h-3.5 w-3.5"
                                                                                strokeWidth={2}
                                                                            />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="rounded-md p-1.5 text-zinc-500 hover:bg-red-100 hover:text-red-700 dark:text-zinc-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                                                                            title={t(
                                                                                "notesDiaryDeleteAria",
                                                                            )}
                                                                            aria-label={t(
                                                                                "notesDiaryDeleteAria",
                                                                            )}
                                                                            onMouseDown={(ev) =>
                                                                                ev.preventDefault()
                                                                            }
                                                                            onClick={(ev) => {
                                                                                ev.stopPropagation();
                                                                                setEntryToDelete(
                                                                                    e,
                                                                                );
                                                                            }}
                                                                        >
                                                                            <Trash2
                                                                                className="h-3.5 w-3.5"
                                                                                strokeWidth={2}
                                                                            />
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
                    {!selected ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-12">
                            <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                                <PenLine className="h-10 w-10" strokeWidth={1.5} />
                            </span>
                            <p className="max-w-xs text-center text-sm font-medium text-zinc-600 dark:text-zinc-300">
                                {entries.length === 0
                                    ? t("notesDiaryEmpty")
                                    : t("notesDiaryNoTodayYet")}
                            </p>
                            <button
                                type="button"
                                onClick={() => void writeToday()}
                                disabled={writeBusy}
                                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                                {writeBusy ? (
                                    <Loader2
                                        className="h-4 w-4 shrink-0 animate-spin"
                                        aria-hidden
                                    />
                                ) : (
                                    <CalendarDays
                                        className="h-4 w-4 shrink-0"
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                )}
                                {t("notesDiaryWriteToday")}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="shrink-0 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 sm:px-5 sm:py-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <h2 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50 sm:text-lg">
                                            {selected.title}
                                        </h2>
                                        {selected.diaryDate === todayYmd ? (
                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950 dark:bg-amber-900/50 dark:text-amber-100">
                                                {t("notesDiaryToday")}
                                            </span>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEntryToDelete(selected)}
                                        className="shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                                        title={t("notesDiaryDeleteAria")}
                                        aria-label={t("notesDiaryDeleteAria")}
                                    >
                                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                                    </button>
                                </div>
                            </div>
                            <div
                                ref={diaryEditorRootRef}
                                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 sm:py-4"
                            >
                                {isEditorReady ? (
                                    <RichTextEditor
                                        key={selectedId}
                                        value={body}
                                        onChange={setBody}
                                        readOnly={false}
                                        placeholder={t("bodyPlaceholder")}
                                        minHeightClassName="min-h-[min(45dvh,280px)] md:min-h-[260px]"
                                    />
                                ) : (
                                    <div
                                        className="min-h-[min(45dvh,280px)] animate-pulse rounded-lg bg-zinc-100 md:min-h-[260px] dark:bg-zinc-800/60"
                                        aria-hidden
                                    />
                                )}
                            </div>
                        </>
                    )}
                </main>
            </div>

            {diarySelToolbar ? (
                <HighlightToolbar
                    x={diarySelToolbar.x}
                    y={diarySelToolbar.y}
                    hasHighlightId={false}
                    selectedText={diarySelToolbar.text}
                    onHighlight={() => {}}
                    onUnhighlight={() => {}}
                    onFlashcard={openFlashcardFromSelection}
                    showHighlightButtons={false}
                    preserveEditorSelectionOnToolbarMouseDown
                />
            ) : null}

            {showFlashcardModal ? (
                <AddFlashcardModal
                    initialWord={flashcardInitialWord}
                    onClose={() => {
                        setShowFlashcardModal(false);
                        setFlashcardInitialWord("");
                    }}
                    onSaved={() => toast.success(t("flashcardSavedFromSelection"))}
                />
            ) : null}

            {entryToDelete ? (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !deleteBusy && setEntryToDelete(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="diary-delete-title"
                >
                    <div
                        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <h2
                            id="diary-delete-title"
                            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                        >
                            {t("notesDiaryDeleteConfirm")}
                        </h2>
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                            {t("notesDiaryDeleteWarn")}
                        </p>
                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={deleteBusy}
                                onClick={() => setEntryToDelete(null)}
                                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                            >
                                {t("cancel")}
                            </button>
                            <button
                                type="button"
                                disabled={deleteBusy}
                                onClick={() => void confirmDeleteDiaryEntry()}
                                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700"
                            >
                                {deleteBusy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : null}
                                {t("deleteButton")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
