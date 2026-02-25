"use client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, } from "@gd/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from "@gd/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@gd/components/ui/button";
import { Input } from "@gd/components/ui/input";
import { FileDetails } from "@gd/components/ActionsModalContent";
import { deleteDriveFileAction, renameDriveFileAction, moveDriveFileAction, getDriveFoldersAction, shareDriveFileAction, shareWithAnyoneAction, } from "@gd/lib/actions/drive.actions";
import type { DriveFileDisplay, DriveFolder } from "@gd/lib/google-drive";
import { isPreviewableInApp } from "@gd/lib/utils";
import { toast } from "react-toastify";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gd/components/ui/tooltip";
import { cn } from "@gd/lib/utils";
const driveActions = [
    { label: "Details", icon: "/gdrive/assets/icons/info.svg", value: "details" },
    { label: "Rename", icon: "/gdrive/assets/icons/edit.svg", value: "rename" },
    { label: "Move to folder", icon: "/gdrive/assets/icons/documents.svg", value: "move" },
    { label: "Share", icon: "/gdrive/assets/icons/share.svg", value: "share" },
    { label: "Download", icon: "/gdrive/assets/icons/download.svg", value: "download" },
    { label: "Delete", icon: "/gdrive/assets/icons/delete.svg", value: "delete" },
    { label: "Open", icon: "/gdrive/assets/icons/share.svg", value: "open" },
];
const ActionDropdown = ({ file, showMenuOnHover = true, }: {
    file: DriveFileDisplay;
    showMenuOnHover?: boolean;
}) => {
    const router = useRouter();
    const pathname = usePathname();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [action, setAction] = useState<ActionType | null>(null);
    const [name, setName] = useState(file.name);
    const [moveFolderId, setMoveFolderId] = useState<string>("");
    const [folders, setFolders] = useState<DriveFolder[]>([]);
    const [shareEmail, setShareEmail] = useState("");
    const [shareRole, setShareRole] = useState<"reader" | "writer">("reader");
    const [generalAccess, setGeneralAccess] = useState<"restricted" | "anyone">("restricted");
    const [anyoneRole, setAnyoneRole] = useState<"reader" | "writer">("reader");
    const [linkCopied, setLinkCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        setName(file.name);
    }, [file.name]);
    const loadFolders = async () => {
        const list = await getDriveFoldersAction();
        setFolders(list || []);
        if (list?.length && !moveFolderId)
            setMoveFolderId(list[0].id);
    };
    const closeAllModals = () => {
        setIsModalOpen(false);
        setIsDropdownOpen(false);
        setAction(null);
    };
    const downloadUrl = file.webContentLink || file.url;
    const currentParent = file.parents?.[0] ?? "root";
    const openInApp = isPreviewableInApp(file.mimeType);
    const openUrl = openInApp
        ? `/drive/file/${file.$id}?mime=${encodeURIComponent(file.mimeType || "")}&name=${encodeURIComponent(file.name)}&from=${encodeURIComponent(pathname || "/drive/folders")}`
        : file.url;
    const handleRename = async () => {
        if (!name.trim())
            return;
        setLoading(true);
        const res = await renameDriveFileAction(file.$id, name.trim());
        setLoading(false);
        if (res.ok) {
            toast.success(`Renamed — File is now "${name.trim()}"`);
            closeAllModals();
        }
        else {
            toast.error(`Rename failed — ${res.error ?? "Something went wrong"}`);
        }
    };
    const handleDelete = async () => {
        setLoading(true);
        const res = await deleteDriveFileAction(file.$id);
        setLoading(false);
        if (res.ok) {
            toast.success(`Deleted — "${file.name}" moved to trash`);
            closeAllModals();
            router.refresh();
        }
        else {
            toast.error(`Delete failed — ${res.error ?? "Something went wrong"}`);
        }
    };
    const handleMove = async () => {
        if (!moveFolderId || moveFolderId === currentParent) {
            closeAllModals();
            return;
        }
        setLoading(true);
        const res = await moveDriveFileAction(file.$id, moveFolderId, currentParent);
        setLoading(false);
        if (res.ok) {
            toast.success(`Moved — "${file.name}" moved to selected folder`);
            closeAllModals();
            router.refresh();
        }
        else {
            toast.error(`Move failed — ${res.error ?? "Something went wrong"}`);
        }
    };
    const handleShareByEmail = async () => {
        if (!shareEmail.trim())
            return;
        setLoading(true);
        const res = await shareDriveFileAction(file.$id, shareEmail.trim(), shareRole);
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
            await shareWithAnyoneAction(file.$id, anyoneRole);
            setLoading(false);
        }
    };
    const handleCopyLink = async () => {
        if (generalAccess === "restricted") {
            setLoading(true);
            const res = await shareWithAnyoneAction(file.$id, anyoneRole);
            setLoading(false);
            if (!res.ok)
                return;
            setGeneralAccess("anyone");
        }
        await navigator.clipboard.writeText(file.url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };
    return (<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <div className={cn("shrink-0 transition-opacity duration-200", !showMenuOnHover || isDropdownOpen
            ? "opacity-100"
            : "max-md:opacity-100 md:opacity-[0.32] md:group-hover:opacity-100")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger className="shad-no-focus flex rounded-lg p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="More actions" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <Image src="/gdrive/assets/icons/dots.svg" alt="" width={34} height={34}/>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">More actions</TooltipContent>
          </Tooltip>
        </div>
        <DropdownMenuContent>
          <DropdownMenuLabel className="max-w-[200px] truncate">
            {file.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {driveActions.map((actionItem) => (<DropdownMenuItem key={actionItem.value} className="shad-dropdown-item" onSelect={(e) => {
                const v = actionItem.value;
                if (v === "download") {
                    e.preventDefault();
                    const url = downloadUrl || file.url;
                    if (url)
                        window.open(url, "_blank", "noopener,noreferrer");
                    setIsDropdownOpen(false);
                    return;
                }
                if (v === "open") {
                    e.preventDefault();
                    if (openInApp)
                        router.push(openUrl);
                    else
                        window.open(file.url, "_blank", "noopener,noreferrer");
                    setIsDropdownOpen(false);
                    return;
                }
                setAction(actionItem);
                if (v === "details" || v === "rename" || v === "delete")
                    setIsModalOpen(true);
                if (v === "move") {
                    loadFolders();
                    setMoveFolderId("root");
                    setIsModalOpen(true);
                }
                if (v === "share")
                    setIsModalOpen(true);
            }}>
              <div className="flex items-center gap-2">
                <Image src={actionItem.icon} alt="" width={30} height={30}/>
                {actionItem.label}
              </div>
            </DropdownMenuItem>))}
        </DropdownMenuContent>
      </DropdownMenu>

      {action?.value === "details" && (<DialogContent className="shad-dialog button">
          <DialogHeader>
            <DialogTitle className="text-center text-light-100">{action.label}</DialogTitle>
            <FileDetails file={file}/>
          </DialogHeader>
        </DialogContent>)}

      {action?.value === "rename" && (<DialogContent className="shad-dialog button">
          <DialogHeader>
            <DialogTitle className="text-center text-light-100">Rename</DialogTitle>
            <Input type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-2" placeholder="File name"/>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={closeAllModals} variant="outline">Cancel</Button>
            <Button onClick={handleRename} disabled={loading || !name.trim()}>
              {loading ? "..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>)}

      {action?.value === "move" && (<DialogContent className="shad-dialog button">
          <DialogHeader>
            <DialogTitle className="text-center text-light-100">Move to folder</DialogTitle>
            <p className="body-2 text-light-200">Choose destination folder:</p>
            <select className="mt-2 w-full rounded-lg border border-light-300 px-3 py-2" value={moveFolderId} onChange={(e) => setMoveFolderId(e.target.value)}>
              {folders.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
            </select>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={closeAllModals} variant="outline">Cancel</Button>
            <Button onClick={handleMove} disabled={loading || moveFolderId === currentParent}>
              {loading ? "..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>)}

      {action?.value === "share" && (<DialogContent className="shad-dialog button max-w-md">
          <DialogHeader>
            <DialogTitle className="text-light-100">Share &quot;{file.name}&quot;</DialogTitle>

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
            <Button onClick={closeAllModals}>Done</Button>
          </DialogFooter>
        </DialogContent>)}

      {action?.value === "delete" && (<DialogContent className="shad-dialog button">
          <DialogHeader>
            <DialogTitle className="text-center text-light-100">Delete file</DialogTitle>
            <p className="body-2 text-light-200 text-center mt-2">
              Delete &quot;{file.name}&quot;? The file will be moved to Drive trash.
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={closeAllModals} variant="outline">Cancel</Button>
            <Button onClick={handleDelete} disabled={loading} className="bg-red hover:bg-red/90">
              {loading ? "..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>)}
    </Dialog>);
};
export default ActionDropdown;
