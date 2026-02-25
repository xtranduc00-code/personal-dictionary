"use client";
import { useState } from "react";
import { Button } from "@gd/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, } from "@gd/components/ui/dialog";
import { Input } from "@gd/components/ui/input";
import Image from "next/image";
import { createDriveFolderAction } from "@gd/lib/actions/drive.actions";
import { toast } from "react-toastify";
interface Props {
    parentId?: string;
}
export default function CreateFolderButton({ parentId = "root" }: Props) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        setLoading(true);
        const res = await createDriveFolderAction(trimmed, parentId);
        setLoading(false);
        if (res.ok) {
            setOpen(false);
            setName("");
            toast.success(`Folder created — "${trimmed}" is ready`);
        }
        else {
            toast.error(`Create failed — ${res.error ?? "Something went wrong"}`);
        }
    };
    return (<>
      <Button type="button" className="uploader-button create-folder-button rounded-xl font-semibold" onClick={() => setOpen(true)}>
        <Image src="/gdrive/assets/icons/upload.svg" alt="New folder" width={24} height={24}/>
        <p>New folder</p>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="shad-dialog button">
          <DialogHeader>
            <DialogTitle className="text-center text-light-100">
              New folder
            </DialogTitle>
            <Input type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-2" placeholder="Folder name" onKeyDown={(e) => e.key === "Enter" && handleCreate()}/>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={loading || !name.trim()}>
              {loading ? "..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}
