"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@gd/components/ui/button";
import { Input } from "@gd/components/ui/input";
import Search from "@gd/components/Search";
import { Tooltip, TooltipContent, TooltipTrigger, } from "@gd/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from "@gd/components/ui/dialog";
import { parseGoogleDriveUrl } from "@gd/lib/utils";
import { toast } from "react-toastify";
const Header = () => {
    const [openLinkOpen, setOpenLinkOpen] = useState(false);
    const [linkInput, setLinkInput] = useState("");
    const router = useRouter();
    const handleOpenLink = () => {
        const parsed = parseGoogleDriveUrl(linkInput);
        if (!parsed) {
            toast.error("Invalid link. Paste a Google Drive or Docs/Sheets/Slides link.");
            return;
        }
        setOpenLinkOpen(false);
        setLinkInput("");
        if (parsed.isFolder) {
            router.push(`/drive/folder/${parsed.fileId}`);
            return;
        }
        const q = new URLSearchParams();
        if (parsed.mimeType)
            q.set("mime", parsed.mimeType);
        router.push(`/drive/file/${parsed.fileId}${q.toString() ? `?${q}` : ""}`);
    };
    return (<header className="drive-header">
      <div className="drive-header-row">
        <div className="drive-header-search min-w-0">
          <Search />
        </div>
        <div className="drive-header-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="shrink-0 border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-blue-500/35 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/18 dark:hover:border-blue-400/45" onClick={() => setOpenLinkOpen(true)}>
                Open link
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Paste a Drive/Docs link to open in app
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Dialog open={openLinkOpen} onOpenChange={setOpenLinkOpen}>
        <DialogContent className="shad-dialog max-w-md border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 dark:text-zinc-100">
              Open file by link
            </DialogTitle>
          </DialogHeader>
          <p className="body-2 text-zinc-600 dark:text-zinc-400">
            Paste a Google Drive, Docs, Sheets or Slides link to open the file in
            the app.
          </p>
          <div className="flex gap-2">
            <Input placeholder="https://drive.google.com/... or https://docs.google.com/..." value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleOpenLink()} className="min-w-0 flex-1 border-zinc-300 text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"/>
            <Button type="button" size="sm" onClick={handleOpenLink} className="dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500">
              Open
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>);
};
export default Header;
