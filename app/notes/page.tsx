"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "react-toastify";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Pencil,
  PenLine,
  Pin,
  Plus,
  Settings2,
  FileDown,
  Share2,
  Sparkles,
  StickyNote,
  Tag,
  Trash2,
  UserMinus,
} from "lucide-react";
import { authFetch } from "@/lib/auth-context";
import { noteFolderDisplayName } from "@/lib/note-folder-display-name";
import { dispatchClearNavQuickSearch } from "@/lib/nav-quick-search-events";
import dynamic from "next/dynamic";
import { useI18n } from "@/components/i18n-provider";

const RichTextEditor = dynamic(
  () =>
    import("@/components/RichTextEditor").then((mod) => mod.RichTextEditor),
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

type NoteAccess = "owner" | "shared";

type NoteLabel = { id: string; name: string };

type NoteFolder = { id: string; name: string };

type Note = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  folderId: string | null;
  folderName: string | null;
  labels: NoteLabel[];
  access: NoteAccess;
  role?: "viewer" | "editor";
  ownerUsername?: string;
};

type ShareRow = {
  id: string;
  role: string;
  username: string;
  sharedWithUserId: string;
  createdAt: string;
};

function isOwner(n: Note): boolean {
  return n.access === "owner";
}

function canEdit(n: Note): boolean {
  return isOwner(n) || n.role === "editor";
}

function isViewerOnly(n: Note): boolean {
  return n.access === "shared" && n.role === "viewer";
}

function normalizeLabels(raw: unknown): NoteLabel[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: NoteLabel[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") {
      continue;
    }
    const o = x as Record<string, unknown>;
    const id = String(o.id ?? "");
    if (!id) {
      continue;
    }
    out.push({ id, name: typeof o.name === "string" ? o.name : "" });
  }
  return out;
}

function normalizeNote(raw: Record<string, unknown>): Note {
  const access = raw.access === "shared" ? "shared" : "owner";
  const roleRaw = raw.role;
  const role =
    roleRaw === "viewer"
      ? "viewer"
      : roleRaw === "editor"
        ? "editor"
        : undefined;
  const folderIdRaw = raw.folderId ?? raw.folder_id;
  return {
    id: String(raw.id),
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    pinned: Boolean(raw.pinned),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
    folderId:
      folderIdRaw != null && folderIdRaw !== ""
        ? String(folderIdRaw)
        : null,
    folderName:
      typeof raw.folderName === "string"
        ? raw.folderName
        : typeof raw.folder_name === "string"
          ? raw.folder_name
          : null,
    labels: normalizeLabels(raw.labels),
    access,
    ...(role ? { role } : {}),
    ...(typeof raw.ownerUsername === "string"
      ? { ownerUsername: raw.ownerUsername }
      : {}),
  };
}

function mergeNoteFromApiPatch(n: Note, updated: Record<string, unknown>): Note {
  return {
    ...n,
    title: typeof updated.title === "string" ? updated.title : n.title,
    body: typeof updated.body === "string" ? updated.body : n.body,
    pinned:
      typeof updated.pinned === "boolean" ? updated.pinned : n.pinned,
    createdAt:
      typeof updated.createdAt === "string" ? updated.createdAt : n.createdAt,
    updatedAt:
      typeof updated.updatedAt === "string" ? updated.updatedAt : n.updatedAt,
    folderId:
      updated.folderId !== undefined
        ? updated.folderId
          ? String(updated.folderId)
          : null
        : n.folderId,
    folderName:
      updated.folderName === null || typeof updated.folderName === "string"
        ? (updated.folderName as string | null)
        : n.folderName,
    labels: Array.isArray(updated.labels)
      ? normalizeLabels(updated.labels)
      : n.labels,
  };
}

