"use client";
import { useRouter } from "next/navigation";
import { moveDriveFileAction } from "@gd/lib/actions/drive.actions";
import { toast } from "react-toastify";
const DRAG_TYPE = "application/x-storeit-file";
type Props = {
    folderId: string;
    folderName: string;
    children: React.ReactNode;
};
export default function CurrentFolderDropZone({ folderId, folderName, children }: Props) {
    const router = useRouter();
    const handleDragOver = (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE))
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.classList.add("current-folder-drop-target");
    };
    const handleDragLeave = (e: React.DragEvent) => {
        e.currentTarget.classList.remove("current-folder-drop-target");
    };
    const handleDrop = async (e: React.DragEvent) => {
        e.currentTarget.classList.remove("current-folder-drop-target");
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (!raw)
            return;
        e.preventDefault();
        try {
            const { fileId, fileName, parentId } = JSON.parse(raw);
            if (parentId === folderId)
                return;
            const res = await moveDriveFileAction(fileId, folderId, parentId);
            if (res.ok) {
                toast.success(`Moved — "${fileName}" into "${folderName}"`);
                router.refresh();
            }
            else {
                toast.error(`Move failed — ${res.error ?? "Something went wrong"}`);
            }
        }
        catch {
            toast.error("Move failed — Invalid data");
        }
    };
    return (<div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className="rounded-xl transition-colors">
      {children}
    </div>);
}
