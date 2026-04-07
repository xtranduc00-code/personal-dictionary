"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronDown,
    ChevronRight,
    ListMusic,
    Pencil,
    Plus,
    Trash2,
    FolderInput,
} from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, useAuth } from "@/lib/auth-context";
import { isR2PublicMoviesUrl, isR2PublicSubtitlesUrl, r2KeyFromPublicUrl } from "@/lib/r2-url";

export type WatchPlaylistClip = {
    id: string;
    folderName: string;
    title: string;
    youtubeUrl: string;
    subtitleUrl?: string;
    sortOrder: number;
    createdAt: string;
};

type Props = {
    onPickClip: (clip: WatchPlaylistClip) => void;
};

function groupClipsByFolder(clips: WatchPlaylistClip[]): Map<string, WatchPlaylistClip[]> {
    const m = new Map<string, WatchPlaylistClip[]>();
    for (const c of clips) {
        const k = c.folderName || "General";
        if (!m.has(k)) {
            m.set(k, []);
        }
        m.get(k)!.push(c);
    }
    for (const arr of m.values()) {
        arr.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    }
    return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function WatchPlaylistMenu({ onPickClip }: Props) {
    const { t } = useI18n();
    const { user } = useAuth();
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [clips, setClips] = useState<WatchPlaylistClip[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [addOpen, setAddOpen] = useState(false);
    const [newFolder, setNewFolder] = useState("General");
    const [newTitle, setNewTitle] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [editId, setEditId] = useState<string | null>(null);
    const [editFolder, setEditFolder] = useState("");
    const [editTitle, setEditTitle] = useState("");
    const [editUrl, setEditUrl] = useState("");
    const [busy, setBusy] = useState(false);

    const grouped = useMemo(() => groupClipsByFolder(clips), [clips]);

    const loadClips = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authFetch("/api/watch-playlist");
            if (!res.ok) {
                throw new Error(String(res.status));
            }
            const data = (await res.json()) as { clips?: WatchPlaylistClip[] };
            const list = Array.isArray(data.clips) ? data.clips : [];
            setClips(list);
            setExpanded((prev) => {
                const next = { ...prev };
                for (const k of groupClipsByFolder(list).keys()) {
                    if (next[k] === undefined) {
                        next[k] = true;
                    }
                }
                return next;
            });
        }
        catch {
            toast.error(t("watchPlaylistLoadError"));
            setClips([]);
        }
        finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        if (!open) {
            return;
        }
        void loadClips();
    }, [open, loadClips]);

    useEffect(() => {
        const onChanged = (e: Event) => {
            const ev = e as CustomEvent<{ clip?: WatchPlaylistClip }>;
            const clip = ev.detail?.clip;
            if (!clip) {
                return;
            }
            setClips((prev) => {
                if (prev.some((c) => c.id === clip.id)) {
                    return prev.map((c) => (c.id === clip.id ? clip : c));
                }
                return [...prev, clip];
            });
            setExpanded((prev) => ({ ...prev, [clip.folderName || "General"]: true }));
        };
        window.addEventListener("watch-playlist-changed", onChanged as EventListener);
        return () => window.removeEventListener("watch-playlist-changed", onChanged as EventListener);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onDown = (e: MouseEvent) => {
            const el = rootRef.current;
            if (el && !el.contains(e.target as Node)) {
                setOpen(false);
                setAddOpen(false);
                setEditId(null);
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const toggleFolder = (name: string) => {
        setExpanded((p) => ({ ...p, [name]: !p[name] }));
    };

    const onAddClip = async () => {
        if (busy) {
            return;
        }
        setBusy(true);
        try {
            const res = await authFetch("/api/watch-playlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    folderName: newFolder.trim() || "General",
                    title: newTitle.trim(),
                    youtubeUrl: newUrl.trim(),
                    sortOrder: 0,
                }),
            });
            if (!res.ok) {
                throw new Error(String(res.status));
            }
            const data = (await res.json()) as { clip?: WatchPlaylistClip };
            if (data.clip) {
                setClips((c) => [...c, data.clip!]);
            }
            setNewTitle("");
            setNewUrl("");
            setAddOpen(false);
            toast.success(t("watchPlaylistAdded"));
        }
        catch {
            toast.error(t("watchPlaylistSaveError"));
        }
        finally {
            setBusy(false);
        }
    };

    const onDeleteClip = async (clip: WatchPlaylistClip) => {
        if (busy) {
            return;
        }
        setBusy(true);
        try {
            if (isR2PublicMoviesUrl(clip.youtubeUrl)) {
                const key = r2KeyFromPublicUrl(clip.youtubeUrl);
                if (key) {
                    try {
                        const del = await authFetch("/api/r2/delete", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ key }),
                        });
                        if (!del.ok) {
                            toast.warn(t("watchPlaylistR2DeleteWarn"));
                        }
                    }
                    catch {
                        toast.warn(t("watchPlaylistR2DeleteWarn"));
                    }
                }
            }
            const sub = (clip.subtitleUrl || "").trim();
            if (sub && isR2PublicSubtitlesUrl(sub)) {
                const key = r2KeyFromPublicUrl(sub);
                if (key) {
                    try {
                        const del = await authFetch("/api/r2/delete", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ key }),
                        });
                        if (!del.ok) {
                            toast.warn(t("watchPlaylistR2DeleteWarn"));
                        }
                    }
                    catch {
                        toast.warn(t("watchPlaylistR2DeleteWarn"));
                    }
                }
            }
            const res = await authFetch(`/api/watch-playlist/${encodeURIComponent(clip.id)}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                throw new Error(String(res.status));
            }
            setClips((c) => c.filter((x) => x.id !== clip.id));
            setEditId(null);
        }
        catch {
            toast.error(t("watchPlaylistDeleteError"));
        }
        finally {
            setBusy(false);
        }
    };

    const onSaveEdit = async () => {
        if (!editId || busy) {
            return;
        }
        setBusy(true);
        try {
            const res = await authFetch(`/api/watch-playlist/${encodeURIComponent(editId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    folderName: editFolder.trim() || "General",
                    title: editTitle.trim(),
                    youtubeUrl: editUrl.trim(),
                }),
            });
            if (!res.ok) {
                throw new Error(String(res.status));
            }
            const data = (await res.json()) as { clip?: WatchPlaylistClip };
            if (data.clip) {
                setClips((c) => c.map((x) => (x.id === editId ? data.clip! : x)));
            }
            setEditId(null);
        }
        catch {
            toast.error(t("watchPlaylistSaveError"));
        }
        finally {
            setBusy(false);
        }
    };

    const onRenameFolder = async (oldName: string) => {
        const next = window.prompt(t("watchPlaylistNewFolderName"), oldName);
        if (next == null || next.trim() === "" || next.trim() === oldName) {
            return;
        }
        setBusy(true);
        try {
            const res = await authFetch("/api/watch-playlist/folder", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldFolderName: oldName, newFolderName: next.trim() }),
            });
            if (!res.ok) {
                throw new Error(String(res.status));
            }
            await loadClips();
        }
        catch {
            toast.error(t("watchPlaylistSaveError"));
        }
        finally {
            setBusy(false);
        }
    };

    const onDeleteFolder = async (folderName: string) => {
        if (!window.confirm(t("watchPlaylistDeleteFolderConfirm").replace("{name}", folderName))) {
            return;
        }
        setBusy(true);
        try {
            const res = await authFetch(
                `/api/watch-playlist/folder?folderName=${encodeURIComponent(folderName)}`,
                { method: "DELETE" },
            );
            if (!res.ok) {
                throw new Error(String(res.status));
            }
            setClips((c) => c.filter((x) => x.folderName !== folderName));
        }
        catch {
            toast.error(t("watchPlaylistDeleteError"));
        }
        finally {
            setBusy(false);
        }
    };

    const startEdit = (c: WatchPlaylistClip) => {
        setEditId(c.id);
        setEditFolder(c.folderName);
        setEditTitle(c.title);
        setEditUrl(c.youtubeUrl);
    };

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                onClick={() => {
                    if (!user) {
                        toast.info(t("watchPlaylistLogin"));
                        return;
                    }
                    setOpen((o) => !o);
                }}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                title={t("watchPlaylistAria")}
                aria-label={t("watchPlaylistAria")}
                aria-expanded={open}
                aria-haspopup="dialog"
            >
                <ListMusic className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                <span className="hidden sm:inline">{t("watchPlaylistButton")}</span>
                <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 opacity-70 transition ${open ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>

            {open ? (
                <div
                    className="absolute left-0 top-[calc(100%+6px)] z-[80] flex w-[min(100vw-1rem,22rem)] max-w-[calc(100vw-1rem)] flex-col rounded-xl border border-zinc-200 bg-white py-2 shadow-xl sm:left-auto sm:right-0"
                    role="dialog"
                    aria-label={t("watchPlaylistAria")}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b border-zinc-100 px-3 pb-2">
                        <span className="text-xs font-bold text-zinc-800">{t("watchPlaylistButton")}</span>
                        <button
                            type="button"
                            onClick={() => {
                                setAddOpen((a) => !a);
                                setEditId(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            {t("watchPlaylistAddClip")}
                        </button>
                    </div>

                    <div className="max-h-[min(60vh,380px)] overflow-y-auto px-2 pt-2">
                        {loading ? (
                            <p className="px-2 py-4 text-center text-xs text-zinc-500">{t("meetsConnecting")}</p>
                        ) : clips.length === 0 && !addOpen ? (
                            <p className="px-2 py-4 text-center text-xs text-zinc-500">{t("watchPlaylistEmpty")}</p>
                        ) : null}

                        {addOpen ? (
                            <div className="mb-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                                <input
                                    value={newFolder}
                                    onChange={(e) => setNewFolder(e.target.value)}
                                    placeholder={t("watchPlaylistFolder")}
                                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
                                />
                                <input
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder={t("watchPlaylistTitle")}
                                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
                                />
                                <input
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder={t("watchPlaylistUrl")}
                                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
                                />
                                <div className="flex justify-end gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setAddOpen(false)}
                                        className="rounded px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200/80"
                                    >
                                        {t("watchPlaylistCancel")}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || !newTitle.trim() || !newUrl.trim()}
                                        onClick={() => void onAddClip()}
                                        className="rounded bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                                    >
                                        {t("watchPlaylistSave")}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {[...grouped.entries()].map(([folderName, list]) => (
                            <div key={folderName} className="mb-2">
                                <div className="flex items-center gap-1 rounded-md bg-zinc-100/90 px-1 py-0.5">
                                    <button
                                        type="button"
                                        onClick={() => toggleFolder(folderName)}
                                        className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-xs font-semibold text-zinc-800"
                                    >
                                        {expanded[folderName] === false ? (
                                            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                        ) : (
                                            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                        )}
                                        <span className="truncate">{folderName}</span>
                                        <span className="shrink-0 font-normal text-zinc-500">({list.length})</span>
                                    </button>
                                    <button
                                        type="button"
                                        title={t("watchPlaylistRenameFolder")}
                                        onClick={() => void onRenameFolder(folderName)}
                                        className="rounded p-1 text-zinc-500 hover:bg-white hover:text-zinc-800"
                                        aria-label={t("watchPlaylistRenameFolder")}
                                    >
                                        <FolderInput className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                    <button
                                        type="button"
                                        title={t("watchPlaylistDeleteFolder")}
                                        onClick={() => void onDeleteFolder(folderName)}
                                        className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                                        aria-label={t("watchPlaylistDeleteFolder")}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                </div>
                                {expanded[folderName] === false ? null : (
                                    <ul className="mt-1 space-y-0.5 pl-1">
                                        {list.map((c) => (
                                            <li key={c.id}>
                                                {editId === c.id ? (
                                                    <div className="space-y-1 rounded border border-zinc-200 bg-zinc-50 p-2">
                                                        <input
                                                            value={editFolder}
                                                            onChange={(e) => setEditFolder(e.target.value)}
                                                            className="w-full rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px]"
                                                        />
                                                        <input
                                                            value={editTitle}
                                                            onChange={(e) => setEditTitle(e.target.value)}
                                                            className="w-full rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px]"
                                                        />
                                                        <input
                                                            value={editUrl}
                                                            onChange={(e) => setEditUrl(e.target.value)}
                                                            className="w-full rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px]"
                                                        />
                                                        <div className="flex justify-end gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditId(null)}
                                                                className="text-[10px] text-zinc-600"
                                                            >
                                                                {t("watchPlaylistCancel")}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() => void onSaveEdit()}
                                                                className="text-[10px] font-semibold text-zinc-700"
                                                            >
                                                                {t("watchPlaylistSave")}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start gap-1 rounded-md py-0.5 hover:bg-zinc-50">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                onPickClip(c);
                                                                setOpen(false);
                                                            }}
                                                            className="min-w-0 flex-1 truncate text-left text-[11px] leading-snug text-zinc-800"
                                                            title={c.youtubeUrl}
                                                        >
                                                            <span className="font-medium">{c.title}</span>
                                                            <span className="mt-0.5 block truncate font-mono text-[10px] text-zinc-500">
                                                                {c.youtubeUrl}
                                                            </span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => startEdit(c)}
                                                            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-200"
                                                            aria-label={t("watchPlaylistEdit")}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void onDeleteClip(c)}
                                                            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                                                            aria-label={t("watchPlaylistDelete")}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                        </button>
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
