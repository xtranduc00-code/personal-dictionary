"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { cn, getFileIcon } from "@gd/lib/utils";
interface Props {
    type: string;
    extension: string;
    url?: string;
    imageClassName?: string;
    className?: string;
}
const PREVIEW_TYPES = ["image", "document", "video", "audio"] as const;
export const Thumbnail = ({ type, extension, url = "", imageClassName, className, }: Props) => {
    const [loadError, setLoadError] = useState(false);
    useEffect(() => setLoadError(false), [url]);
    const isDirectImageUrl = url && !url.includes("drive.google.com/file");
    const isImageTypeWithUrl = type === "image" && extension !== "svg" && isDirectImageUrl;
    const isPreviewableType = PREVIEW_TYPES.includes(type as (typeof PREVIEW_TYPES)[number]);
    const showPreview = !loadError && (isImageTypeWithUrl || (isPreviewableType && !!url));
    const iconSrc = getFileIcon(extension, type);
    return (<figure className={cn("thumbnail", className)}>
      <Image src={showPreview ? url! : iconSrc} alt="thumbnail" width={100} height={100} unoptimized={showPreview} className={cn("size-8 object-contain", imageClassName, showPreview && "thumbnail-image")} onError={() => setLoadError(true)}/>
    </figure>);
};
export default Thumbnail;
