"use server";
import { auth } from "@gd/auth";
import { fetchDriveFiles, fetchDriveQuota, fetchDriveFolders, fetchDriveFileMetadata, fetchDriveFileViewerMeta, fetchDriveStarred, uploadDriveFile, deleteDriveFile, renameDriveFile, moveDriveFile, updateDriveFileStarred, createDriveFolder, createDrivePermission, fetchDrivePermissions, updateDrivePermission, type DriveFileDisplay, type DriveFileType, type DriveFolder, } from "@gd/lib/google-drive";
import { parseStringify } from "@gd/lib/utils";
import { revalidatePath } from "next/cache";
const handleError = (error: unknown): never => {
    throw error;
};
async function getAccessToken(): Promise<string | null> {
    const session = await auth();
    const token = session?.accessToken;
    return token && typeof token === "string" ? token : null;
}
export async function getDriveFiles(options: {
    types?: DriveFileType[];
    searchText?: string;
    sort?: string;
    limit?: number;
    pageToken?: string;
    parentId?: string;
}) {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
            return parseStringify({ documents: [], total: 0, nextPageToken: undefined });
        }
        const { files, nextPageToken } = await fetchDriveFiles(accessToken, {
            types: options.types,
            searchText: options.searchText,
            sort: options.sort,
            limit: options.limit ?? 50,
            pageToken: options.pageToken,
            parentId: options.parentId,
        });
        return parseStringify({
            documents: files,
            total: files.length,
            nextPageToken,
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("401") || msg.includes("invalid authentication credentials")) {
            return parseStringify({ documents: [], total: 0, nextPageToken: undefined });
        }
        if (msg.includes("403") || msg.includes("Drive API")) {
            return parseStringify({ documents: [], total: 0, nextPageToken: undefined });
        }
        handleError(e);
    }
}
export async function getDriveTotalSpaceUsed() {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
            return parseStringify({
                image: { size: 0, latestDate: "" },
                document: { size: 0, latestDate: "" },
                video: { size: 0, latestDate: "" },
                audio: { size: 0, latestDate: "" },
                other: { size: 0, latestDate: "" },
                used: 0,
                all: 0,
            });
        }
        const [quota, { files }] = await Promise.all([
            fetchDriveQuota(accessToken),
            fetchDriveFiles(accessToken, { limit: 1000 }),
        ]);
        const totalSpace = {
            image: { size: 0, latestDate: "" },
            document: { size: 0, latestDate: "" },
            video: { size: 0, latestDate: "" },
            audio: { size: 0, latestDate: "" },
            other: { size: 0, latestDate: "" },
            used: quota.usageInDrive || quota.usage,
            all: quota.limit,
        };
        files.forEach((f: DriveFileDisplay) => {
            const key = f.type as keyof typeof totalSpace;
            if (key in totalSpace && typeof totalSpace[key] === "object") {
                const slot = totalSpace[key] as {
                    size: number;
                    latestDate: string;
                };
                slot.size += f.size;
                if (!slot.latestDate ||
                    new Date(f.$createdAt) > new Date(slot.latestDate)) {
                    slot.latestDate = f.$createdAt;
                }
            }
        });
        return parseStringify(totalSpace);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const emptyQuota = () => parseStringify({
            image: { size: 0, latestDate: "" },
            document: { size: 0, latestDate: "" },
            video: { size: 0, latestDate: "" },
            audio: { size: 0, latestDate: "" },
            other: { size: 0, latestDate: "" },
            used: 0,
            all: 0,
        });
        if (msg.includes("401") || msg.includes("invalid authentication credentials")) {
            return emptyQuota();
        }
        if (msg.includes("403") || msg.includes("Drive")) {
            return emptyQuota();
        }
        handleError(e);
    }
}
export async function uploadDriveFileAction(formData: FormData) {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            throw new Error("Not authenticated");
        const file = formData.get("file") as File | null;
        if (!file || !(file instanceof File))
            throw new Error("No file");
        const parentId = (formData.get("parentId") as string) || undefined;
        await uploadDriveFile(accessToken, file, parentId);
        revalidatePath("/drive");
        revalidatePath("/drive/documents");
        revalidatePath("/drive/images");
        revalidatePath("/drive/media");
        revalidatePath("/drive/others");
        revalidatePath("/drive/folders");
        if (parentId)
            revalidatePath(`/drive/folder/${parentId}`);
        return { ok: true };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("403") && (msg.includes("insufficient") || msg.includes("scope"))) {
            return { ok: false, error: "No upload permission. Please sign out and sign in again with Google." };
        }
        return { ok: false, error: msg || "Upload failed" };
    }
}
export async function deleteDriveFileAction(fileId: string) {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            throw new Error("Not authenticated");
        await deleteDriveFile(accessToken, fileId);
        revalidatePath("/drive");
        revalidatePath("/drive/documents");
        revalidatePath("/drive/images");
        revalidatePath("/drive/media");
        revalidatePath("/drive/others");
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
    }
}
export async function renameDriveFileAction(fileId: string, name: string) {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            throw new Error("Not authenticated");
        await renameDriveFile(accessToken, fileId, name);
        revalidatePath("/drive");
        revalidatePath("/drive/documents");
        revalidatePath("/drive/images");
        revalidatePath("/drive/media");
        revalidatePath("/drive/others");
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Rename failed" };
    }
}
export async function moveDriveFileAction(fileId: string, addParents: string, removeParents: string) {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            throw new Error("Not authenticated");
        await moveDriveFile(accessToken, fileId, addParents, removeParents);
        revalidatePath("/drive");
        revalidatePath("/drive/documents");
        revalidatePath("/drive/images");
        revalidatePath("/drive/media");
        revalidatePath("/drive/others");
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Move failed" };
    }
}
export async function starDriveFileAction(fileId: string, starred: boolean) {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            throw new Error("Not authenticated");
        await updateDriveFileStarred(accessToken, fileId, starred);
        revalidatePath("/drive");
        revalidatePath("/drive/folders");
        revalidatePath("/drive/documents");
        revalidatePath("/drive/images");
        revalidatePath("/drive/media");
        revalidatePath("/drive/others");
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Failed" };
    }
}
export async function getDriveStarredAction(options: {
    sort?: string;
    limit?: number;
    pageToken?: string;
} = {}) {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
            return parseStringify({ folders: [], files: [], nextPageToken: undefined });
        }
        const { folders, files, nextPageToken } = await fetchDriveStarred(accessToken, options);
        return parseStringify({ folders, files, nextPageToken });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("401") || msg.includes("invalid authentication credentials")) {
            return parseStringify({ folders: [], files: [], nextPageToken: undefined });
        }
        if (msg.includes("403") || msg.includes("Drive API")) {
            return parseStringify({ folders: [], files: [], nextPageToken: undefined });
        }
        return parseStringify({ folders: [], files: [], nextPageToken: undefined });
    }
}
export async function getDriveStarredSummary() {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
            return parseStringify({ count: 0, size: 0, latestDate: "" });
        }
        const { folders, files } = await fetchDriveStarred(accessToken, { limit: 1000 });
        let size = 0;
        let latestDate = "";
        for (const f of files) {
            size += f.size;
            const d = f.$createdAt || "";
            if (d && (!latestDate || d > latestDate))
                latestDate = d;
        }
        return parseStringify({
            count: folders.length + files.length,
            size,
            latestDate,
        });
    }
    catch (e) {
        return parseStringify({ count: 0, size: 0, latestDate: "" });
    }
}
export async function getDriveFoldersAction(parentId?: string): Promise<DriveFolder[]> {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            return [];
        const id = parentId ?? "root";
        if (id === "root") {
            const folders = await fetchDriveFolders(accessToken, "root");
            return parseStringify([{ id: "root", name: "My Drive (root)" }, ...folders]);
        }
        const folders = await fetchDriveFolders(accessToken, id);
        return parseStringify(folders);
    }
    catch (e) {
        return [];
    }
}
export async function getDriveFolderInfoAction(folderId: string): Promise<{
    id: string;
    name: string;
    parents?: string[];
} | null> {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            return null;
        const info = await fetchDriveFileMetadata(accessToken, folderId);
        return parseStringify(info);
    }
    catch (e) {
        return null;
    }
}
export async function getFolderBreadcrumbAction(folderId: string): Promise<{
    id: string;
    name: string;
}[]> {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            return [{ id: "root", name: "Folders" }, { id: folderId, name: "Folder" }];
        const chain: {
            id: string;
            name: string;
        }[] = [];
        let currentId: string | undefined = folderId;
        const seen = new Set<string>();
        while (currentId && currentId !== "root" && !seen.has(currentId)) {
            seen.add(currentId);
            const info = await fetchDriveFileMetadata(accessToken, currentId);
            chain.push({ id: currentId, name: info.name });
            currentId = info.parents?.[0];
        }
        return [{ id: "root", name: "Folders" }, ...chain.reverse()];
    }
    catch (e) {
        return [{ id: "root", name: "Folders" }, { id: folderId, name: "Folder" }];
    }
}
export async function listDriveFoldersAction(parentId: string = "root"): Promise<DriveFolder[]> {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            return [];
        const folders = await fetchDriveFolders(accessToken, parentId);
        return parseStringify(folders);
    }
    catch (e) {
        return [];
    }
}
export async function createDriveFolderAction(name: string, parentId: string = "root") {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            throw new Error("Not authenticated");
        await createDriveFolder(accessToken, name, parentId);
        revalidatePath("/drive");
        revalidatePath("/drive/folders");
        if (parentId !== "root")
            revalidatePath(`/drive/folder/${parentId}`);
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Create folder failed" };
    }
}
export async function shareDriveFileAction(fileId: string, emailAddress: string, role: "reader" | "writer") {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            throw new Error("Not authenticated");
        const email = emailAddress.trim().toLowerCase();
        if (!email)
            throw new Error("Enter email");
        await createDrivePermission(accessToken, fileId, {
            role,
            type: "user",
            emailAddress: email,
            sendNotificationEmail: true,
        });
        revalidatePath("/drive");
        revalidatePath("/drive/folders");
        revalidatePath("/drive/documents");
        revalidatePath("/drive/images");
        revalidatePath("/drive/media");
        revalidatePath("/drive/others");
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Share failed" };
    }
}
export async function getDriveFileViewerMetaAction(fileId: string): Promise<{
    name: string;
    mimeType?: string;
    modifiedTime?: string;
} | null> {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            return null;
        return await fetchDriveFileViewerMeta(accessToken, fileId);
    }
    catch {
        return null;
    }
}
export async function getFilePermissionsAction(fileId: string): Promise<{
    generalAccess: "restricted" | "anyone";
    anyoneRole: "reader" | "writer";
} | null> {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            return null;
        const permissions = await fetchDrivePermissions(accessToken, fileId);
        const anyone = permissions.find((p) => p.type === "anyone");
        if (!anyone) {
            return { generalAccess: "restricted", anyoneRole: "reader" };
        }
        const role = anyone.role === "writer" ? "writer" : "reader";
        return { generalAccess: "anyone", anyoneRole: role };
    }
    catch (e) {
        return null;
    }
}
export async function shareWithAnyoneAction(fileId: string, role: "reader" | "writer") {
    try {
        const accessToken = await getAccessToken();
        if (!accessToken)
            throw new Error("Not authenticated");
        const permissions = await fetchDrivePermissions(accessToken, fileId);
        const anyone = permissions.find((p) => p.type === "anyone");
        if (anyone) {
            await updateDrivePermission(accessToken, fileId, anyone.id, role);
        }
        else {
            await createDrivePermission(accessToken, fileId, { type: "anyone", role });
        }
        revalidatePath("/drive");
        revalidatePath("/drive/folders");
        revalidatePath("/drive/documents");
        revalidatePath("/drive/images");
        revalidatePath("/drive/media");
        revalidatePath("/drive/others");
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Failed" };
    }
}
