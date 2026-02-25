"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gd/components/ui/tooltip";
import { Thumbnail } from "@gd/components/Thumbnail";
import { FormattedDateTime } from "@gd/components/FormattedDateTime";
import ActionDropdown from "@gd/components/ActionDropdown";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
import { getDriveThumbnailUrl, isPreviewableInApp } from "@gd/lib/utils";
export function DashboardRecentFileRow({ file }: {
    file: DriveFileDisplay;
}) {
    const pathname = usePathname();
    const openInApp = isPreviewableInApp(file.mimeType);
    const fileHref = openInApp
        ? `/drive/file/${file.$id}?mime=${encodeURIComponent(file.mimeType || "")}&name=${encodeURIComponent(file.name)}&from=${encodeURIComponent(pathname || "/drive")}`
        : file.url;
    const thumbnailUrl = file.thumbnailLink ||
        (file.type === "document" || file.type === "video" ? getDriveThumbnailUrl(file.$id) : undefined) ||
        file.url;
    return (<div className="group -mx-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.05] sm:gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={fileHref} target={openInApp ? undefined : "_blank"} className="flex min-w-0 flex-1 items-center gap-3">
            <Thumbnail type={file.type} extension={file.extension} url={thumbnailUrl}/>
            <div className="recent-file-details min-w-0 flex-1">
              <div className="flex flex-col gap-1">
                <p className="recent-file-name">{file.name}</p>
                <FormattedDateTime date={file.$createdAt} className="caption recent-file-row-date text-zinc-500 dark:text-zinc-400"/>
              </div>
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[320px] break-words font-medium">
          {file.name}
        </TooltipContent>
      </Tooltip>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <ActionDropdown file={file}/>
      </div>
    </div>);
}
