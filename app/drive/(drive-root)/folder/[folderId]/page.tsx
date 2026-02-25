import Link from "next/link";
import { listDriveFoldersAction, getDriveFiles, getDriveFolderInfoAction, getFolderBreadcrumbAction } from "@gd/lib/actions/drive.actions";
import CreateFolderButton from "@gd/components/CreateFolderButton";
import FileUploader from "@gd/components/FileUploader";
import CurrentFolderDropZone from "@gd/components/CurrentFolderDropZone";
import FolderFileListWithSelect from "@gd/components/FolderFileListWithSelect";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
export const dynamic = "force-dynamic";
export default async function FolderPage({ params, searchParams, }: {
    params: Promise<{
        folderId: string;
    }>;
    searchParams: Promise<{
        sort?: string;
    }>;
}) {
    const { folderId } = await params;
    const { sort } = await searchParams;
    const [folderInfo, subfolders, filesRes] = await Promise.all([
        getDriveFolderInfoAction(folderId),
        listDriveFoldersAction(folderId),
        getDriveFiles({ parentId: folderId, limit: 24, sort: sort || "$createdAt-desc" }),
    ]);
    const folderName = folderInfo?.name ?? "Folder";
    const files = filesRes?.documents ?? [];
    const nextPageToken = (filesRes as {
        nextPageToken?: string;
    })?.nextPageToken;
    const breadcrumb = await getFolderBreadcrumbAction(folderId);
    return (<div className="page-container">
      <CurrentFolderDropZone folderId={folderId} folderName={folderName}>
        <section className="w-full">
          <nav className="flex flex-wrap items-center gap-2 body-2 text-light-200 mb-2">
            {breadcrumb.map((item, i) => (<span key={item.id} className="flex items-center gap-2">
                {i > 0 && <span>/</span>}
                {item.id === folderId ? (<span className="text-light-100 font-medium">{item.name}</span>) : item.id === "root" ? (<Link href="/drive/folders" className="hover:text-brand">{item.name}</Link>) : (<Link href={`/drive/folder/${item.id}`} className="hover:text-brand">{item.name}</Link>)}
              </span>))}
          </nav>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="h1">{folderName}</h1>
            <div className="flex items-center gap-2">
              <CreateFolderButton parentId={folderId}/>
              <FileUploader parentId={folderId}/>
            </div>
          </div>
        </section>
      </CurrentFolderDropZone>

      {((subfolders?.length ?? 0) > 0 || files.length > 0) ? (<FolderFileListWithSelect key={`${folderId}-${sort ?? ""}`} initialFiles={files} initialNextPageToken={nextPageToken} folders={subfolders ?? []} currentFolderId={folderId} sort={sort || "$createdAt-desc"}/>) : (<p className="empty-list mt-6">
          Folder is empty. Use &quot;Upload&quot; or &quot;New folder&quot; to add content.
        </p>)}
    </div>);
}