function parseIsoMs(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  const diff = (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
  if (diff < 7) {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const NOTES_SIDEBAR_LS = "ken-notes-sidebar";

function snippet(text: string, maxLen: number, emptyLabel: string) {
  const withoutTags = text.replace(/<[^>]+>/g, " ");
  const trimmed = withoutTags.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) {
    return trimmed || emptyLabel;
  }
  return trimmed.slice(0, maxLen) + "…";
}

export default function NotesPage() {
  const { t } = useI18n();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tránh response GET /api/notes cũ ghi đè list mới (Strict Mode / gọi lặp). */
  const loadNotesGenRef = useRef(0);
  /** Luôn trỏ state mới nhất để flush lưu khi đóng tab / đổi trang. */
  const persistStateRef = useRef({
    selectedId: null as string | null,
    selectedNote: null as Note | null,
    title: "",
    body: "",
  });
  const saveNoteRef = useRef<
    | ((
        noteId: string,
        nextTitle: string,
        nextBody: string,
        options?: { silent?: boolean; keepalive?: boolean },
      ) => Promise<void>)
    | null
  >(null);
  /** Nội dung đã khớp server. */
  const serverBaselineRef = useRef<{
    id: string | null;
    title: string;
    body: string;
    updatedAt: string;
  }>({ id: null, title: "", body: "", updatedAt: "" });
  /**
   * Snapshot server mới nhất theo note id, chỉ cập nhật từ GET /api/notes hoặc PATCH thành công.
   */
  const lastServerByNoteIdRef = useRef(
    new Map<string, { title: string; body: string; updatedAt: string }>(),
  );
  /** Shared note (người được share có quyền sửa): đang gõ — tránh ghi đè bản server mới. */
  const sharedUserEditingRef = useRef(false);
  const lastSharedRemoteApplyMsRef = useRef(0);
  /** Browser timer id (number); tránh DOM vs Node `Timeout` mismatch. */
  const sharedEditingIdleTimerRef = useRef<number | null>(null);
  const prevSelectedIdRef = useRef<string | null | undefined>(undefined);
  /**
   * Chặn autosave trong lúc hydrate note (F5 / đổi note / đồng bộ shared note).
   */
  const skipAutosaveRef = useRef(true);
  const [postHydrateEpoch, setPostHydrateEpoch] = useState(0);
  /** Chỉ render editor khi note hiện tại đã hydrate xong title/body từ server. */
  const [hydratedNoteId, setHydratedNoteId] = useState<string | null>(null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const [shareForNote, setShareForNote] = useState<Note | null>(null);
  const [shareUsername, setShareUsername] = useState("");
  const [shareRole, setShareRole] = useState<"editor" | "viewer">("editor");
  const [shareList, setShareList] = useState<ShareRow[]>([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [pdfExportBusy, setPdfExportBusy] = useState(false);

  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>([]);
  const [listFolderFilter, setListFolderFilter] = useState<"all" | string>(
    "all",
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [folderInputOpen, setFolderInputOpen] = useState(false);
  const [folderPickOpen, setFolderPickOpen] = useState(false);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [folderModalBusy, setFolderModalBusy] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [folderPendingDelete, setFolderPendingDelete] = useState<NoteFolder | null>(
    null,
  );
  const [orgBusy, setOrgBusy] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") {
        return;
      }
      if (window.matchMedia("(min-width: 768px)").matches) {
        const v = localStorage.getItem(NOTES_SIDEBAR_LS);
        if (v === "collapsed") {
          setSidebarExpanded(false);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setSidebarExpandedPersist = useCallback((expanded: boolean) => {
    setSidebarExpanded(expanded);
    try {
      localStorage.setItem(
        NOTES_SIDEBAR_LS,
        expanded ? "expanded" : "collapsed",
      );
    } catch {
      /* ignore */
    }
  }, []);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      const wide = mq.matches;
      setIsNarrow(!wide);
      if (wide) {
        setMobileEditorOpen(false);
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const selectedNote = notes.find((n) => n.id === selectedId);
  const selectedNoteRef = useRef<Note | undefined>(undefined);
  selectedNoteRef.current = selectedNote;

  const filteredNotes = useMemo(() => {
    if (listFolderFilter === "all") {
      return notes;
    }
    return notes.filter((n) => n.folderId === listFolderFilter);
  }, [notes, listFolderFilter]);

  const isEditorReady =
    !!selectedNote && !!selectedId && hydratedNoteId === selectedId;

  persistStateRef.current = {
    selectedId,
    selectedNote: selectedNote ?? null,
    title,
    body,
  };

  const finishHydrate = useCallback((noteId: string | null) => {
    setHydratedNoteId(noteId);
    queueMicrotask(() => {
      window.setTimeout(() => {
        skipAutosaveRef.current = false;
        setPostHydrateEpoch((e) => e + 1);
      }, 0);
    });
  }, []);

  const loadShares = useCallback(async (noteId: string) => {
    const res = await authFetch(`/api/notes/${noteId}/share`);
    if (!res.ok) {
      setShareList([]);
      return;
    }
    const data = (await res.json()) as { shares?: ShareRow[] };
    setShareList(Array.isArray(data.shares) ? data.shares : []);
  }, []);

  useEffect(() => {
    if (!shareForNote) {
      setShareList([]);
      setShareUsername("");
      setShareRole("editor");
      return;
    }
    void loadShares(shareForNote.id);
  }, [shareForNote, loadShares]);

  const loadNotes = useCallback(async () => {
    const gen = ++loadNotesGenRef.current;
    try {
      const [res, foldersRes] = await Promise.all([
        authFetch("/api/notes"),
        authFetch("/api/notes/folders"),
      ]);
      if (gen !== loadNotesGenRef.current) {
        return;
      }
      if (foldersRes.ok) {
        const fd = (await foldersRes.json()) as { folders?: unknown };
        const arr = Array.isArray(fd.folders) ? fd.folders : [];
        setNoteFolders(
          arr.map((x) => {
            const o = x as Record<string, unknown>;
            return {
              id: String(o.id ?? ""),
              name: String(o.name ?? ""),
            };
          }),
        );
      }
      if (res.status === 401) {
        lastServerByNoteIdRef.current.clear();
        setNotes([]);
        return;
      }
      if (!res.ok) {
        lastServerByNoteIdRef.current.clear();
        console.error("[notes] load failed", res.status);
        toast.error(t("notesLoadFailed"));
        setNotes([]);
        return;
      }
      const data = await res.json();
      if (gen !== loadNotesGenRef.current) {
        return;
      }
      const rawList = Array.isArray(data) ? data : [];
      const list = rawList.map((x) =>
        normalizeNote(x as Record<string, unknown>),
      );
      const m = new Map<
        string,
        { title: string; body: string; updatedAt: string }
      >();
      for (const note of list) {
        m.set(note.id, {
          title: note.title,
          body: note.body,
          updatedAt: note.updatedAt,
        });
      }
      lastServerByNoteIdRef.current = m;
      setNotes(list);
      if (list.length > 0) {
        setSelectedId((prev) => prev ?? list[0].id);
      } else {
        setHydratedNoteId(null);
      }
    } catch (e) {
      if (gen === loadNotesGenRef.current) {
        lastServerByNoteIdRef.current.clear();
        console.error("[notes] load exception", e);
        toast.error(t("notesLoadFailed"));
        setNotes([]);
        setHydratedNoteId(null);
      }
    }
  }, [t]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  /** Shared note: chỉ fetch đúng 1 note (không tải lại cả list + mọi body). */
  useEffect(() => {
    if (selectedNote?.access !== "shared" || !selectedId) {
      return;
    }
    const tick = async () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      try {
        const res = await authFetch(`/api/notes/${selectedId}`);
        if (!res.ok) {
          return;
        }
        const raw = (await res.json()) as Record<string, unknown>;
        const normalized = normalizeNote(raw);
        setNotes((prev) =>
          prev.map((x) => (x.id === selectedId ? normalized : x)),
        );
        lastServerByNoteIdRef.current.set(selectedId, {
          title: normalized.title,
          body: normalized.body,
          updatedAt: normalized.updatedAt,
        });
      } catch {
        /* ignore */
      }
    };
    void tick();
    document.addEventListener("visibilitychange", tick);
    const intervalId = window.setInterval(tick, 12_000);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.clearInterval(intervalId);
    };
  }, [selectedId, selectedNote?.access]);

  /** Chỉ khi đổi note được chọn: load editor + baseline từ snapshot server. */
  useLayoutEffect(() => {
    const idChanged = prevSelectedIdRef.current !== selectedId;
    prevSelectedIdRef.current = selectedId ?? null;
    if (!idChanged) {
      return;
    }

    sharedUserEditingRef.current = false;
    if (sharedEditingIdleTimerRef.current) {
      clearTimeout(sharedEditingIdleTimerRef.current);
      sharedEditingIdleTimerRef.current = null;
    }

    skipAutosaveRef.current = true;
    setHydratedNoteId(null);

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

    const n = notes.find((x) => x.id === selectedId);
    if (!n) {
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

    const snap = lastServerByNoteIdRef.current.get(n.id);
    const nextTitle = snap?.title ?? n.title;
    const nextBody = snap?.body ?? n.body;
    const nextUpdatedAt = snap?.updatedAt ?? n.updatedAt;

    setTitle(nextTitle);
    setBody(nextBody);
    serverBaselineRef.current = {
      id: n.id,
      title: nextTitle,
      body: nextBody,
      updatedAt: nextUpdatedAt,
    };

    finishHydrate(n.id);
  }, [selectedId, notes, finishHydrate]);

  /**
   * Đồng bộ shared note đang mở mà không cần reload trang.
   * Dựa trên updatedAt — không so sánh body với baseline (TipTap chuẩn hóa HTML
   * nên body luôn "khác" baseline và trước đây chặn merge vĩnh viễn).
   */
  useEffect(() => {
    if (!selectedId || !selectedNote) {
      return;
    }
    if (selectedNote.access !== "shared") {
      return;
    }

    const snap = lastServerByNoteIdRef.current.get(selectedId);
    if (!snap) {
      return;
    }

    const baseline = serverBaselineRef.current;
    if (baseline.id !== selectedId) {
      return;
    }

    const tSnap = parseIsoMs(snap.updatedAt);
    const tBase = parseIsoMs(baseline.updatedAt);
    const serverNewer = tSnap > tBase;

    if (!serverNewer) {
      return;
    }

    const viewer = isViewerOnly(selectedNote);
    if (!viewer && canEdit(selectedNote) && sharedUserEditingRef.current) {
      return;
    }

    skipAutosaveRef.current = true;
    lastSharedRemoteApplyMsRef.current = Date.now();
    sharedUserEditingRef.current = false;
    if (sharedEditingIdleTimerRef.current) {
      clearTimeout(sharedEditingIdleTimerRef.current);
      sharedEditingIdleTimerRef.current = null;
    }

    setHydratedNoteId(null);

    setTitle(snap.title);
    setBody(snap.body);
    serverBaselineRef.current = {
      id: selectedId,
      title: snap.title,
      body: snap.body,
      updatedAt: snap.updatedAt,
    };

    finishHydrate(selectedId);
  }, [selectedId, selectedNote, notes, finishHydrate]);

  const bumpSharedEditingActivity = useCallback(() => {
    const sn = selectedNoteRef.current;
    if (!sn || sn.access !== "shared" || !canEdit(sn)) {
      return;
    }
    if (Date.now() - lastSharedRemoteApplyMsRef.current <= 500) {
      return;
    }
    sharedUserEditingRef.current = true;
    if (sharedEditingIdleTimerRef.current) {
      clearTimeout(sharedEditingIdleTimerRef.current);
    }
    sharedEditingIdleTimerRef.current = window.setTimeout(() => {
      sharedEditingIdleTimerRef.current = null;
      sharedUserEditingRef.current = false;
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (sharedEditingIdleTimerRef.current) {
        clearTimeout(sharedEditingIdleTimerRef.current);
      }
    };
  }, []);

  const onTitleChange = useCallback(
    (v: string) => {
      setTitle(v);
      bumpSharedEditingActivity();
      if (!selectedId) {
        return;
      }
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, title: v } : n)),
      );
    },
    [selectedId, bumpSharedEditingActivity],
  );

  const onBodyChange = useCallback(
    (html: string) => {
      setBody(html);
      bumpSharedEditingActivity();
      if (!selectedId) {
        return;
      }
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, body: html } : n)),
      );
    },
    [selectedId, bumpSharedEditingActivity],
  );

  const saveNote = useCallback(
    async (
      noteId: string,
      nextTitle: string,
      nextBody: string,
      options?: { silent?: boolean; keepalive?: boolean },
    ) => {
      const showSavingUi = !options?.silent;
      if (showSavingUi) {
        setSaving(true);
      }
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
          if (showSavingUi) {
            toast.error(t("notesSaveFailed"));
          }
          return;
        }
        const updated = (await res.json()) as Record<string, unknown>;
        const nid = String(noteId);
        const nextT = String(updated.title ?? "");
        const nextB = String(updated.body ?? "");
        const nextU = String(updated.updatedAt ?? "");
        setNotes((prev) =>
          prev.map((n) =>
            String(n.id) === nid ? mergeNoteFromApiPatch(n, updated) : n,
          ),
        );
        if (serverBaselineRef.current.id === nid) {
          serverBaselineRef.current = {
            id: nid,
            title: nextT,
            body: nextB,
            updatedAt: nextU,
          };
        }
        lastServerByNoteIdRef.current.set(nid, {
          title: nextT,
          body: nextB,
          updatedAt: nextU,
        });
        const open = persistStateRef.current;
        if (
          open.selectedId === nid &&
          open.selectedNote?.access === "shared" &&
          canEdit(open.selectedNote)
        ) {
          sharedUserEditingRef.current = false;
          if (sharedEditingIdleTimerRef.current) {
            clearTimeout(sharedEditingIdleTimerRef.current);
            sharedEditingIdleTimerRef.current = null;
          }
        }
      } catch {
        if (showSavingUi) {
          toast.error(t("notesSaveFailed"));
        }
      } finally {
        if (showSavingUi) {
          setSaving(false);
        }
      }
    },
    [t],
  );

  const saveCurrentIfDirty = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const {
      selectedId: sid,
      selectedNote: sn,
      title: nextTitle,
      body: nextBody,
    } = persistStateRef.current;
    const bl = serverBaselineRef.current;
    if (!sid || !sn || !canEdit(sn)) {
      return;
    }
    if (bl.id !== sid) {
      return;
    }
    if (nextTitle === bl.title && nextBody === bl.body) {
      return;
    }
    await saveNote(sid, nextTitle, nextBody, { silent: true });
  }, [saveNote]);

  /**
   * Debounce lưu — khi timer chạy phải đọc persistStateRef.
   */
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
    const sn = persistStateRef.current.selectedNote;
    if (!sn || !canEdit(sn)) {
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
      if (!p.selectedId || !p.selectedNote || !canEdit(p.selectedNote)) {
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

  useEffect(() => {
    saveNoteRef.current = saveNote;
  }, [saveNote]);

  const flushPendingNoteSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const {
      selectedId: sid,
      selectedNote: sn,
      title: nextTitle,
      body: nextBody,
    } = persistStateRef.current;
    const bl = serverBaselineRef.current;
    if (!sid || !sn || !canEdit(sn)) {
      return;
    }
    if (hydratedNoteId !== sid) {
      return;
    }
    if (bl.id !== sid) {
      return;
    }
    if (nextTitle === bl.title && nextBody === bl.body) {
      return;
    }
    const fn = saveNoteRef.current;
    if (fn) {
      void fn(sid, nextTitle, nextBody, { silent: true, keepalive: true });
    }
  }, [hydratedNoteId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushPendingNoteSave();
      }
    };
    const onPageHide = () => flushPendingNoteSave();
    const onBeforeUnload = () => flushPendingNoteSave();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      flushPendingNoteSave();
    };
  }, [flushPendingNoteSave]);

  const handleNewNote = async () => {
    await saveCurrentIfDirty();
    try {
      const folderPayload =
        listFolderFilter !== "all" ? listFolderFilter : undefined;
      const res = await authFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "",
          body: "",
          ...(folderPayload ? { folderId: folderPayload } : {}),
        }),
      });
      if (!res.ok) {
        return;
      }
      const created = normalizeNote(
        (await res.json()) as Record<string, unknown>,
      );
      setNotes((prev) => [created, ...prev]);
      lastServerByNoteIdRef.current.set(created.id, {
        title: created.title,
        body: created.body,
        updatedAt: created.updatedAt,
      });
      setSelectedId(created.id);
      setTitle("");
      setBody("");
      setHydratedNoteId(null);

      if (isNarrow) {
        setMobileEditorOpen(true);
      }
    } catch {
      /* ignore */
    }
  };

  const handleSaveTitleFromList = useCallback(
    async (noteId: string, newTitle: string) => {
      const n = notes.find((x) => x.id === noteId);
      setEditingTitleId(null);
      if (!n || !canEdit(n)) {
        return;
      }
      try {
        const res = await authFetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim() || "" }),
        });
        if (!res.ok) {
          return;
        }
        const updated = (await res.json()) as Record<string, unknown>;
        const ut = String(updated.title ?? "");
        const ub = String(updated.body ?? "");
        const uu = String(updated.updatedAt ?? "");
        lastServerByNoteIdRef.current.set(noteId, {
          title: ut,
          body: ub,
          updatedAt: uu,
        });
        setNotes((prev) =>
          prev.map((note) =>
            note.id === noteId ? mergeNoteFromApiPatch(note, updated) : note,
          ),
        );
        if (selectedId === noteId) {
          setTitle(ut);
          serverBaselineRef.current = {
            id: noteId,
            title: ut,
            body: ub,
            updatedAt: uu,
          };
        }
      } catch {
        /* ignore */
      }
    },
    [notes, selectedId],
  );

  const handleTogglePin = useCallback(async (n: Note) => {
    if (!isOwner(n)) {
      return;
    }
    try {
      const res = await authFetch(`/api/notes/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !n.pinned }),
      });
      if (!res.ok) {
        return;
      }
      const updated = (await res.json()) as Record<string, unknown>;
      const merged = mergeNoteFromApiPatch(n, updated);
      const prevSnap = lastServerByNoteIdRef.current.get(n.id);
      if (prevSnap) {
        lastServerByNoteIdRef.current.set(n.id, {
          ...prevSnap,
          updatedAt: merged.updatedAt,
        });
      }
      setNotes((prev) =>
        prev
          .map((note) => (note.id === n.id ? merged : note))
          .sort((a, b) => {
            if (a.pinned !== b.pinned) {
              return a.pinned ? -1 : 1;
            }
            return (
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
          }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const patchNoteOrg = useCallback(
    async (
      noteId: string,
      patch: { folderId?: string | null },
    ): Promise<boolean> => {
      const sn = notes.find((x) => x.id === noteId);
      if (!sn || !isOwner(sn)) {
        return false;
      }
      setOrgBusy(true);
      try {
        const res = await authFetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          toast.error(t("notesOrgSaveFailed"));
          return false;
        }
        const updated = (await res.json()) as Record<string, unknown>;
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId ? mergeNoteFromApiPatch(n, updated) : n,
          ),
        );
        const uu = String(updated.updatedAt ?? "");
        const prevSnap = lastServerByNoteIdRef.current.get(noteId);
        if (prevSnap) {
          lastServerByNoteIdRef.current.set(noteId, {
            ...prevSnap,
            updatedAt: uu,
          });
        }
        return true;
      } catch {
        toast.error(t("notesOrgSaveFailed"));
        return false;
      } finally {
        setOrgBusy(false);
      }
    },
    [notes, t],
  );

  const moveNoteToFolder = useCallback(
    async (folderId: string | null) => {
      const sid = selectedId;
      const sn = selectedNote;
      if (!sid || !sn || !isOwner(sn)) {
        return;
      }
      setFolderPickOpen(false);
      const ok = await patchNoteOrg(sid, { folderId: folderId });
      if (ok) {
        toast.success(t("notesFolderNoteMoved"));
      }
    },
    [patchNoteOrg, selectedId, selectedNote, t],
  );

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) {
      return;
    }
    try {
      const res = await authFetch("/api/notes/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.error(t("notesFolderCreateFailed"));
        return;
      }
      const data = (await res.json()) as { folder?: Record<string, unknown> };
      const f = data.folder;
      if (!f?.id) {
        return;
      }
      const row: NoteFolder = {
        id: String(f.id),
        name: String(f.name ?? ""),
      };
      setNoteFolders((prev) =>
        [...prev, row].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewFolderName("");
      setFolderInputOpen(false);
      toast.success(t("notesFolderCreated"));
    } catch {
      toast.error(t("notesFolderCreateFailed"));
    }
  }, [newFolderName, t]);

  const closeFolderManager = useCallback(() => {
    if (folderModalBusy) {
      return;
    }
    setFolderManagerOpen(false);
    setFolderPendingDelete(null);
    setEditingFolderId(null);
    setEditingFolderName("");
  }, [folderModalBusy]);

  const commitRenameFolder = useCallback(async () => {
    if (!editingFolderId) {
      return;
    }
    const name = editingFolderName.trim();
    if (!name) {
      return;
    }
    setFolderModalBusy(true);
    try {
      const res = await authFetch(`/api/notes/folders/${editingFolderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.error(t("notesFolderUpdateFailed"));
        return;
      }
      const data = (await res.json()) as {
        folder?: { id?: string; name?: string };
      };
      const nm = String(data.folder?.name ?? name);
      setNoteFolders((prev) =>
        [...prev.map((f) => (f.id === editingFolderId ? { ...f, name: nm } : f))].sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      );
      setNotes((prev) =>
        prev.map((n) =>
          n.folderId === editingFolderId ? { ...n, folderName: nm } : n,
        ),
      );
      setEditingFolderId(null);
      setEditingFolderName("");
      toast.success(t("notesFolderUpdated"));
    } catch {
      toast.error(t("notesFolderUpdateFailed"));
    } finally {
      setFolderModalBusy(false);
    }
  }, [editingFolderId, editingFolderName, t]);

  const commitDeleteFolder = useCallback(async () => {
    const fd = folderPendingDelete;
    if (!fd) {
      return;
    }
    setFolderModalBusy(true);
    try {
      const res = await authFetch(`/api/notes/folders/${fd.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("notesFolderDeleteFailed"));
        return;
      }
      setNoteFolders((prev) => prev.filter((f) => f.id !== fd.id));
      setListFolderFilter((prev) => (prev === fd.id ? "all" : prev));
      setNotes((prev) =>
        prev.map((n) =>
          n.folderId === fd.id
            ? { ...n, folderId: null, folderName: null }
            : n,
        ),
      );
      setFolderPendingDelete(null);
      toast.success(t("notesFolderDeleted"));
    } catch {
      toast.error(t("notesFolderDeleteFailed"));
    } finally {
      setFolderModalBusy(false);
    }
  }, [folderPendingDelete, t]);

  const handleConfirmDelete = async () => {
    const id = noteToDelete?.id;
    if (!id) {
      return;
    }
    setNoteToDelete(null);
    try {
      const res = await authFetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        return;
      }
      const remaining = notes.filter((n) => n.id !== id);
      lastServerByNoteIdRef.current.delete(id);
      setNotes(remaining);
      const nextId = remaining[0]?.id ?? null;
      setSelectedId((prev) => (prev === id ? nextId : prev));
      if (selectedId === id) {
        setHydratedNoteId(null);
      }

      if (isNarrow && remaining.length === 0) {
        setMobileEditorOpen(false);
      }
      toast.success(t("toastNoteDeleted"));
    } catch {
      /* ignore */
    }
  };

  const handleOpenShare = async () => {
    if (!selectedNote) {
      return;
    }
    await saveCurrentIfDirty();
    setShareForNote(selectedNote);
  };

  const handleExportPdf = useCallback(async () => {
    if (!isEditorReady || !selectedNote) {
      return;
    }
    await saveCurrentIfDirty();
    setPdfExportBusy(true);
    try {
      const { exportNoteToPdf } = await import("@/lib/export-note-pdf");
      await exportNoteToPdf({
        title: title.trim() || t("untitled"),
        htmlBody: body,
        fileNameBase: title.trim() || t("untitled"),
      });
      toast.success(t("noteExportPdfSuccess"));
    } catch (e) {
      console.error(e);
      toast.error(t("noteExportPdfFailed"));
    } finally {
      setPdfExportBusy(false);
    }
  }, [isEditorReady, selectedNote, title, body, t, saveCurrentIfDirty]);

  const handleAddShare = async () => {
    if (!shareForNote || !shareUsername.trim()) {
      return;
    }
    await saveCurrentIfDirty();
    setShareBusy(true);
    try {
      const res = await authFetch(`/api/notes/${shareForNote.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: shareUsername.trim(),
          role: shareRole,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (res.status === 404) {
        toast.error(
          payload.error === "User not found"
            ? t("noteShareUserNotFound")
            : t("noteShareFailed"),
        );
        return;
      }
      if (res.status === 409) {
        toast.error(t("noteShareAlready"));
        return;
      }
      if (res.status === 400) {
        toast.error(
          String(payload.error ?? "")
            .toLowerCase()
            .includes("yourself")
            ? t("noteShareSelf")
            : t("noteShareFailed"),
        );
        return;
      }
      if (!res.ok) {
        toast.error(t("noteShareFailed"));
        return;
      }
      toast.success(t("noteShareSuccess"));
      setShareUsername("");
      await loadShares(shareForNote.id);
    } finally {
      setShareBusy(false);
    }
  };

  const handleRevokeShare = async (username: string) => {
    if (!shareForNote) {
      return;
    }
    setShareBusy(true);
    try {
      const res = await authFetch(`/api/notes/${shareForNote.id}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        toast.error(t("noteShareFailed"));
        return;
      }
      toast.success(t("noteShareRevoked"));
      await loadShares(shareForNote.id);
    } finally {
      setShareBusy(false);
    }
  };

  const openNoteOnMobile = async (id: string) => {
    if (selectedId === id) {
      if (isNarrow) {
        setMobileEditorOpen(true);
      }
      dispatchClearNavQuickSearch();
      return;
    }

    await saveCurrentIfDirty();

    setSelectedId(id);
    dispatchClearNavQuickSearch();
    if (isNarrow) {
      setMobileEditorOpen(true);
    }
  };

  const showListPanel = !isNarrow || !mobileEditorOpen;
  const showEditorPanel = !isNarrow || mobileEditorOpen;
  const showNotesSidebar =
    (!isNarrow && sidebarExpanded) || (isNarrow && showListPanel);

  return (
    <div className="flex h-[min(100dvh,100vh)] max-h-[min(100dvh,100vh)] min-h-0 flex-col overflow-hidden rounded-none border-0 border-zinc-200 bg-zinc-50 md:h-[calc(100vh-2rem)] md:max-h-[calc(100vh-2rem)] md:rounded-xl md:border md:border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 md:dark:border-zinc-800">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
        {!isNarrow && !sidebarExpanded ? (
          <button
            type="button"
            onClick={() => setSidebarExpandedPersist(true)}
            className="hidden shrink-0 flex-col items-center justify-start border-r border-zinc-200 bg-zinc-50 pt-3 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 md:flex"
            style={{ width: "2.5rem" }}
            aria-label={t("notesSidebarExpand")}
            title={t("notesSidebarExpand")}
          >
            <ChevronRight className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
          </button>
        ) : null}

        <aside
          className={`flex min-h-0 shrink-0 flex-col border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:border-r ${
            showNotesSidebar
              ? "w-full flex-1 border-r md:w-80 md:max-h-none md:flex-none"
              : "hidden"
          } max-md:min-h-0 max-md:flex-1`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
            <h1 className="flex min-w-0 items-center gap-2.5 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-lg">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <StickyNote className="h-4 w-4" strokeWidth={2.25} />
              </span>
              {t("notes")}
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              {!isNarrow ? (
                <button
                  type="button"
                  onClick={() => setSidebarExpandedPersist(false)}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label={t("notesSidebarCollapse")}
                  title={t("notesSidebarCollapse")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleNewNote()}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:px-3.5 sm:text-sm"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                {t("newNote")}
              </button>
            </div>
          </div>
          {isNarrow && notes.length > 0 ? (
            <div className="border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
              <label
                className="sr-only"
                htmlFor="notes-list-folder-filter-mobile"
              >
                {t("notesFolderFilterAria")}
              </label>
              <select
                id="notes-list-folder-filter-mobile"
                value={listFolderFilter}
                onChange={(e) => setListFolderFilter(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                aria-label={t("notesFolderFilterAria")}
              >
                <option value="all">{t("notesFolderFilterOptionAll")}</option>
                {noteFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {noteFolderDisplayName(f.name) ?? f.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <ul className="flex-1 overflow-y-auto px-1 pb-2 pt-1">
            {notes.length === 0 ? (
              <li className="flex flex-col items-center gap-3 p-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                  <Sparkles className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  {t("noNotesYet")}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("clickNewNoteToStart")}
                </p>
              </li>
            ) : filteredNotes.length === 0 ? (
              <li className="flex flex-col items-center gap-2 p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                <FolderOpen className="h-8 w-8 text-zinc-400 opacity-80 dark:text-zinc-500" />
                {t("notesNoMatchFolder")}
              </li>
            ) : (
              filteredNotes.map((n) => (
                <li
                  key={n.id}
                  className={`group flex items-stretch rounded-lg border ${
                    selectedId === n.id
                      ? "border-transparent bg-amber-50 shadow-sm dark:bg-amber-950/25"
                      : "border-transparent hover:border-neutral-200 hover:bg-neutral-50 dark:hover:border-neutral-700 dark:hover:bg-neutral-900/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void openNoteOnMobile(n.id)}
                    className="min-w-0 flex-1 px-3 py-3 text-left sm:px-4"
                  >
                    {editingTitleId === n.id ? (
                      <input
                        type="text"
                        value={editingTitleValue}
                        onChange={(e) => setEditingTitleValue(e.target.value)}
                        onBlur={() =>
                          handleSaveTitleFromList(n.id, editingTitleValue)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveTitleFromList(n.id, editingTitleValue);
                          }
                          if (e.key === "Escape") {
                            setEditingTitleId(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full truncate rounded border border-zinc-300 bg-white px-1 py-0.5 text-sm font-medium outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        autoFocus
                      />
                    ) : (
                      <p
                        className="truncate font-medium text-zinc-900 dark:text-zinc-100"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (!canEdit(n)) {
                            return;
                          }
                          setEditingTitleId(n.id);
                          setEditingTitleValue(n.title || "");
                        }}
                        title={
                          canEdit(n) ? t("doubleClickEditTitle") : undefined
                        }
                      >
                        {n.title || t("untitled")}
                      </p>
                    )}
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      <Folder
                        className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-500"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">
                        {n.folderName
                          ? (noteFolderDisplayName(n.folderName) ?? n.folderName)
                          : t("notesFolderFilterOptionAll")}
                      </span>
                    </p>
                    {n.labels.length > 0 ? (
                      <p className="mt-0.5 flex max-w-full flex-wrap gap-1">
                        {n.labels.slice(0, 4).map((lab) => (
                          <span
                            key={lab.id}
                            className="inline-flex max-w-[6rem] items-center gap-0.5 truncate rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            <Tag className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden />
                            <span className="min-w-0 truncate">{lab.name}</span>
                          </span>
                        ))}
                        {n.labels.length > 4 ? (
                          <span className="text-[10px] text-zinc-400">
                            +{n.labels.length - 4}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="mt-1 flex items-start gap-1.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                      <span className="min-w-0 truncate">
                        {n.access === "shared" && n.ownerUsername ? (
                          <span className="mr-1 font-medium text-zinc-600 dark:text-zinc-400">
                            {t("noteSharedBy").replace("{name}", n.ownerUsername)}
                          </span>
                        ) : null}
                        <span className="font-medium text-zinc-600 dark:text-zinc-300">
                          {formatDate(n.updatedAt)}
                        </span>
                        <span className="text-zinc-400"> · </span>
                        {snippet(n.body, 40, t("noContent"))}
                      </span>
                    </p>
                  </button>
                  {isOwner(n) ? (
                    <div
                      className={`flex shrink-0 items-center gap-0.5 self-stretch rounded-r-md px-1 py-1 ${
                        selectedId === n.id
                          ? ""
                          : "transition-colors group-hover:bg-neutral-100 dark:group-hover:bg-neutral-800/70"
                      }`}
                      onClick={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(n);
                        }}
                        className={`flex shrink-0 items-center justify-center rounded-md p-2 transition-colors ${
                          n.pinned
                            ? "text-orange-600 dark:text-orange-500"
                            : "text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700/80 dark:hover:text-neutral-200"
                        }`}
                        title={n.pinned ? t("unpin") : t("pinNote")}
                      >
                        <Pin
                          className={`h-4 w-4 ${n.pinned ? "fill-current" : "fill-none opacity-90"}`}
                          strokeWidth={1.75}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteToDelete(n);
                        }}
                        className="shrink-0 rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700/80 dark:hover:text-neutral-200"
                        title={t("deleteNoteTitle")}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : (
                    <span className="flex w-10 shrink-0 items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {t("noteSharedBadge")}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        </aside>

        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950 ${
            !showEditorPanel ? "hidden md:flex" : ""
          } max-md:w-full`}
        >
          {selectedNote && isEditorReady ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 sm:px-5 sm:py-3">
                {isNarrow ? (
                  <button
                    type="button"
                    onClick={() => setMobileEditorOpen(false)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    aria-label={t("notesBackToList")}
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span className="max-w-[5rem] truncate sm:max-w-none">
                      {t("notesBackToList")}
                    </span>
                  </button>
                ) : null}
                <span className="hidden shrink-0 text-zinc-400 dark:text-zinc-500 sm:flex" aria-hidden>
                  <PenLine className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                  disabled={!canEdit(selectedNote)}
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold tracking-tight text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-80 sm:text-lg dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
                {isViewerOnly(selectedNote) ? (
                  <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {t("noteShareRoleViewer")}
                  </span>
                ) : null}
                {saving && canEdit(selectedNote) ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("saving")}
                  </span>
                ) : null}
                {orgBusy && isOwner(selectedNote) ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("notesOrgUpdating")}
                  </span>
                ) : null}
                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExportPdf()}
                    disabled={pdfExportBusy}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:px-3 sm:text-sm"
                    title={t("noteExportPdf")}
                  >
                    {pdfExportBusy ? (
                      <Loader2
                        className="h-4 w-4 shrink-0 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <FileDown className="h-4 w-4 shrink-0" strokeWidth={2} />
                    )}
                    <span className="max-w-[5.5rem] truncate sm:max-w-none">
                      {t("noteExportPdf")}
                    </span>
                  </button>
                  {notes.length > 0 ? (
                    <>
                      <label
                        className="sr-only"
                        htmlFor="notes-list-folder-filter"
                      >
                        {t("notesFolderFilterAria")}
                      </label>
                      <select
                        id="notes-list-folder-filter"
                        value={listFolderFilter}
                        onChange={(e) => setListFolderFilter(e.target.value)}
                        className="max-w-[6.5rem] shrink-0 cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800 shadow-sm sm:max-w-[8.5rem] sm:text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        aria-label={t("notesFolderFilterAria")}
                      >
                        <option value="all">
                          {t("notesFolderFilterOptionAll")}
                        </option>
                        {noteFolders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {noteFolderDisplayName(f.name) ?? f.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  {isOwner(selectedNote) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setFolderPickOpen(true)}
                        disabled={orgBusy}
                        className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        title={t("notesFolderArchiveAria")}
                        aria-label={t("notesFolderArchiveAria")}
                      >
                        <Archive className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <div className="flex min-w-0 shrink-0 items-stretch overflow-hidden rounded-lg border border-zinc-200/90 bg-zinc-50/90 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/55">
                        <button
                          type="button"
                          onClick={() => setFolderInputOpen((v) => !v)}
                          disabled={orgBusy}
                          className="flex h-8 w-9 shrink-0 items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                          title={t("notesNewFolderTitle")}
                          aria-label={t("notesNewFolderTitle")}
                          aria-expanded={folderInputOpen}
                        >
                          <Plus className="h-4 w-4" strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFolderManagerOpen(true);
                            setFolderPendingDelete(null);
                            setEditingFolderId(null);
                            setEditingFolderName("");
                          }}
                          disabled={orgBusy}
                          className="flex h-8 w-9 shrink-0 items-center justify-center border-l border-zinc-200/80 text-zinc-600 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                          title={t("notesFolderManageAria")}
                          aria-label={t("notesFolderManageAria")}
                        >
                          <Settings2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleOpenShare()}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:text-sm"
                      >
                        <Share2 className="h-4 w-4" />
                        {t("noteShare")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {isOwner(selectedNote) && folderInputOpen ? (
                <div className="flex flex-wrap gap-2 border-b border-zinc-200 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/35 sm:px-5">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void createFolder();
                      }
                      if (e.key === "Escape") {
                        setFolderInputOpen(false);
                        setNewFolderName("");
                      }
                    }}
                    placeholder={t("notesNewFolderPlaceholder")}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 sm:text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void createFolder()}
                    className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {t("notesFolderAdd")}
                  </button>
                </div>
              ) : null}
              {isOwner(selectedNote)
                ? null
                : selectedNote.folderName ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/90 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/30 sm:px-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-200/90 px-2.5 py-1 text-xs font-semibold text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
                    <Folder className="h-3.5 w-3.5" aria-hidden />
                    {noteFolderDisplayName(selectedNote.folderName) ??
                      selectedNote.folderName}
                  </span>
                </div>
              ) : null}
              {isViewerOnly(selectedNote) ? (
                <p className="border-b border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 sm:px-5">
                  {t("noteReadOnlyHint")}
                </p>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 sm:py-4">
                <RichTextEditor
                  key={selectedId}
                  value={body}
                  onChange={onBodyChange}
                  placeholder={t("bodyPlaceholder")}
                  minHeightClassName="min-h-[min(45dvh,280px)] md:min-h-[260px]"
                  readOnly={isViewerOnly(selectedNote)}
                />
              </div>
            </>
          ) : showEditorPanel ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-12">
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                <FileText className="h-10 w-10" strokeWidth={1.5} />
              </span>
              <p className="max-w-xs text-center text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {notes.length === 0
                  ? t("createNoteToStart")
                  : t("selectOrCreateNote")}
              </p>
              {notes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleNewNote()}
                  className="flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  {t("newNote")}
                </button>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>

      {noteToDelete ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setNoteToDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-note-title"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-note-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {t("deleteNoteConfirm")}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {t("willBePermanentlyDeleted").replace(
                "{title}",
                noteToDelete.title || t("untitled"),
              )}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteToDelete(null)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
              >
                {t("deleteButton")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareForNote ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !shareBusy && setShareForNote(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-note-title"
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="share-note-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {t("noteShareTitle")}
            </h2>
            <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
              {shareForNote.title || t("untitled")}
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t("noteShareUsernameLabel")}
              </label>
              <input
                type="text"
                value={shareUsername}
                onChange={(e) => setShareUsername(e.target.value)}
                placeholder={t("noteShareUsernamePlaceholder")}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="shareRole"
                    checked={shareRole === "editor"}
                    onChange={() => setShareRole("editor")}
                  />
                  {t("noteShareRoleEditor")}
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="shareRole"
                    checked={shareRole === "viewer"}
                    onChange={() => setShareRole("viewer")}
                  />
                  {t("noteShareRoleViewer")}
                </label>
              </div>
              <button
                type="button"
                disabled={shareBusy || !shareUsername.trim()}
                onClick={() => void handleAddShare()}
                className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {t("noteShareAdd")}
              </button>
            </div>

            <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {t("noteShareListHeading")}
              </h3>
              {shareList.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {t("noteShareEmpty")}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {shareList.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {s.username}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {s.role === "viewer"
                            ? t("noteShareRoleViewer")
                            : t("noteShareRoleEditor")}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={shareBusy}
                        onClick={() => void handleRevokeShare(s.username)}
                        className="shrink-0 rounded p-2 text-zinc-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
                        title={t("noteShareRemove")}
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={shareBusy}
                onClick={() => setShareForNote(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {folderPickOpen &&
      selectedNote &&
      isOwner(selectedNote) &&
      selectedId ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !orgBusy && setFolderPickOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="folder-pick-title"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="folder-pick-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {t("notesFolderPickTitle")}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {t("notesFolderPickHint")}
            </p>
            <ul className="mt-4 max-h-[min(50dvh,16rem)] space-y-1 overflow-y-auto">
              <li>
                <button
                  type="button"
                  disabled={orgBusy}
                  onClick={() => void moveNoteToFolder(null)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-50 ${
                    !selectedNote.folderId
                      ? "border-zinc-900 bg-zinc-100 text-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-50"
                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {t("notesFolderFilterOptionAll")}
                </button>
              </li>
              {noteFolders.map((f) => {
                const on = selectedNote.folderId === f.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={orgBusy}
                      onClick={() => void moveNoteToFolder(f.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-50 ${
                        on
                          ? "border-zinc-900 bg-zinc-100 text-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-50"
                          : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {noteFolderDisplayName(f.name) ?? f.name}
                    </button>
                  </li>
                );
              })}
            </ul>
            {noteFolders.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                {t("notesFolderPickEmpty")}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={orgBusy}
                onClick={() => setFolderPickOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {folderManagerOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => closeFolderManager()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="folder-manage-title"
        >
          <div
            className="max-h-[min(90dvh,32rem)] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {folderPendingDelete ? (
              <>
                <h2
                  id="folder-manage-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  {t("notesFolderDeleteConfirmTitle")}
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {t("notesFolderDeleteConfirmBody").replace(
                    "{name}",
                    noteFolderDisplayName(folderPendingDelete.name) ??
                      folderPendingDelete.name,
                  )}
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={folderModalBusy}
                    onClick={() => setFolderPendingDelete(null)}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={folderModalBusy}
                    onClick={() => void commitDeleteFolder()}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700"
                  >
                    {t("deleteButton")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2
                  id="folder-manage-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  {t("notesFolderManageTitle")}
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {t("notesFolderManageHint")}
                </p>
                {noteFolders.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                    {t("notesFolderEmptyList")}
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {noteFolders.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/40"
                      >
                        {editingFolderId === f.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={editingFolderName}
                              onChange={(e) => setEditingFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  void commitRenameFolder();
                                }
                                if (e.key === "Escape") {
                                  setEditingFolderId(null);
                                  setEditingFolderName("");
                                }
                              }}
                              disabled={folderModalBusy}
                              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                              autoFocus
                            />
                            <button
                              type="button"
                              disabled={folderModalBusy || !editingFolderName.trim()}
                              onClick={() => void commitRenameFolder()}
                              className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                              {t("notesFolderSaveName")}
                            </button>
                            <button
                              type="button"
                              disabled={folderModalBusy}
                              onClick={() => {
                                setEditingFolderId(null);
                                setEditingFolderName("");
                              }}
                              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                            >
                              {t("cancel")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {noteFolderDisplayName(f.name) ?? f.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                disabled={
                                  folderModalBusy || editingFolderId !== null
                                }
                                onClick={() => {
                                  setEditingFolderId(f.id);
                                  setEditingFolderName(f.name);
                                }}
                                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 disabled:opacity-40 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                                title={t("notesFolderRename")}
                                aria-label={t("notesFolderRename")}
                              >
                                <Pencil className="h-4 w-4" strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                disabled={folderModalBusy || editingFolderId !== null}
                                onClick={() => setFolderPendingDelete(f)}
                                className="rounded-lg p-2 text-zinc-500 hover:bg-red-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/30"
                                title={t("notesFolderDelete")}
                                aria-label={t("notesFolderDelete")}
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={2} />
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    disabled={folderModalBusy}
                    onClick={() => closeFolderManager()}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {t("close")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
