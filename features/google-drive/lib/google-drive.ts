import { getFileType } from "@gd/lib/utils";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
export type DriveFileType = "document" | "image" | "video" | "audio" | "other";
export function mimeToFileType(mimeType: string): DriveFileType {
    if (!mimeType)
        return "other";
    if (mimeType.startsWith("image/"))
        return "image";
    if (mimeType.startsWith("video/"))
        return "video";
    if (mimeType.startsWith("audio/"))
        return "audio";
    const docMimes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument",
        "application/msword",
        "text/",
        "application/vnd.ms-",
        "application/vnd.oasis",
        "application/vnd.google-apps",
    ];
    if (docMimes.some((m) => mimeType.startsWith(m)))
        return "document";
    return "other";
}
export interface DriveFileDisplay {
    $id: string;
    name: string;
    type: DriveFileType;
    extension: string;
    size: number;
    mimeType?: string;
    url: string;
    $createdAt: string;
    $updatedAt?: string;
    owner: {
        fullName: string;
    };
    webContentLink?: string;
    iconLink?: string;
    thumbnailLink?: string;
    parents?: string[];
    starred?: boolean;
}
export interface DriveFolder {
    id: string;
    name: string;
    parents?: string[];
    starred?: boolean;
}
interface DriveFileResource {
    id: string;
    name: string;
    mimeType?: string;
    size?: string;
    webViewLink?: string;
    webContentLink?: string;
    iconLink?: string;
    thumbnailLink?: string;
    createdTime?: string;
    modifiedTime?: string;
    owners?: {
        displayName?: string;
    }[];
    parents?: string[];
    starred?: boolean;
}
export function mapDriveFileToDisplay(f: DriveFileResource): DriveFileDisplay {
    const type = mimeToFileType(f.mimeType || "");
    const ext = f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : "";
    return {
        $id: f.id,
        name: f.name,
        type,
        extension: ext,
        size: parseInt(f.size || "0", 10),
        mimeType: f.mimeType,
        url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        $createdAt: f.createdTime || f.modifiedTime || new Date().toISOString(),
        $updatedAt: f.modifiedTime,
        owner: { fullName: f.owners?.[0]?.displayName || "Me" },
        webContentLink: f.webContentLink,
        iconLink: f.iconLink,
        thumbnailLink: f.thumbnailLink,
        parents: f.parents,
        starred: f.starred,
    };
}
export function buildDriveQuery(options: {
    types?: DriveFileType[];
    searchText?: string;
    starred?: boolean;
}): string {
    const parts: string[] = ["trashed = false"];
    if (options.starred) {
        parts.push("starred = true");
    }
    if (options.types && options.types.length > 0) {
        const mimeConditions = options.types.map((t) => {
            switch (t) {
                case "image":
                    return "mimeType contains 'image/'";
                case "video":
                    return "mimeType contains 'video/'";
                case "audio":
                    return "mimeType contains 'audio/'";
                case "document":
                    return "(mimeType = 'application/pdf' or mimeType contains 'application/vnd.' or mimeType contains 'text/' or mimeType contains 'application/msword')";
                default:
                    return "mimeType not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation') and mimeType not contains 'image/' and mimeType not contains 'video/' and mimeType not contains 'audio/'";
            }
        });
        parts.push(`(${mimeConditions.join(" or ")})`);
    }
    if (options.searchText?.trim()) {
        parts.push(`name contains '${options.searchText.trim().replace(/'/g, "\\'")}'`);
    }
    return parts.join(" and ");
}
export function driveOrderBy(sort: string): string {
    const [sortBy, order] = (sort || "$createdAt-desc").split("-");
    const dir = order === "asc" ? "asc" : "desc";
    if (sortBy === "name")
        return `name ${dir}`;
    if (sortBy === "size")
        return `quotaBytesUsed ${dir}`;
    return `createdTime ${dir}`;
}
export async function fetchDriveFiles(accessToken: string, options: {
    types?: DriveFileType[];
    searchText?: string;
    sort?: string;
    limit?: number;
    pageToken?: string;
    parentId?: string;
    starred?: boolean;
}): Promise<{
    files: DriveFileDisplay[];
    nextPageToken?: string;
}> {
    const q = buildDriveQuery({ types: options.types, searchText: options.searchText, starred: options.starred });
    const orderBy = driveOrderBy(options.sort || "");
    const pageSize = Math.min(options.limit || 50, 100);
    const partsQuery = options.parentId
        ? [q, `'${options.parentId}' in parents`, "mimeType != 'application/vnd.google-apps.folder'"]
        : [q];
    const qFinal = partsQuery.join(" and ");
    const params = new URLSearchParams({
        q: qFinal,
        orderBy,
        pageSize: String(pageSize),
        fields: "nextPageToken,files(id,name,mimeType,size,webViewLink,webContentLink,iconLink,thumbnailLink,createdTime,modifiedTime,owners,parents,starred)",
    });
    if (options.pageToken)
        params.set("pageToken", options.pageToken);
    const res = await fetch(`${DRIVE_API}/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive API error: ${res.status} ${err}`);
    }
    const data = await res.json();
    const files = (data.files || []).map(mapDriveFileToDisplay);
    return { files, nextPageToken: data.nextPageToken };
}
const FOLDER_MIME = "application/vnd.google-apps.folder";
export async function fetchDriveStarred(accessToken: string, options: {
    sort?: string;
    limit?: number;
    pageToken?: string;
} = {}): Promise<{
    folders: DriveFolder[];
    files: DriveFileDisplay[];
    nextPageToken?: string;
}> {
    const q = "trashed = false and starred = true";
    const orderBy = driveOrderBy(options.sort || "$createdAt-desc");
    const pageSize = Math.min(options.limit ?? 100, 100);
    const params = new URLSearchParams({
        q,
        orderBy,
        pageSize: String(pageSize),
        fields: "nextPageToken,files(id,name,mimeType,size,webViewLink,webContentLink,iconLink,thumbnailLink,createdTime,modifiedTime,owners,parents,starred)",
    });
    if (options.pageToken)
        params.set("pageToken", options.pageToken);
    const res = await fetch(`${DRIVE_API}/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive API starred: ${res.status} ${err}`);
    }
    const data = await res.json();
    const raw = data.files || [];
    const folders: DriveFolder[] = [];
    const files: DriveFileDisplay[] = [];
    for (const f of raw) {
        if (f.mimeType === FOLDER_MIME) {
            folders.push({ id: f.id, name: f.name, parents: f.parents, starred: true });
        }
        else {
            files.push(mapDriveFileToDisplay(f));
        }
    }
    return { folders, files, nextPageToken: data.nextPageToken };
}
export interface DriveStorageQuota {
    limit: number;
    usage: number;
    usageInDrive: number;
}
export async function fetchDriveQuota(accessToken: string): Promise<DriveStorageQuota> {
    const res = await fetch(`${DRIVE_API}/about?fields=storageQuota`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok)
        throw new Error(`Drive about error: ${res.status}`);
    const data = await res.json();
    const q = data.storageQuota || {};
    return {
        limit: parseInt(q.limit || "0", 10),
        usage: parseInt(q.usage || "0", 10),
        usageInDrive: parseInt(q.usageInDrive || "0", 10),
    };
}
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export async function fetchDriveFolders(accessToken: string, parentId: string = "root"): Promise<DriveFolder[]> {
    const q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false and '" + parentId + "' in parents";
    const params = new URLSearchParams({
        q,
        pageSize: "100",
        fields: "files(id,name,parents,starred)",
    });
    const res = await fetch(`${DRIVE_API}/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive folders: ${res.status} ${err}`);
    }
    const data = await res.json();
    return (data.files || []).map((f: {
        id: string;
        name: string;
        parents?: string[];
        starred?: boolean;
    }) => ({
        id: f.id,
        name: f.name,
        parents: f.parents,
        starred: f.starred,
    }));
}
export async function uploadDriveFile(accessToken: string, file: File | Blob & {
    name?: string;
}, parentId?: string): Promise<DriveFileDisplay> {
    const fileName = "name" in file && file.name ? String(file.name) : "upload";
    const metadata: {
        name: string;
        parents?: string[];
    } = { name: fileName };
    if (parentId)
        metadata.parents = [parentId];
    const boundary = "-------" + Math.random().toString(36).slice(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;
    const metaPart = delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata);
    const mime = "type" in file && file.type ? file.type : "application/octet-stream";
    const filePart = delimiter + "Content-Type: " + mime + "\r\n\r\n";
    const buf = await ("arrayBuffer" in file ? file.arrayBuffer() : (file as Blob).arrayBuffer());
    const body = new Blob([metaPart, filePart, new Uint8Array(buf), closeDelim]);
    const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive upload: ${res.status} ${err}`);
    }
    const data = await res.json();
    return mapDriveFileToDisplay(data);
}
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 204) {
        const err = await res.text();
        throw new Error(`Drive delete: ${res.status} ${err}`);
    }
}
export async function renameDriveFile(accessToken: string, fileId: string, name: string): Promise<void> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive rename: ${res.status} ${err}`);
    }
}
export async function moveDriveFile(accessToken: string, fileId: string, addParents: string, removeParents: string): Promise<void> {
    const params = new URLSearchParams({ addParents, removeParents });
    const res = await fetch(`${DRIVE_API}/files/${fileId}?${params}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive move: ${res.status} ${err}`);
    }
}
export async function updateDriveFileStarred(accessToken: string, fileId: string, starred: boolean): Promise<void> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ starred }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive star: ${res.status} ${err}`);
    }
}
export async function fetchDriveFileMetadata(accessToken: string, fileId: string): Promise<{
    id: string;
    name: string;
    parents?: string[];
}> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=id,name,parents`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive get file: ${res.status} ${err}`);
    }
    const data = await res.json();
    return { id: data.id, name: data.name, parents: data.parents };
}
export async function fetchDriveFileViewerMeta(accessToken: string, fileId: string): Promise<{
    name: string;
    mimeType?: string;
    modifiedTime?: string;
}> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=name,mimeType,modifiedTime`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive get file: ${res.status} ${err}`);
    }
    const data = await res.json();
    return {
        name: data.name ?? "File",
        mimeType: data.mimeType,
        modifiedTime: data.modifiedTime,
    };
}
export async function createDriveFolder(accessToken: string, name: string, parentId: string = "root"): Promise<DriveFolder> {
    const res = await fetch(`${DRIVE_API}/files`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive create folder: ${res.status} ${err}`);
    }
    const data = await res.json();
    return { id: data.id, name: data.name, parents: data.parents };
}
export async function fetchDrivePermissions(accessToken: string, fileId: string): Promise<{
    id: string;
    type: string;
    role: string;
}[]> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}/permissions?fields=permissions(id,type,role)`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive list permissions: ${res.status} ${err}`);
    }
    const data = await res.json();
    return data.permissions || [];
}
export async function updateDrivePermission(accessToken: string, fileId: string, permissionId: string, role: "reader" | "writer"): Promise<void> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}/permissions/${permissionId}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive update permission: ${res.status} ${err}`);
    }
}
export async function createDrivePermission(accessToken: string, fileId: string, options: ({
    role: "reader" | "writer";
    type: "user";
    emailAddress: string;
    sendNotificationEmail?: boolean;
} | {
    role: "reader" | "writer";
    type: "anyone";
})): Promise<void> {
    const body: Record<string, unknown> = {
        role: options.role,
        type: options.type,
    };
    if (options.type === "user") {
        body.emailAddress = options.emailAddress;
        body.sendNotificationEmail = options.sendNotificationEmail ?? true;
    }
    const res = await fetch(`${DRIVE_API}/files/${fileId}/permissions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Drive share: ${res.status} ${err}`);
    }
}
