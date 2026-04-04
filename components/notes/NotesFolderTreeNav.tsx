"use client";

import { ChevronRight, Folder, FolderOpen, Plus } from "lucide-react";
import { useMemo } from "react";
import {
  buildFolderTree,
  type FolderTreeNode,
  type NoteFolderRow,
} from "@/lib/note-folder-tree";
import { noteFolderDisplayName } from "@/lib/note-folder-display-name";

const NOTE_DRAG = "application/x-ken-note-id";
const FOLDER_DRAG = "application/x-ken-folder-id";

type Labels = {
  allNotes: string;
  newSubfolder: string;
  expandFolder: string;
};

type Props = {
  folders: NoteFolderRow[];
  selectedFilter: "all" | string;
  onSelectFilter: (id: "all" | string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  canOrganize: boolean;
  onRequestSubfolder: (parentId: string) => void;
  onNoteDroppedOnFolder?: (noteId: string, folderId: string) => void;
  onNoteDroppedUncategorized?: (noteId: string) => void;
  onFolderMoved?: (
    folderId: string,
    newParentId: string | null,
  ) => void | Promise<void>;
  disabled?: boolean;
  labels: Labels;
};

function displayName(name: string) {
  return noteFolderDisplayName(name) ?? name;
}

function TreeFolderRow({
  node,
  depth,
  expandedIds,
  selectedFilter,
  onToggleExpand,
  onSelectFilter,
  canOrganize,
  onRequestSubfolder,
  onNoteDroppedOnFolder,
  onFolderMoved,
  disabled,
  labels,
}: {
  node: FolderTreeNode;
  depth: number;
} & Omit<
  Props,
  "folders" | "onNoteDroppedUncategorized" | "selectedFilter" | "expandedIds"
> & {
  selectedFilter: "all" | string;
  expandedIds: Set<string>;
}) {
  const expanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const selected = selectedFilter === node.id;
  const pad = 6 + depth * 12;

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
            hasChildren ? "" : "pointer-events-none opacity-0"
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
          {expanded && hasChildren ? (
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
              onRequestSubfolder(node.id);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 opacity-0 hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            title={labels.newSubfolder}
            aria-label={labels.newSubfolder}
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
              expandedIds={expandedIds}
              selectedFilter={selectedFilter}
              onToggleExpand={onToggleExpand}
              onSelectFilter={onSelectFilter}
              canOrganize={canOrganize}
              onRequestSubfolder={onRequestSubfolder}
              onNoteDroppedOnFolder={onNoteDroppedOnFolder}
              onFolderMoved={onFolderMoved}
              disabled={disabled}
              labels={labels}
            />
          ))
        : null}
    </div>
  );
}

export function NotesFolderTreeNav({
  folders,
  selectedFilter,
  onSelectFilter,
  expandedIds,
  onToggleExpand,
  canOrganize,
  onRequestSubfolder,
  onNoteDroppedOnFolder,
  onNoteDroppedUncategorized,
  onFolderMoved,
  disabled,
  labels,
}: Props) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  return (
    <nav
      className="border-b border-zinc-200/90 px-1 py-2 dark:border-zinc-800"
      aria-label={labels.allNotes}
    >
      <div
        className={`mb-1 flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 ${
          selectedFilter === "all"
            ? "bg-amber-100/90 dark:bg-amber-950/50"
            : "hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50"
        }`}
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
          if (nid && onNoteDroppedUncategorized) {
            void onNoteDroppedUncategorized(nid);
          }
          if (fid && onFolderMoved) {
            void onFolderMoved(fid, null);
          }
        }}
      >
        <span className="w-6 shrink-0" aria-hidden />
        <button
          type="button"
          onClick={() => onSelectFilter("all")}
          className="min-w-0 flex-1 rounded-md py-1.5 text-left text-sm font-semibold text-zinc-800 dark:text-zinc-100"
        >
          {labels.allNotes}
        </button>
      </div>
      <div className="max-h-[min(40vh,14rem)] overflow-y-auto pr-0.5">
        {tree.map((n) => (
          <TreeFolderRow
            key={n.id}
            node={n}
            depth={0}
            expandedIds={expandedIds}
            selectedFilter={selectedFilter}
            onToggleExpand={onToggleExpand}
            onSelectFilter={onSelectFilter}
            canOrganize={canOrganize}
            onRequestSubfolder={onRequestSubfolder}
            onNoteDroppedOnFolder={onNoteDroppedOnFolder}
            onFolderMoved={onFolderMoved}
            disabled={disabled}
            labels={labels}
          />
        ))}
      </div>
    </nav>
  );
}

export { NOTE_DRAG };
