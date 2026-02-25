"use client";
import Link from "next/link";
import { FileText, Film, Image as ImageIcon, Star, type LucideIcon, } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, } from "@gd/components/ui/tooltip";
import { FormattedDateTime } from "@gd/components/FormattedDateTime";
import { convertFileSize } from "@gd/lib/utils";
type Summary = {
    title: string;
    size: number;
    latestDate: string;
    url: string;
};
function iconForTitle(title: string): LucideIcon {
    switch (title) {
        case "Documents":
            return FileText;
        case "Images":
            return ImageIcon;
        case "Media":
            return Film;
        case "Starred":
            return Star;
        default:
            return FileText;
    }
}
export function DashboardSummaryCard({ summary }: {
    summary: Summary;
}) {
    const Icon = iconForTitle(summary.title);
    const tooltipText = `${summary.title} – ${convertFileSize(summary.size) || "0"}`;
    return (<li className="list-none">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={summary.url} className="dashboard-summary-card group flex w-full items-center gap-4 text-left no-underline">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700" aria-hidden>
              <Icon className="h-5 w-5" strokeWidth={1.75}/>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">
                  {summary.title}
                </h3>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {convertFileSize(summary.size) || "0 B"}
                </span>
              </div>
              <FormattedDateTime date={summary.latestDate} className="mt-0.5 block text-xs font-medium text-zinc-700 dark:text-zinc-400"/>
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-medium">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </li>);
}
