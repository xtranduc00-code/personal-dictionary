"use client";
import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { uploadDriveFileAction } from "@gd/lib/actions/drive.actions";
import { toast } from "react-toastify";
import { MAX_FILE_SIZE } from "@gd/constants";
function getParentIdFromPathname(pathname: string): string | undefined {
    const match = pathname.match(/^\/drive\/folder\/([^/]+)$/);
    return match ? match[1] : undefined;
}
export default function DropZoneArea({ children }: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [uploading, setUploading] = useState(false);
    const pathname = usePathname();
    const parentId = getParentIdFromPathname(pathname ?? "");
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (!acceptedFiles.length)
            return;
        setUploading(true);
        let anySuccess = false;
        for (const file of acceptedFiles) {
            if (file.size > MAX_FILE_SIZE) {
                toast.error(`File too large — ${file.name} is over 50MB limit`);
                continue;
            }
            const formData = new FormData();
            formData.set("file", file);
            if (parentId)
                formData.set("parentId", parentId);
            const res = await uploadDriveFileAction(formData);
            if (res.ok) {
                anySuccess = true;
                toast.success(`Uploaded — ${file.name}`);
            }
            else {
                toast.error(`Upload failed — ${res.error ?? "Something went wrong"}`);
            }
        }
        setUploading(false);
        if (anySuccess)
            router.refresh();
    }, [parentId, router]);
    const { getRootProps, isDragActive } = useDropzone({
        onDrop,
        noClick: true,
        noKeyboard: true,
        disabled: uploading,
    });
    return (<div {...getRootProps()} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
      {isDragActive && (<div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-zinc-400 bg-zinc-100/90 backdrop-blur-sm dark:border-zinc-500 dark:bg-zinc-900/85 pointer-events-none">
          <div className="rounded-xl border border-zinc-200 bg-white px-8 py-6 text-center shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <p className="h4 text-light-100">Drop files to upload to Google Drive</p>
            <p className="body-2 text-light-200 mt-1">Drag and drop one or more files here</p>
          </div>
        </div>)}
    </div>);
}
