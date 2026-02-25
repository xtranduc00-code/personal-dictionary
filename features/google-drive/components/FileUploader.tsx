"use client";
import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Button } from "@gd/components/ui/button";
import { cn, convertFileToUrl, getFileType } from "@gd/lib/utils";
import Image from "next/image";
import Thumbnail from "@gd/components/Thumbnail";
import { MAX_FILE_SIZE } from "@gd/constants";
import { toast } from "react-toastify";
import { uploadDriveFileAction } from "@gd/lib/actions/drive.actions";
interface Props {
    className?: string;
    parentId?: string;
}
const FileUploader = ({ className, parentId }: Props) => {
    const router = useRouter();
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        setFiles(acceptedFiles);
        setUploading(true);
        let anySuccess = false;
        for (const file of acceptedFiles) {
            if (file.size > MAX_FILE_SIZE) {
                setFiles((prev) => prev.filter((f) => f.name !== file.name));
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
                setFiles((prev) => prev.filter((f) => f.name !== file.name));
                toast.success(`Uploaded — ${file.name}`);
            }
            else {
                const isScopeError = res.error?.toLowerCase().includes("insufficient") || res.error?.toLowerCase().includes("scope");
                toast.error(isScopeError ? "Upload failed — Sign out and sign in again with Google for upload permission." : `Upload failed — ${res.error} – ${file.name}`);
            }
        }
        setUploading(false);
        if (anySuccess)
            router.refresh();
    }, [parentId, router]);
    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        disabled: uploading,
        noClick: false,
    });
    const handleRemoveFile = (e: React.MouseEvent, fileName: string) => {
        e.stopPropagation();
        setFiles((prev) => prev.filter((f) => f.name !== fileName));
    };
    return (<div {...getRootProps()} className="cursor-pointer">
      <input {...getInputProps()}/>
      <Button type="button" className={cn("uploader-button", className)} disabled={uploading}>
        <Image src="/gdrive/assets/icons/upload.svg" alt="upload" width={24} height={24}/>
        <p>{uploading ? "Uploading…" : "Upload"}</p>
      </Button>
      {files.length > 0 && (<ul className="uploader-preview-list">
          <h4 className="h4 text-light-100">Uploading to Drive</h4>
          {files.map((file, index) => {
                const { type, extension } = getFileType(file.name);
                return (<li key={`${file.name}-${index}`} className="uploader-preview-item">
                <div className="flex items-center gap-3">
                  <Thumbnail type={type} extension={extension} url={convertFileToUrl(file)}/>
                  <div className="preview-item-name">
                    {file.name}
                    {uploading && (<Image src="/gdrive/assets/icons/loader.svg" width={20} height={20} alt="Loader" className="animate-spin mt-1"/>)}
                  </div>
                </div>
                <Image src="/gdrive/assets/icons/remove.svg" width={24} height={24} alt="Remove" onClick={(e) => handleRemoveFile(e, file.name)}/>
              </li>);
            })}
        </ul>)}
    </div>);
};
export default FileUploader;
