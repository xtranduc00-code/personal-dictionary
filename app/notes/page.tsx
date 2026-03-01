"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "react-toastify";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Pin,
  Plus,
  Share2,
  Trash2,
  UserMinus,
} from "lucide-react";
import { authFetch } from "@/lib/auth-context";
import { dispatchClearNavQuickSearch } from "@/lib/nav-quick-search-events";
import { useI18n } from "@/components/i18n-provider";
import { RichTextEditor } from "@/components/RichTextEditor";

type NoteAccess = "owner" | "shared";

type Note = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
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

function normalizeNote(raw: Record<string, unknown>): Note {
  const access = raw.access === "shared" ? "shared" : "owner";
  const roleRaw = raw.role;
  const role =
    roleRaw === "viewer"
      ? "viewer"
      : roleRaw === "editor"
        ? "editor"
        : undefined;
  return {
    id: String(raw.id),
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    pinned: Boolean(raw.pinned),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
    access,
    ...(role ? { role } : {}),
    ...(typeof raw.ownerUsername === "string"
      ? { ownerUsername: raw.ownerUsername }
      : {}),
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
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const diff = (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
  if (diff < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const NOTES_SIDEBAR_LS = "kfc-notes-sidebar";

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
      const res = await authFetch("/api/notes");
      if (gen !== loadNotesGenRef.current) {
        return;
      }
      if (res.status === 401) {
        lastServerByNoteIdRef.current.clear();
        setNotes([]);
        return;
      }
      if (!res.ok) {
        lastServerByNoteIdRef.current.clear();
        toast.error(t("notesLoadEnvHint"));
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
    } catch {
      if (gen === loadNotesGenRef.current) {
        lastServerByNoteIdRef.current.clear();
        toast.error(t("notesLoadEnvHint"));
        setNotes([]);
        setHydratedNoteId(null);
      }
    }
  }, [t]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  /** Note được share: làm mới danh sách định kỳ để thấy chỉnh sửa của chủ note. */
  useEffect(() => {
    if (selectedNote?.access !== "shared") {
      return;
    }
    const refresh = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        void loadNotes();
      }
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    const intervalId = window.setInterval(refresh, 1000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(intervalId);
    };
  }, [loadNotes, selectedNote?.access, selectedId]);

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
            String(n.id) === nid
              ? {
                  ...n,
                  title: nextT,
                  body: nextB,
                  pinned: Boolean(updated.pinned),
                  createdAt: String(updated.createdAt ?? n.createdAt),
                  updatedAt: nextU,
                }
              : n,
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
      const res = await authFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", body: "" }),
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
            note.id === noteId
              ? {
                  ...note,
                  title: ut,
                  updatedAt: uu,
                }
              : note,
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
      const uu = String(updated.updatedAt ?? n.updatedAt);
      const prevSnap = lastServerByNoteIdRef.current.get(n.id);
      if (prevSnap) {
        lastServerByNoteIdRef.current.set(n.id, {
          ...prevSnap,
          updatedAt: uu,
        });
      }
      setNotes((prev) =>
        prev
          .map((note) =>
            note.id === n.id
              ? {
                  ...note,
                  pinned: Boolean(updated.pinned),
                  updatedAt: uu,
                }
              : note,
          )
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
    <div className="flex h-[min(100dvh,100vh)] max-h-[min(100dvh,100vh)] min-h-0 flex-col overflow-hidden rounded-none border-0 border-zinc-200 bg-white md:h-[calc(100vh-2rem)] md:max-h-[calc(100vh-2rem)] md:rounded-xl md:border dark:border-zinc-800 dark:bg-zinc-900 md:dark:border-zinc-800">
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
          className={`flex min-h-0 shrink-0 flex-col border-zinc-200 dark:border-zinc-800 md:border-r ${
            showNotesSidebar
              ? "w-full flex-1 border-r md:w-72 md:max-h-none md:flex-none"
              : "hidden"
          } max-md:min-h-0 max-md:flex-1`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
            <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100 sm:text-lg">
              <FileText className="h-5 w-5 shrink-0" />
              {t("notes")}
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              {!isNarrow ? (
                <button
                  type="button"
                  onClick={() => setSidebarExpandedPersist(false)}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label={t("notesSidebarCollapse")}
                  title={t("notesSidebarCollapse")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleNewNote()}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-2 text-xs font-medium text-white hover:bg-zinc-800 sm:gap-1.5 sm:px-3 sm:text-sm dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Plus className="h-4 w-4" />
                {t("newNote")}
              </button>
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {notes.length === 0 ? (
              <li className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                {t("noNotesYet")}
                <br />
                {t("clickNewNoteToStart")}
              </li>
            ) : (
              notes.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-stretch border-b border-zinc-100 dark:border-zinc-800 ${
                    selectedId === n.id
                      ? "bg-amber-50 dark:bg-amber-950/30"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
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
                    <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {n.access === "shared" && n.ownerUsername ? (
                        <span className="mr-1 font-medium text-sky-700 dark:text-sky-400">
                          {t("noteSharedBy").replace("{name}", n.ownerUsername)}
                        </span>
                      ) : null}
                      {formatDate(n.updatedAt)} ·{" "}
                      {snippet(n.body, 40, t("noContent"))}
                    </p>
                  </button>
                  {isOwner(n) ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(n);
                        }}
                        className={`shrink-0 rounded p-2 ${
                          n.pinned
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        }`}
                        title={n.pinned ? t("unpin") : t("pinNote")}
                      >
                        <Pin
                          className={`h-4 w-4 ${n.pinned ? "fill-current" : ""}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteToDelete(n);
                        }}
                        className="shrink-0 rounded p-2 text-zinc-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                        title={t("deleteNoteTitle")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <span className="flex w-10 shrink-0 items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                      {t("noteSharedBadge")}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        </aside>

        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
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
                <input
                  type="text"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                  disabled={!canEdit(selectedNote)}
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-80 sm:text-lg dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
                {isViewerOnly(selectedNote) ? (
                  <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {t("noteShareRoleViewer")}
                  </span>
                ) : null}
                {saving && canEdit(selectedNote) ? (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {t("saving")}
                  </span>
                ) : null}
                {isOwner(selectedNote) ? (
                  <button
                    type="button"
                    onClick={() => void handleOpenShare()}
                    className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 sm:text-sm"
                  >
                    <Share2 className="h-4 w-4" />
                    {t("noteShare")}
                  </button>
                ) : null}
              </div>
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
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-zinc-500 dark:text-zinc-400">
              <FileText className="h-16 w-16 opacity-40" />
              <p className="text-center text-sm">
                {notes.length === 0
                  ? t("createNoteToStart")
                  : t("selectOrCreateNote")}
              </p>
              {notes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleNewNote()}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
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
    </div>
  );
}
