import { FileViewerBar } from "@gd/components/FileViewerBar";
import { getFilePreviewUrl } from "@gd/lib/utils";
import { getDriveFileViewerMetaAction } from "@gd/lib/actions/drive.actions";
export const dynamic = "force-dynamic";
const SAFE_BACK_PREFIXES = [
    "/drive",
    "/drive/folders",
    "/drive/folder/",
    "/drive/starred",
    "/drive/documents",
    "/drive/images",
    "/drive/media",
    "/drive/others",
];
function getBackTo(from: string | undefined): string {
    if (!from || typeof from !== "string")
        return "/drive/folders";
    const path = from.startsWith("/") ? from : `/${from}`;
    const ok = SAFE_BACK_PREFIXES.some((p) => p === path || (p.length > 1 && path.startsWith(p)));
    return ok ? path : "/drive/folders";
}
export default async function FileViewerPage({ params, searchParams, }: {
    params: Promise<{
        fileId: string;
    }>;
    searchParams: Promise<{
        mime?: string;
        name?: string;
        edit?: string;
        from?: string;
    }>;
}) {
    const { fileId } = await params;
    const { mime, name, edit, from } = await searchParams;
    const editMode = edit === "1";
    const backTo = getBackTo(from);
    const previewUrl = getFilePreviewUrl(fileId, mime || undefined, {
        edit: editMode,
    });
    const meta = await getDriveFileViewerMetaAction(fileId);
    const nameFromQuery = name ? decodeURIComponent(name) : undefined;
    return (<div className="file-viewer-root file-viewer-page">
      <FileViewerBar fileId={fileId} mimeType={meta?.mimeType || mime || undefined} name={meta?.name || nameFromQuery} modifiedTime={meta?.modifiedTime} editMode={editMode} backTo={backTo} fromParam={from}/>
      <div className="file-viewer-shell">
        <div className="file-viewer-document">
          <iframe title={meta?.name || nameFromQuery || "File preview"} src={previewUrl} className="file-viewer-iframe" allow="fullscreen" allowFullScreen/>
        </div>
      </div>
    </div>);
}
