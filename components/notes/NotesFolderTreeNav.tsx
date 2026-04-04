"use client";

import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  buildFolderTree,
  type FolderTreeNode,
  type NoteFolderRow,
} from "@/lib/note-folder-tree";
import { noteFolderDisplayName } from "@/lib/note-folder-display-name";

const NOTE_DRAG = "application/x-ken-note-id";
const FOLDER_DRAG = "application/x-ken-folder-id";

export type NotesTreeNote = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  updatedAt: string;
  folderId: string | null;
  folderName: string | null;
  labels: { id: string; name: string }[];
  access: "owner" | "shared";
  role?: "viewer" | "editor";
  ownerUsername?: string;
};

type Labels = {
  navAriaLabel: string;
  expandFolder: string;
  folderPlusMenuAria: string;
  folderMenuSubfolder: string;
  folderMenuNote: string;
  quickSubfolderHeading: string;
  folderNamePlaceholder: string;
  add: string;
  cancel: string;
};

type Props = {
  folders: NoteFolderRow[];
  notes: NotesTreeNote[];
  renderCompactNoteRow: (note: NotesTreeNote, depthPadPx: number) => ReactNode;
  selectedFilter: "all" | string;
  onSelectFilter: (id: "all" | string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  canOrganize: boolean;
  onNewNoteInFolder: (folderId: string) => void | Promise<void>;
  onCreateSubfolderQuick: (
    parentId: string,
    name: string,
  ) => Promise<boolean>;
  onNoteDroppedOnFolder?: (noteId: string, folderId: string) => void;
  onNoteDroppedUncategorized?: (noteId: string) => void;
  onFolderMoved?: (
    folderId: string,
    newParentId: string | null,
  ) => void | Promise<void>;
  disabled?: boolean;
  labels: Labels;
  emptyTreeFooter?: ReactNode;
};

function displayName(name: string) {
  return noteFolderDisplayName(name) ?? name;
}

function clampPopoverLeft(left: number, popoverWidth: number) {
  const pad = 8;
  const maxLeft = Math.max(pad, window.innerWidth - popoverWidth - pad);
  return Math.min(Math.max(pad, left), maxLeft);
}

function TreeFolderRow({
  node,
  depth,
  expandedIds,
  selectedFilter,
  onToggleExpand,
  onSelectFilter,
  canOrganize,
  onOpenPlusMenu,
  onNoteDroppedOnFolder,
  onFolderMoved,
  disabled,
  labels,
  getNotesInFolder,
  renderCompactNoteRow,
}: {
  node: FolderTreeNode;
  depth: number;
} & Omit<
  Props,
  | "folders"
  | "onNoteDroppedUncategorized"
  | "selectedFilter"
  | "expandedIds"
  | "notes"
  | "emptyTreeFooter"
  | "onNewNoteInFolder"
  | "onCreateSubfolderQuick"
> & {
    selectedFilter: "all" | string;
    expandedIds: Set<string>;
    getNotesInFolder: (folderId: string) => NotesTreeNote[];
    onOpenPlusMenu: (folderId: string, anchor: DOMRect) => void;
  }) {
  const folderNotes = getNotesInFolder(node.id);
  const expanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const hasNotes = folderNotes.length > 0;
  const canExpand = hasChildren || hasNotes;
  const selected = selectedFilter === node.id;
  const pad = 6 + depth * 12;
  const noteIndent = pad + 24;

  return (
    <div role="none">
      <div
        className={`group flex min-w-0 items-center gap-0.5 rounded-lg py-0.5 pr-1 transition-colors ${
          selected
            ? "bg-amber-100/90 dark:bg-amber-950/50"
            : "hover:bg-zinc-100/90 dark:hover:bg-zinc-800/60"
        }`}
        style={{ paddingLeft: pad }}
        draggable={canOrganize && !disabled}
        onDragStart={(e) => {
          if (!canOrganize || disabled) return;
          e.dataTransfer.setData(FOLDER_DRAG, node.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!canOrganize || disabled) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (!canOrganize || disabled) return;
          e.preventDefault();
          const nid = e.dataTransfer.getData(NOTE_DRAG);
          const fid = e.dataTransfer.getData(FOLDER_DRAG);
          if (nid && onNoteDroppedOnFolder) {
            void onNoteDroppedOnFolder(nid, node.id);
          }
          if (fid && fid !== node.id && onFolderMoved) {
            void onFolderMoved(fid, node.id);
          }
        }}
      >
        <button
          type="button"
          className={`flex h-7 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:bg-zinc-700/80 ${
            canExpand ? "" : "pointer-events-none opacity-0"
          }`}
          aria-expanded={expanded}
          aria-label={labels.expandFolder}
          onClick={() => onToggleExpand(node.id)}
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            strokeWidth={2.25}
          />
        </button>
        <button
          type="button"
          onClick={() => onSelectFilter(node.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-left text-sm font-medium text-zinc-800 dark:text-zinc-100"
        >
          {expanded && (hasChildren || hasNotes) ? (
            <FolderOpen
              className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              strokeWidth={2}
            />
          ) : (
            <Folder
              className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400"
              strokeWidth={2}
            />
          )}
          <span className="truncate">{displayName(node.name)}</span>
        </button>
        {canOrganize && !disabled ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPlusMenu(node.id, e.currentTarget.getBoundingClientRect());
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 opacity-0 hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            title={labels.folderPlusMenuAria}
            aria-label={labels.folderPlusMenuAria}
            aria-haspopup="menu"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        )}
      </div>
      {expanded && hasChildren
        ? node.children.map((ch) => (
            <TreeFolderRow
              key={ch.id}
              node={ch}
              depth={depth + 1}
              getNotesInFolder={getNotesInFolder}
              expandedIds={expandedIds}
              selectedFilter={selectedFilter}
              onToggleExpand={onToggleExpand}
              onSelectFilter={onSelectFilter}
              canOrganize={canOrganize}
              onOpenPlusMenu={onOpenPlusMenu}
              onNoteDroppedOnFolder={onNoteDroppedOnFolder}
              onFolderMoved={onFolderMoved}
              disabled={disabled}
              labels={labels}
              renderCompactNoteRow={renderCompactNoteRow}
            />
          ))
        : null}
      {expanded && hasNotes
        ? folderNotes.map((note) => (
            <div key={note.id} className="min-w-0" style={{ paddingLeft: noteIndent }}>
              {renderCompactNoteRow(note, noteIndent)}
            </div>
          ))
        : null}
    </div>
  );
}

function sortNotesForTree(a: NotesTreeNote, b: NotesTreeNote) {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }
  return (
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

type PopoverState =
  | { kind: "menu"; folderId: string; rect: DOMRect }
  | { kind: "subfolder"; folderId: string; rect: DOMRect };

export function NotesFolderTreeNav({
  folders,
  notes,
  renderCompactNoteRow,
  selectedFilter,
  onSelectFilter,
  expandedIds,
  onToggleExpand,
  canOrganize,
  onNewNoteInFolder,
  onCreateSubfolderQuick,
  onNoteDroppedOnFolder,
  onNoteDroppedUncategorized,
  onFolderMoved,
  disabled,
  labels,
  emptyTreeFooter,
}: Props) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const { byFolderId, uncategorized } = useMemo(() => {
    const by = new Map<string, NotesTreeNote[]>();
    const unc: NotesTreeNote[] = [];
    for (const n of notes) {
      if (n.folderId == null || n.folderId === "") {
        unc.push(n);
      } else {
        const arr = by.get(n.folderId);
        if (arr) {
          arr.push(n);
        } else {
          by.set(n.folderId, [n]);
        }
      }
    }
    for (const arr of by.values()) {
      arr.sort(sortNotesForTree);
    }
    unc.sort(sortNotesForTree);
    return { byFolderId: by, uncategorized: unc };
  }, [notes]);

  const getNotesInFolder = useMemo(
    () => (folderId: string) => byFolderId.get(folderId) ?? [],
    [byFolderId],
  );

  const hasUncategorized = uncategorized.length > 0;
  const rootDropActive = Boolean(
    canOrganize &&
      !disabled &&
      (onNoteDroppedUncategorized || onFolderMoved),
  );

  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [quickName, setQuickName] = useState("");
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const closePopover = useCallback(() => {
    setPopover(null);
    setQuickName("");
  }, []);

  const onOpenPlusMenu = useCallback((folderId: string, rect: DOMRect) => {
    setQuickName("");
    setPopover({ kind: "menu", folderId, rect });
  }, []);

  useEffect(() => {
    if (!popover) return;
    const onDocDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      closePopover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopover();
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover, closePopover]);

  const POPOVER_W_MENU = 200;
  const POPOVER_W_FORM = 240;

  const renderFolderPopover = () => {
    if (!popover || typeof document === "undefined") return null;
    const top = popover.rect.bottom + 6;
    const left =
      popover.kind === "menu"
        ? clampPopoverLeft(popover.rect.left, POPOVER_W_MENU)
        : clampPopoverLeft(popover.rect.left, POPOVER_W_FORM);

    if (popover.kind === "menu") {
      return createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[200] w-[min(calc(100vw-1rem),12.5rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ top, left }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              setPopover({
                kind: "subfolder",
                folderId: popover.folderId,
                rect: popover.rect,
              });
              setQuickName("");
            }}
          >
            <FolderPlus
              className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
              strokeWidth={2}
            />
            {labels.folderMenuSubfolder}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              void onNewNoteInFolder(popover.folderId);
              closePopover();
            }}
          >
            <FileText
              className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
              strokeWidth={2}
            />
            {labels.folderMenuNote}
          </button>
        </div>,
        document.body,
      );
    }

    return createPortal(
      <div
        ref={popoverRef}
        className="fixed z-[200] w-[min(calc(100vw-1rem),15rem)] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        style={{ top, left }}
        role="dialog"
        aria-label={labels.quickSubfolderHeading}
      >
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {labels.quickSubfolderHeading}
        </p>
        <input
          type="text"
          value={quickName}
          onChange={(e) => setQuickName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void (async () => {
                const ok = await onCreateSubfolderQuick(
                  popover.folderId,
                  quickName,
                );
                if (ok) closePopover();
              })();
            }
          }}
          placeholder={labels.folderNamePlaceholder}
          className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/25 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500/20"
          autoFocus
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => closePopover()}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            disabled={!quickName.trim()}
            onClick={() =>
              void (async () => {
                const ok = await onCreateSubfolderQuick(
                  popover.folderId,
                  quickName,
                );
                if (ok) closePopover();
              })()
            }
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {labels.add}
          </button>
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <nav
      className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-zinc-200/90 px-1 pt-1 pb-1 dark:border-zinc-800"
      aria-label={labels.navAriaLabel}
    >
      {popover ? renderFolderPopover() : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {hasUncategorized ? (
          <div
            className="mb-0.5 space-y-0.5 pr-0.5"
            onDragOver={(e) => {
              if (!rootDropActive) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (!rootDropActive) return;
              e.preventDefault();
              const nid = e.dataTransfer.getData(NOTE_DRAG);
              const fid = e.dataTransfer.getData(FOLDER_DRAG);
              if (nid && onNoteDroppedUncategorized) {
                void onNoteDroppedUncategorized(nid);
              }
              if (fid && onFolderMoved) {
                void onFolderMoved(fid, null);
              }
            }}
          >
            {uncategorized.map((note) => (
              <div
                key={note.id}
                className="min-w-0"
                style={{ paddingLeft: 6 }}
              >
                {renderCompactNoteRow(note, 6)}
              </div>
            ))}
          </div>
        ) : null}
        {tree.map((n) => (
          <TreeFolderRow
            key={n.id}
            node={n}
            depth={0}
            getNotesInFolder={getNotesInFolder}
            expandedIds={expandedIds}
            selectedFilter={selectedFilter}
            onToggleExpand={onToggleExpand}
            onSelectFilter={onSelectFilter}
            canOrganize={canOrganize}
            onOpenPlusMenu={onOpenPlusMenu}
            onNoteDroppedOnFolder={onNoteDroppedOnFolder}
            onFolderMoved={onFolderMoved}
            disabled={disabled}
            labels={labels}
            renderCompactNoteRow={renderCompactNoteRow}
          />
        ))}
        {emptyTreeFooter}
      </div>
    </nav>
  );
}

export { NOTE_DRAG };
