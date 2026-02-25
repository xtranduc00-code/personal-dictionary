"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, } from "@gd/components/ui/dialog";
import { Button } from "@gd/components/ui/button";
import { moveDriveFileAction, deleteDriveFileAction, getDriveFoldersAction, getDriveStarredAction, starDriveFileAction, } from "@gd/lib/actions/drive.actions";
import { toast } from "react-toastify";
import Card from "@gd/components/Card";
import FolderCard from "@gd/components/FolderCard";
import StarredSortSelect from "@gd/components/StarredSortSelect";
import { cn } from "@gd/lib/utils";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
import type { DriveFolder } from "@gd/lib/google-drive";
type Props = {
    initialFolders: DriveFolder[];
    initialFiles: DriveFileDisplay[];
    initialNextPageToken?: string;
    sort: string;
};
type SelectedItem = {
    id: string;
    name: string;
    type: "file" | "folder";
};
function SelectionCheckbox({ checked, onToggle, selectionActive, }: {
    checked: boolean;
    onToggle: () => void;
    selectionActive: boolean;
}) {
    return (<input type="checkbox" checked={checked} onChange={(e) => {
            e.stopPropagation();
            onToggle();
        }} onClick={(e) => e.stopPropagation()} className={cn("absolute left-3 top-3 z-[25] size-5 cursor-pointer rounded border-zinc-300 bg-white shadow-sm transition-opacity dark:border-zinc-600 dark:bg-zinc-900", selectionActive || checked
            ? "opacity-100"
            : "max-md:opacity-100 md:opacity-[0.28] md:group-hover:opacity-100")} aria-label={checked ? "Deselect" : "Select"}/>);
}
export default function StarredFileList({ initialFolders, initialFiles, initialNextPageToken, sort, }: Props) {
    const router = useRouter();
    const [folders, setFolders] = useState<DriveFolder[]>(initialFolders);
    const [files, setFiles] = useState<DriveFileDisplay[]>(initialFiles);
    const [nextPageToken, setNextPageToken] = useState<string | undefined>(initialNextPageToken);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    useEffect(() => {
        try {
            const saved = localStorage.getItem("file-view-mode");
            if (saved === "list" || saved === "grid")
                setViewMode(saved);
        }
        catch {
        }
    }, []);
    useEffect(() => {
        setFolders(initialFolders);
        setFiles(initialFiles);
        setNextPageToken(initialNextPageToken ?? undefined);
    }, [initialFolders, initialFiles, initialNextPageToken]);
    const setViewModeAndSave = (mode: "grid" | "list") => {
        setViewMode(mode);
        try {
            localStorage.setItem("file-view-mode", mode);
        }
        catch {
        }
    };
    const loadMore = async () => {
        if (!nextPageToken || loadingMore)
            return;
        setLoadingMore(true);
        const res = await getDriveStarredAction({ sort, limit: 24, pageToken: nextPageToken });
        const data = res as {
            folders?: DriveFolder[];
            files?: DriveFileDisplay[];
            nextPageToken?: string;
        };
        setFolders((prev) => [...prev, ...(data.folders ?? [])]);
        setFiles((prev) => [...prev, ...(data.files ?? [])]);
        setNextPageToken(data.nextPageToken);
        setLoadingMore(false);
    };
    const [moveOpen, setMoveOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [moveTargetId, setMoveTargetId] = useState<string>("root");
    const [foldersForMove, setFoldersForMove] = useState<DriveFolder[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingFolders, setLoadingFolders] = useState(false);
    const selectedList: SelectedItem[] = [];
    selected.forEach((id) => {
        const f = files.find((x) => x.$id === id);
        if (f)
            selectedList.push({ id: f.$id, name: f.name, type: "file" });
        else {
            const folder = folders.find((x) => x.id === id);
            if (folder)
                selectedList.push({ id: folder.id, name: folder.name, type: "folder" });
        }
    });
    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    };
    const clearSelection = () => setSelected(new Set());
    const selectionActive = selected.size > 0;
    const allIds = [...folders.map((f) => f.id), ...files.map((f) => f.$id)];
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
    const selectAll = () => setSelected(new Set(allIds));
    const toggleSelectAll = () => (allSelected ? clearSelection() : selectAll());
    const openMove = () => {
        setMoveOpen(true);
        setLoadingFolders(true);
        getDriveFoldersAction().then((list) => {
            setFoldersForMove(list || []);
            setMoveTargetId(list?.[0]?.id ?? "root");
            setLoadingFolders(false);
        });
    };
    const handleBulkMove = async () => {
        if (!moveTargetId) {
            setMoveOpen(false);
            return;
        }
        setLoading(true);
        let ok = 0;
        let fail = 0;
        for (const item of selectedList) {
            const parentId = item.type === "file"
                ? files.find((f) => f.$id === item.id)?.parents?.[0] ?? "root"
                : folders.find((f) => f.id === item.id)?.parents?.[0] ?? "root";
            if (parentId === moveTargetId)
                continue;
            const res = await moveDriveFileAction(item.id, moveTargetId, parentId);
            if (res.ok)
                ok++;
            else
                fail++;
        }
        setLoading(false);
        setMoveOpen(false);
        clearSelection();
        if (ok)
            toast.success(`Moved ${ok} item(s)`);
        if (fail)
            toast.error(`Failed to move ${fail} item(s)`);
        if (ok || fail)
            router.refresh();
    };
    const handleBulkDelete = async () => {
        setLoading(true);
        let ok = 0;
        let fail = 0;
        for (const item of selectedList) {
            const res = await deleteDriveFileAction(item.id);
            if (res.ok)
                ok++;
            else
                fail++;
        }
        setLoading(false);
        setDeleteOpen(false);
        clearSelection();
        if (ok)
            toast.success(`Deleted ${ok} item(s)`);
        if (fail)
            toast.error(`Failed to delete ${fail} item(s)`);
        if (ok || fail)
            router.refresh();
    };
    const handleBulkUnstar = async () => {
        setLoading(true);
        let ok = 0;
        let fail = 0;
        for (const item of selectedList) {
            const res = await starDriveFileAction(item.id, false);
            if (res.ok)
                ok++;
            else
                fail++;
        }
        setLoading(false);
        clearSelection();
        if (ok)
            toast.success(`Removed star from ${ok} item(s)`);
        if (fail)
            toast.error(`Failed to unstar ${fail} item(s)`);
        if (ok || fail)
            router.refresh();
    };
    const itemSelectedClass = (id: string) => cn("rounded-2xl transition-[background-color,border-color,box-shadow] duration-150", selected.has(id) &&
        "bg-black/[0.04] ring-1 ring-black/10 dark:bg-white/[0.06] dark:ring-white/15");
    const starredRowClass = (id: string) => cn("group relative rounded-2xl p-0.5 transition-[background-color] duration-200", !selected.has(id) &&
        "md:group-hover:bg-zinc-100/70 dark:md:group-hover:bg-white/[0.045]");
    return (<>
      {selectionActive && (<div className="sticky top-0 z-10 mb-5 rounded-xl border border-zinc-200/90 bg-zinc-50 px-5 py-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/85">
          <p className="text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            {selected.size === 1 ? "1 item selected" : `${selected.size} items selected`}
          </p>
          <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200/80 pt-4 dark:border-zinc-600/80 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={toggleSelectAll}>
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button type="button" size="sm" onClick={openMove} disabled={loading}>
                Move
              </Button>
              <Button type="button" size="sm" variant="outline" className="border-amber-200/80 bg-amber-50/90 text-amber-900 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-200 dark:hover:bg-amber-950/55" onClick={handleBulkUnstar} disabled={loading}>
                Unstar
              </Button>
              <Button type="button" size="sm" variant="outline" className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60" onClick={() => setDeleteOpen(true)} disabled={loading}>
                Delete
              </Button>
            </div>
          </div>
        </div>)}

      {folders.length > 0 && (<section>
          <h2 className="h3 mb-3 text-light-100">Folders</h2>
          <div className="file-list">
            {folders.map((folder) => (<div key={folder.id} className={starredRowClass(folder.id)}>
                <SelectionCheckbox checked={selected.has(folder.id)} onToggle={() => toggle(folder.id)} selectionActive={selectionActive}/>
                <div className={itemSelectedClass(folder.id)}>
                  <FolderCard folder={folder} selectionMode={selectionActive} onToggleSelection={() => toggle(folder.id)}/>
                </div>
              </div>))}
          </div>
        </section>)}

      {files.length > 0 && (<section>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="h3 text-light-100">Files</h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-light-300 p-0.5">
                <button type="button" onClick={() => setViewModeAndSave("grid")} className={`body-2 rounded-md px-3 py-1.5 transition-colors ${viewMode === "grid" ? "bg-brand text-white" : "text-light-200 hover:bg-light-400/50"}`} title="Grid view">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
                <button type="button" onClick={() => setViewModeAndSave("list")} className={`body-2 rounded-md px-3 py-1.5 transition-colors ${viewMode === "list" ? "bg-brand text-white" : "text-light-200 hover:bg-light-400/50"}`} title="List view">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/>
                    <line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </button>
              </div>
              <StarredSortSelect />
            </div>
          </div>
          <div className={viewMode === "list" ? "file-list file-list--list mt-3" : "file-list mt-3"}>
            {files.map((file) => (<div key={file.$id} className={starredRowClass(file.$id)}>
                <SelectionCheckbox checked={selected.has(file.$id)} onToggle={() => toggle(file.$id)} selectionActive={selectionActive}/>
                <div className={itemSelectedClass(file.$id)}>
                  <Card file={file} layout={viewMode} selectionMode={selectionActive} onToggleSelection={() => toggle(file.$id)}/>
                </div>
              </div>))}
          </div>
          {nextPageToken && (<div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>)}
        </section>)}

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="shad-dialog button">
          <DialogHeader>
            <DialogTitle>Move {selected.size} item(s) to</DialogTitle>
          </DialogHeader>
          {loadingFolders ? (<p className="body-2 text-light-200">Loading folders…</p>) : (<select className="body-2 w-full rounded-lg border border-light-300 px-3 py-2" value={moveTargetId} onChange={(e) => setMoveTargetId(e.target.value)}>
              <option value="root">My Drive (root)</option>
              {foldersForMove
                .filter((f) => f.id !== "root")
                .map((f) => (<option key={f.id} value={f.id}>
                    {f.name}
                  </option>))}
            </select>)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkMove} disabled={loading}>
              {loading ? "..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="shad-dialog button">
          <DialogHeader>
            <DialogTitle>Delete {selected.size} item(s)?</DialogTitle>
            <p className="body-2 text-light-200">They will be moved to trash.</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-red hover:bg-red/90" onClick={handleBulkDelete} disabled={loading}>
              {loading ? "..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}
