import { getDriveStarredAction } from "@gd/lib/actions/drive.actions";
import StarredFileList from "@gd/components/StarredFileList";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
import { DRIVE_STARRED_SUBTITLE } from "@gd/constants/page-headings";
import { Star } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function StarredPage({ searchParams, }: {
    searchParams: Promise<{
        sort?: string;
    }>;
}) {
    const { sort } = await searchParams;
    const res = await getDriveStarredAction({
        sort: sort || "$createdAt-desc",
        limit: 24,
    });
    const data = (res ?? {}) as {
        folders?: {
            id: string;
            name: string;
            parents?: string[];
        }[];
        files?: {
            $id: string;
            name: string;
            [key: string]: unknown;
        }[];
        nextPageToken?: string;
    };
    const folders = data.folders ?? [];
    const files = data.files ?? [];
    const nextPageToken = data.nextPageToken;
    return (<div className="page-container">
      <section className="w-full">
        <h1 className="h1">Starred</h1>
        <p className="page-lead">Items you marked with a star.</p>
        <p className="page-meta">{DRIVE_STARRED_SUBTITLE}</p>
      </section>

      {folders.length > 0 || files.length > 0 ? (<StarredFileList key={`starred-${sort ?? ""}`} initialFolders={folders} initialFiles={files as unknown as DriveFileDisplay[]} initialNextPageToken={nextPageToken} sort={sort || "$createdAt-desc"}/>) : (<div className="drive-starred-empty mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-8 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100/80 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <Star className="h-7 w-7" strokeWidth={1.5} fill="currentColor" fillOpacity={0.2}/>
          </div>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Nothing starred yet
          </p>
          <p className="page-lead mx-auto mt-2 max-w-md !text-center !text-sm">
            Star files or folders from any list — they&apos;ll show up here for
            quick access.
          </p>
        </div>)}
    </div>);
}
