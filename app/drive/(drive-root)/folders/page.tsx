import { listDriveFoldersAction } from "@gd/lib/actions/drive.actions";
import FolderCard from "@gd/components/FolderCard";
import CreateFolderButton from "@gd/components/CreateFolderButton";
import { DRIVE_FOLDERS_SUBTITLE } from "@gd/constants/page-headings";
export const dynamic = "force-dynamic";
export default async function FoldersPage() {
    const raw = await listDriveFoldersAction("root");
    const folderList = Array.isArray(raw) ? raw : [];
    return (<div className="page-container">
      <section className="w-full">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="h1">Folders</h1>
            <p className="page-lead">{DRIVE_FOLDERS_SUBTITLE}</p>
            {folderList.length > 0 ? (<p className="page-meta">
                {folderList.length}{" "}
                {folderList.length === 1 ? "folder" : "folders"}
              </p>) : null}
          </div>
          <div className="shrink-0 sm:pt-1">
            <CreateFolderButton />
          </div>
        </div>
      </section>

      {folderList.length > 0 ? (<section className="file-list">
          {folderList.map((folder) => (<FolderCard key={folder.id} folder={folder}/>))}
        </section>) : (<p className="empty-list">No folders yet. Click &quot;New folder&quot; to create one.</p>)}
    </div>);
}
