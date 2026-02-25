"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import Thumbnail from "@gd/components/Thumbnail";
import { formatFileSizeDisplay, getFileIcon, getDriveThumbnailUrl, isPreviewableInApp, cn, } from "@gd/lib/utils";
import FormattedDateTime from "@gd/components/FormattedDateTime";
import ActionDropdown from "@gd/components/ActionDropdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gd/components/ui/tooltip";
import { starDriveFileAction } from "@gd/lib/actions/drive.actions";
import { toast } from "react-toastify";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
const DRAG_TYPE = "application/x-storeit-file";
type CardProps = {
    file: DriveFileDisplay;
    layout?: "grid" | "list";
    selectionMode?: boolean;
    onToggleSelection?: () => void;
};
const Card = ({ file, layout = "grid", selectionMode = false, onToggleSelection, }: CardProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const dragPreviewRef = useRef<HTMLDivElement>(null);
    const [starred, setStarred] = useState(!!file.starred);
    const handleStar = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !starred;
        setStarred(next);
        const res = await starDriveFileAction(file.$id, next);
        if (res.ok) {
            toast.success(next ? "Starred" : "Unstarred");
            router.refresh();
        }
        else {
            setStarred(!!file.starred);
            toast.error(res.error ?? "Failed");
        }
    };
    const handleDragStart = (e: React.DragEvent) => {
        if (selectionMode) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({
            fileId: file.$id,
            fileName: file.name,
            parentId: file.parents?.[0] ?? "root",
        }));
        e.dataTransfer.effectAllowed = "move";
        if (dragPreviewRef.current) {
            e.dataTransfer.setDragImage(dragPreviewRef.current, 40, 30);
        }
    };
    const handleCardClick = (e: React.MouseEvent) => {
        if (!selectionMode || !onToggleSelection)
            return;
        const t = e.target as HTMLElement;
        if (t.closest("button") || t.closest("a"))
            return;
        onToggleSelection();
    };
    const iconSrc = getFileIcon(file.extension, file.type);
    const isList = layout === "list";
    const openInApp = isPreviewableInApp(file.mimeType);
    const thumbnailUrl = file.thumbnailLink ||
        (file.type === "document" || file.type === "video" ? getDriveThumbnailUrl(file.$id) : undefined) ||
        file.url;
    const fileHref = openInApp
        ? `/drive/file/${file.$id}?mime=${encodeURIComponent(file.mimeType || "")}&name=${encodeURIComponent(file.name)}&from=${encodeURIComponent(pathname || "/drive/folders")}`
        : file.url;
    const stopCardNav = (e: React.MouseEvent | React.PointerEvent) => {
        e.stopPropagation();
    };
    const NavWrap = ({ children, className, }: {
        children: React.ReactNode;
        className?: string;
    }) => selectionMode ? (<div className={className}>{children}</div>) : (<Link href={fileHref} target={openInApp ? undefined : "_blank"} className={className}>
        {children}
      </Link>);
    return (<>
      <div ref={dragPreviewRef} aria-hidden className="pointer-events-none fixed left-[-9999px] top-0 z-[-1] flex items-center gap-2 rounded-lg border border-light-300 bg-white px-3 py-2 shadow-lg">
        <Image src={iconSrc} alt="" width={24} height={24}/>
        <span className="max-w-[180px] truncate text-sm font-medium text-light-100">{file.name}</span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(`group relative ${isList ? "file-card file-card--list" : "file-card"}`, selectionMode && "cursor-pointer select-none")} draggable={!selectionMode} onDragStart={handleDragStart} onClick={handleCardClick}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={handleStar} className="absolute right-12 top-3 z-30 flex size-8 items-center justify-center rounded-lg text-light-300 transition-colors hover:bg-zinc-100 hover:text-amber-500 dark:hover:bg-zinc-800" aria-label={starred ? "Remove star" : "Star"}>
                  {starred ? (<svg className="h-5 w-5 fill-amber-400 text-amber-500" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                    </svg>) : (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                    </svg>)}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{starred ? "Remove star" : "Star"}</TooltipContent>
            </Tooltip>
            {isList ? (<>
                <NavWrap className="relative z-10 shrink-0 outline-none">
                  <Thumbnail type={file.type} extension={file.extension} url={thumbnailUrl} className="!size-14 shrink-0" imageClassName="!size-8"/>
                </NavWrap>
                <NavWrap className="relative z-10 min-w-0 flex-1 outline-none">
                  <div className="file-card-details file-card-details--list">
                    <p className="subtitle-2 line-clamp-1">{file.name}</p>
                    <div className="body-2 flex flex-wrap items-center gap-x-4 gap-y-0 font-medium text-zinc-700 dark:text-zinc-400">
                      <span>{formatFileSizeDisplay(file.size, file.mimeType)}</span>
                      <FormattedDateTime date={file.$createdAt}/>
                      <span>By: {file.owner.fullName}</span>
                    </div>
                  </div>
                </NavWrap>
                <div className="relative z-20 shrink-0" onClick={stopCardNav} onPointerDown={stopCardNav}>
                  <ActionDropdown file={file}/>
                </div>
              </>) : (<>
                <div className="relative z-10 flex justify-between">
                  <NavWrap className="shrink-0 outline-none">
                    <Thumbnail type={file.type} extension={file.extension} url={thumbnailUrl} className="!size-24" imageClassName="!size-14"/>
                  </NavWrap>
                  <div className="relative z-20 flex flex-col items-end justify-between" onClick={stopCardNav} onPointerDown={stopCardNav}>
                    <ActionDropdown file={file}/>
                    <p className="body-1">{formatFileSizeDisplay(file.size, file.mimeType)}</p>
                  </div>
                </div>
                <NavWrap className="relative z-10 block outline-none">
                  <div className="file-card-details">
                    <p className="subtitle-2 line-clamp-1">{file.name}</p>
                    <FormattedDateTime date={file.$createdAt} className="body-2 font-medium text-zinc-700 dark:text-zinc-400"/>
                    <p className="caption line-clamp-1 font-medium text-zinc-700 dark:text-zinc-400">
                      By: {file.owner.fullName}
                    </p>
                  </div>
                </NavWrap>
              </>)}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] break-words font-medium">
          {selectionMode ? "Click to toggle selection" : file.name}
        </TooltipContent>
      </Tooltip>
    </>);
};
export default Card;
