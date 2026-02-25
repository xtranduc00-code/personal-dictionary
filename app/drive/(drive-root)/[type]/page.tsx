import React from "react";
import Sort from "@gd/components/Sort";
import { getDriveFiles } from "@gd/lib/actions/drive.actions";
import Card from "@gd/components/Card";
import { getFileTypesParams } from "@gd/lib/utils";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
import { DRIVE_TYPE_SUBTITLE } from "@gd/constants/page-headings";
const Page = async ({ searchParams, params }: SearchParamProps) => {
    const type = ((await params)?.type as string) || "";
    const searchText = ((await searchParams)?.query as string) || "";
    const sort = ((await searchParams)?.sort as string) || "";
    const types = getFileTypesParams(type) as FileType[];
    const filesRes = await getDriveFiles({ types, searchText, sort });
    const files = filesRes ?? { documents: [], total: 0 };
    return (<div className="page-container">
      <section className="w-full">
        <h1 className="h1 capitalize">{type}</h1>
        <p className="page-lead">
          {DRIVE_TYPE_SUBTITLE[type] ?? "Files in this category."}
        </p>
        <p className="page-meta">
          {files.total} {files.total === 1 ? "file" : "files"} in Drive
        </p>

        <div className="mt-5 flex flex-col justify-end gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="sort-container !mt-0">
            <p className="body-1 hidden text-light-200 sm:block">Sort by:</p>

            <Sort />
          </div>
        </div>
      </section>

      {files.documents.length > 0 ? (<section className="file-list">
          {files.documents.map((file: DriveFileDisplay) => (<Card key={file.$id} file={file}/>))}
        </section>) : (<p className="empty-list">No files in Drive</p>)}
    </div>);
};
export default Page;
