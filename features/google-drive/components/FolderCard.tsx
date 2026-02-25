"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, } from "@gd/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from "@gd/components/ui/dropdown-menu";
import { Button } from "@gd/components/ui/button";
import { Input } from "@gd/components/ui/input";
import { deleteDriveFileAction, renameDriveFileAction, shareDriveFileAction, shareWithAnyoneAction, starDriveFileAction, } from "@gd/lib/actions/drive.actions";
import type { DriveFolder } from "@gd/lib/google-drive";
import { FOLDER_ICON_OPTIONS } from "@gd/constants";
import { toast } from "react-toastify";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gd/components/ui/tooltip";
import { cn } from "@gd/lib/utils";
const FOLDER_ICON = "/gdrive/assets/icons/documents.svg";
const STORAGE_KEY = (id: string) => `folder-icon-${id}`;
const DRIVE_FOLDER_URL = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const APP_FOLDER_URL = (id: string) => `/drive/folder/${id}`;
const actions = [
    { label: "Rename", icon: "/gdrive/assets/icons/edit.svg", value: "rename" },
    { label: "Share", icon: "/gdrive/assets/icons/share.svg", value: "share" },
    { label: "Delete", icon: "/gdrive/assets/icons/delete.svg", value: "delete" },
    { label: "Open in Drive", icon: "/gdrive/assets/icons/share.svg", value: "open" },
];
export default function FolderCard({ folder, selectionMode, onToggleSelection, }: {
    folder: DriveFolder;
    selectionMode?: boolean;
    onToggleSelection?: () => void;
}) {
    const router = useRouter();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [starred, setStarred] = useState(!!folder.starred);
    const [action, setAction] = useState<ActionType | null>(null);
    const [name, setName] = useState(folder.name);
    const [shareEmail, setShareEmail] = useState("");
    const [shareRole, setShareRole] = useState<"reader" | "writer">("reader");
    const [generalAccess, setGeneralAccess] = useState<"restricted" | "anyone">("restricted");
    const [anyoneRole, setAnyoneRole] = useState<"reader" | "writer">("reader");
    const [linkCopied, setLinkCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [selectedIcon, setSelectedIcon] = useState<string>(FOLDER_ICON);
    const [folderMenuOpen, setFolderMenuOpen] = useState(false);
    useEffect(() => {
        setName(folder.name);
    }, [folder.name]);
    useEffect(() => {
        const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY(folder.id)) : null;
        if (saved && FOLDER_ICON_OPTIONS.some((o) => o.path === saved))
            setSelectedIcon(saved);
    }, [folder.id]);
    const closeAll = () => {
        setIsModalOpen(false);
        setAction(null);
    };
    const handleRename = async () => {
        if (!name.trim())
            return;
        setLoading(true);
        const res = await renameDriveFileAction(folder.id, name.trim());
        setLoading(false);
        if (res.ok) {
            toast.success(`Renamed — Folder is now "${name.trim()}"`);
            closeAll();
        }
        else {
            toast.error(`Rename failed — ${res.error ?? "Something went wrong"}`);
        }
    };
    const handleDelete = async () => {
        setLoading(true);
        const res = await deleteDriveFileAction(folder.id);
        setLoading(false);
        if (res.ok) {
            toast.success(`Deleted — "${folder.name}" moved to trash`);
            closeAll();
            router.refresh();
        }
        else {
            toast.error(`Delete failed — ${res.error ?? "Something went wrong"}`);
        }
    };
    const handleStar = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !starred;
        setStarred(next);
        const res = await starDriveFileAction(folder.id, next);
        if (res.ok) {
            toast.success(next ? "Starred" : "Unstarred");
            router.refresh();
        }
        else {
            setStarred(!!folder.starred);
            toast.error(res.error ?? "Failed");
        }
    };
    const handleShareByEmail = async () => {
        if (!shareEmail.trim())
            return;
        setLoading(true);
        const res = await shareDriveFileAction(folder.id, shareEmail.trim(), shareRole);
        setLoading(false);
        if (res.ok) {
            toast.success(`Shared — Invitation sent to ${shareEmail.trim()}`);
            setShareEmail("");
        }
        else {
            toast.error(`Share failed — ${res.error ?? "Something went wrong"}`);
        }
    };
    const handleGeneralAccessChange = async (value: "restricted" | "anyone") => {
        setGeneralAccess(value);
        if (value === "anyone") {
            setLoading(true);
            await shareWithAnyoneAction(folder.id, anyoneRole);
            setLoading(false);
        }
    };
    const folderLink = DRIVE_FOLDER_URL(folder.id);
    const handleCopyLink = async () => {
        if (generalAccess === "restricted") {
            setLoading(true);
            const res = await shareWithAnyoneAction(folder.id, anyoneRole);
            setLoading(false);
            if (!res.ok)
                return;
            setGeneralAccess("anyone");
        }
        await navigator.clipboard.writeText(folderLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };
    return (<>
      <div className={cn("group file-card relative", selectionMode && "cursor-pointer select-none")} onClick={selectionMode
            ? (e) => {
                const t = e.target as HTMLElement;
                if (t.closest("button"))
                    return;
                onToggleSelection?.();
            }
            : undefined}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={handleStar} className="absolute right-12 top-3 z-10 flex size-8 items-center justify-center rounded-lg text-light-300 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={starred ? "Remove star" : "Star"}>
              {starred ? (<svg className="h-5 w-5 fill-brand text-brand" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                </svg>) : (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                </svg>)}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{starred ? "Remove star" : "Star"}</TooltipContent>
        </Tooltip>
        <div className="flex items-start justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              {selectionMode ? (<div className="flex min-w-0 flex-1 items-center gap-3">
                  <button type="button" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIconPickerOpen(true);
            }} className="folder-card-icon flex-center size-[50px] min-w-[50px] cursor-pointer overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700" title="Change icon">
                    <Image src={selectedIcon} alt="Folder" width={28} height={28}/>
                  </button>
                  <p className="subtitle-2 line-clamp-1 text-light-100">{folder.name}</p>
                </div>) : (<Link href={APP_FOLDER_URL(folder.id)} className="flex min-w-0 flex-1 items-center gap-3">
                  <button type="button" onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIconPickerOpen(true);
            }} className="folder-card-icon flex-center size-[50px] min-w-[50px] cursor-pointer overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700" title="Change icon">
                    <Image src={selectedIcon} alt="Folder" width={28} height={28}/>
                  </button>
                  <p className="subtitle-2 line-clamp-1 text-light-100">{folder.name}</p>
                </Link>)}
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] break-words font-medium">
              {folder.name}
            </TooltipContent>
          </Tooltip>
          <DropdownMenu open={folderMenuOpen} onOpenChange={setFolderMenuOpen}>
            <div className={cn("shrink-0 transition-opacity duration-200", folderMenuOpen
            ? "opacity-100"
            : "opacity-100 max-md:opacity-100 md:opacity-[0.32] md:group-hover:opacity-100")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger className="shad-no-focus flex rounded-lg p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="More actions">
                    <Image src="/gdrive/assets/icons/dots.svg" alt="" width={34} height={34}/>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">More actions</TooltipContent>
              </Tooltip>
            </div>
            <DropdownMenuContent>
              <DropdownMenuLabel className="max-w-[200px] truncate">
                {folder.name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {actions.map((item) => (<DropdownMenuItem key={item.value} className="shad-dropdown-item" onClick={() => {
                setAction(item);
                if (item.value === "open") {
                    window.open(DRIVE_FOLDER_URL(folder.id), "_blank");
                    return;
                }
                setIsModalOpen(true);
            }}>
                  <div className="flex items-center gap-2">
                    <Image src={item.icon} alt={item.label} width={30} height={30}/>
                    {item.label}
                  </div>
                </DropdownMenuItem>))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {action?.value === "rename" && (<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="shad-dialog button">
            <DialogHeader>
              <DialogTitle className="text-center text-light-100">Rename folder</DialogTitle>
              <Input type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-2" placeholder="Folder name"/>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={closeAll} variant="outline">Cancel</Button>
              <Button onClick={handleRename} disabled={loading || !name.trim()}>
                {loading ? "..." : "Rename"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>)}

      {action?.value === "share" && (<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="shad-dialog button max-w-md">
            <DialogHeader>
              <DialogTitle className="text-light-100">Share &quot;{folder.name}&quot;</DialogTitle>
              <div className="space-y-4 pt-2">
                <div>
                  <p className="body-2 font-medium text-light-100 mb-1">General access</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select className="rounded-lg border border-light-300 px-3 py-2 body-2 flex-1 min-w-[180px]" value={generalAccess} onChange={(e) => handleGeneralAccessChange(e.target.value as "restricted" | "anyone")} disabled={loading}>
                      <option value="restricted">Restricted</option>
                      <option value="anyone">Anyone with the link</option>
                    </select>
                    {generalAccess === "anyone" && (<select className="rounded-lg border border-light-300 px-3 py-2 body-2" value={anyoneRole} onChange={(e) => setAnyoneRole(e.target.value as "reader" | "writer")} disabled={loading}>
                        <option value="reader">Viewer</option>
                        <option value="writer">Editor</option>
                      </select>)}
                  </div>
                  {generalAccess === "anyone" && (<p className="body-2 text-light-200 mt-1">
                      Anyone on the internet with the link can {anyoneRole === "reader" ? "view" : "edit"}.
                    </p>)}
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={handleCopyLink} disabled={loading}>
                    {linkCopied ? "Link copied!" : "Copy link"}
                  </Button>
                </div>
                <div className="border-t border-light-300 pt-4">
                  <p className="body-2 font-medium text-light-100 mb-1">Add people and groups</p>
                  <div className="flex gap-2 flex-wrap">
                    <Input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="Add people by email" className="flex-1 min-w-[160px]"/>
                    <select className="rounded-lg border border-light-300 px-3 py-2 body-2 w-[100px]" value={shareRole} onChange={(e) => setShareRole(e.target.value as "reader" | "writer")}>
                      <option value="reader">Viewer</option>
                      <option value="writer">Editor</option>
                    </select>
                    <Button type="button" size="sm" onClick={handleShareByEmail} disabled={loading || !shareEmail.trim()}>
                      {loading ? "..." : "Send"}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={closeAll}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>)}

      {action?.value === "delete" && (<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="shad-dialog button">
            <DialogHeader>
              <DialogTitle className="text-center text-light-100">Delete folder</DialogTitle>
              <p className="body-2 text-light-200 text-center mt-2">
                Delete &quot;{folder.name}&quot;? The folder will be moved to Drive trash. Files inside remain in Drive.
              </p>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={closeAll} variant="outline">Cancel</Button>
              <Button onClick={handleDelete} disabled={loading} className="bg-red hover:bg-red/90">
                {loading ? "..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>)}

      <Dialog open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
        <DialogContent className="shad-dialog button max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-light-100">Choose icon</DialogTitle>
            <p className="body-2 text-light-200 text-center">Click an icon to use for this folder</p>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            {FOLDER_ICON_OPTIONS.map((opt) => (<button key={opt.id} type="button" onClick={() => {
                localStorage.setItem(STORAGE_KEY(folder.id), opt.path);
                setSelectedIcon(opt.path);
                setIconPickerOpen(false);
            }} className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 transition-all hover:bg-light-400 ${selectedIcon === opt.path ? "border-brand bg-brand/10" : "border-light-300"}`} title={opt.label}>
                <div className="folder-card-icon flex-center size-10">
                  <Image src={opt.path} alt={opt.label} width={24} height={24}/>
                </div>
                <span className="caption text-light-200">{opt.label}</span>
              </button>))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIconPickerOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}
