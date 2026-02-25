"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, } from "@gd/components/ui/dialog";
import { Button } from "@gd/components/ui/button";
import { Input } from "@gd/components/ui/input";
import { isGoogleEditableType, getFileEditUrl } from "@gd/lib/utils";
import { shareDriveFileAction, shareWithAnyoneAction, getFilePermissionsAction, } from "@gd/lib/actions/drive.actions";
import { toast } from "react-toastify";
import { driveMimeKindLabel, formatDriveModifiedShort } from "@gd/lib/viewer-meta";
type Props = {
    fileId: string;
    mimeType?: string;
    name?: string;
    modifiedTime?: string;
    editMode: boolean;
    backTo: string;
    fromParam?: string;
};
const driveFileUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`;
export function FileViewerBar({ fileId, mimeType, name, modifiedTime, editMode, backTo, fromParam, }: Props) {
    const [shareOpen, setShareOpen] = useState(false);
    const [shareEmail, setShareEmail] = useState("");
    const [shareRole, setShareRole] = useState<"reader" | "writer">("reader");
    const [generalAccess, setGeneralAccess] = useState<"restricted" | "anyone">("restricted");
    const [anyoneRole, setAnyoneRole] = useState<"reader" | "writer">("reader");
    const [linkCopied, setLinkCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [permissionsLoading, setPermissionsLoading] = useState(false);
    const canEdit = isGoogleEditableType(mimeType);
    useEffect(() => {
        if (!shareOpen || !fileId)
            return;
        setPermissionsLoading(true);
        getFilePermissionsAction(fileId).then((data) => {
            setPermissionsLoading(false);
            if (data) {
                setGeneralAccess(data.generalAccess);
                setAnyoneRole(data.anyoneRole);
            }
        });
    }, [shareOpen, fileId]);
    const displayName = name || "File";
    const kind = driveMimeKindLabel(mimeType);
    const edited = formatDriveModifiedShort(modifiedTime);
    const subtitle = [kind, edited].filter(Boolean).join(" • ");
    const q = new URLSearchParams();
    if (mimeType)
        q.set("mime", mimeType);
    q.set("name", encodeURIComponent(displayName));
    if (fromParam)
        q.set("from", fromParam);
    const viewUrl = `/drive/file/${fileId}?${q.toString()}`;
    const qEdit = new URLSearchParams(q);
    qEdit.set("edit", "1");
    const editUrl = `/drive/file/${fileId}?${qEdit.toString()}`;
    const handleGeneralAccessChange = async (value: "restricted" | "anyone") => {
        setGeneralAccess(value);
        if (value === "anyone") {
            setLoading(true);
            const res = await shareWithAnyoneAction(fileId, anyoneRole);
            setLoading(false);
            if (res.ok) {
                toast.success(anyoneRole === "writer"
                    ? "Anyone with the link can now edit"
                    : "Anyone with the link can now view");
            }
            else {
                toast.error(res.error ?? "Failed to update permission");
            }
        }
    };
    const handleAnyoneRoleChange = async (newRole: "reader" | "writer") => {
        setAnyoneRole(newRole);
        if (generalAccess !== "anyone")
            return;
        setLoading(true);
        const res = await shareWithAnyoneAction(fileId, newRole);
        setLoading(false);
        if (res.ok) {
            toast.success(newRole === "writer"
                ? "Permission updated to Editor"
                : "Permission updated to Viewer");
        }
        else {
            toast.error(res.error ?? "Failed to update permission");
            setAnyoneRole(newRole === "writer" ? "reader" : "writer");
        }
    };
    const handleCopyLink = async () => {
        if (generalAccess === "restricted") {
            setLoading(true);
            const res = await shareWithAnyoneAction(fileId, anyoneRole);
            setLoading(false);
            if (!res.ok) {
                toast.error(res.error ?? "Failed to set permission");
                return;
            }
            setGeneralAccess("anyone");
        }
        const link = anyoneRole === "writer" && isGoogleEditableType(mimeType)
            ? getFileEditUrl(fileId, mimeType)
            : driveFileUrl(fileId);
        await navigator.clipboard.writeText(link);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        toast.success("Link copied to clipboard");
    };
    const handleShareByEmail = async () => {
        if (!shareEmail.trim())
            return;
        setLoading(true);
        const res = await shareDriveFileAction(fileId, shareEmail.trim(), shareRole);
        setLoading(false);
        if (res.ok) {
            toast.success(`Shared — Invitation sent to ${shareEmail.trim()}`);
            setShareEmail("");
        }
        else {
            toast.error(`Share failed — ${res.error ?? "Something went wrong"}`);
        }
    };
    return (<>
      <header className="file-viewer-bar">
        <div className="file-viewer-bar-inner">
          <div className="file-viewer-bar-main">
            <Link href={backTo} title="Back" aria-label="Back to previous page" className="file-viewer-back">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
              </svg>
              <span>Back</span>
            </Link>
            <div className="file-viewer-title-block min-w-0">
              <h1 className="file-viewer-title" title={displayName}>
                {displayName}
              </h1>
              <p className="file-viewer-meta">{subtitle || kind}</p>
            </div>
          </div>
          <div className="file-viewer-actions">
            <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)} className="file-viewer-btn-secondary shrink-0 border-zinc-300 bg-white font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
              Share
            </Button>
            {canEdit ? (editMode ? (<Link href={viewUrl} className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
                  View only
                </Link>) : (<Link href={editUrl} className="file-viewer-btn-primary shrink-0">
                  Edit
                </Link>)) : null}
            {canEdit ? (<a href={getFileEditUrl(fileId, mimeType)} target="_blank" rel="noopener noreferrer" className="file-viewer-btn-ghost shrink-0">
                Open in new tab
              </a>) : (<a href={driveFileUrl(fileId)} target="_blank" rel="noopener noreferrer" className="file-viewer-btn-ghost shrink-0">
                Open in Drive
              </a>)}
          </div>
        </div>
      </header>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="shad-dialog button max-w-md">
          <DialogHeader>
            <DialogTitle className="text-light-100">
              Share &quot;{displayName}&quot;
            </DialogTitle>
            <div className="space-y-4 pt-2">
              <div>
                <p className="body-2 mb-1 font-medium text-light-100">
                  General access
                </p>
                {permissionsLoading ? (<p className="body-2 text-light-200">Loading…</p>) : (<>
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="body-2 min-w-[180px] flex-1 rounded-lg border border-light-300 px-3 py-2" value={generalAccess} onChange={(e) => handleGeneralAccessChange(e.target.value as "restricted" | "anyone")} disabled={loading}>
                        <option value="restricted">Restricted</option>
                        <option value="anyone">Anyone with the link</option>
                      </select>
                      {generalAccess === "anyone" && (<select className="body-2 rounded-lg border border-light-300 px-3 py-2" value={anyoneRole} onChange={(e) => handleAnyoneRoleChange(e.target.value as "reader" | "writer")} disabled={loading}>
                          <option value="reader">Viewer</option>
                          <option value="writer">Editor</option>
                        </select>)}
                    </div>
                    {generalAccess === "anyone" && (<p className="body-2 mt-1 text-light-200">
                        Anyone with the link can{" "}
                        {anyoneRole === "reader" ? "view" : "edit"}.
                      </p>)}
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={handleCopyLink} disabled={loading}>
                      {linkCopied ? "Link copied!" : "Copy link"}
                    </Button>
                  </>)}
              </div>
              <div className="border-t border-light-300 pt-4">
                <p className="body-2 mb-1 font-medium text-light-100">
                  Add people and groups
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="Add people by email" className="min-w-[160px] flex-1"/>
                  <select className="body-2 w-[100px] rounded-lg border border-light-300 px-3 py-2" value={shareRole} onChange={(e) => setShareRole(e.target.value as "reader" | "writer")}>
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
            <Button onClick={() => setShareOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}
