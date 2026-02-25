import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { drivePath } from "../drive-base";
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
export const parseStringify = (value: unknown) => JSON.parse(JSON.stringify(value));
export const convertFileToUrl = (file: File) => URL.createObjectURL(file);
export function isPreviewableInApp(mimeType?: string): boolean {
    if (!mimeType)
        return false;
    const mt = mimeType.toLowerCase();
    if (mt === "application/vnd.google-apps.document")
        return true;
    if (mt === "application/vnd.google-apps.spreadsheet")
        return true;
    if (mt === "application/vnd.google-apps.presentation")
        return true;
    if (mt === "application/pdf")
        return true;
    if (mt.startsWith("video/"))
        return true;
    if (mt.includes("application/vnd.openxmlformats-officedocument.wordprocessingml"))
        return true;
    if (mt.includes("application/vnd.openxmlformats-officedocument.spreadsheetml"))
        return true;
    if (mt.includes("application/vnd.openxmlformats-officedocument.presentationml"))
        return true;
    if (mt.includes("application/vnd.ms-excel") || mt.includes("application/vnd.ms-word"))
        return true;
    if (mt.includes("application/vnd.ms-powerpoint"))
        return true;
    if (mt.includes("text/plain") || mt.includes("text/html"))
        return true;
    return false;
}
export function isGoogleEditableType(mimeType?: string): boolean {
    const mt = (mimeType || "").toLowerCase();
    return (mt === "application/vnd.google-apps.document" ||
        mt === "application/vnd.google-apps.spreadsheet" ||
        mt === "application/vnd.google-apps.presentation");
}
export function getFilePreviewUrl(fileId: string, mimeType?: string, options?: {
    edit?: boolean;
}): string {
    const mt = (mimeType || "").toLowerCase();
    const edit = options?.edit && isGoogleEditableType(mimeType);
    const path = edit ? "edit" : "preview";
    if (mt === "application/vnd.google-apps.document")
        return `https://docs.google.com/document/d/${fileId}/${path}`;
    if (mt === "application/vnd.google-apps.spreadsheet")
        return `https://docs.google.com/spreadsheets/d/${fileId}/${path}`;
    if (mt === "application/vnd.google-apps.presentation")
        return `https://docs.google.com/presentation/d/${fileId}/${path}`;
    return `https://drive.google.com/file/d/${fileId}/preview`;
}
export function getFileEditUrl(fileId: string, mimeType?: string): string {
    return getFilePreviewUrl(fileId, mimeType, { edit: true });
}
export function getDriveThumbnailUrl(fileId: string, size = "w200"): string {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}`;
}
export function parseGoogleDriveUrl(url: string): {
    fileId: string;
    mimeType?: string;
    isFolder?: boolean;
} | null {
    try {
        const u = url.trim();
        if (!u)
            return null;
        const parsed = new URL(u.startsWith("http") ? u : `https://${u}`);
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname;
        if (host === "drive.google.com") {
            const folderMatch = path.match(/\/drive\/folders\/([^/]+)/);
            if (folderMatch)
                return { fileId: folderMatch[1], isFolder: true };
            const dMatch = path.match(/\/file\/d\/([^/]+)/);
            if (dMatch)
                return { fileId: dMatch[1] };
            const id = parsed.searchParams.get("id");
            if (id)
                return { fileId: id };
            return null;
        }
        if (host === "docs.google.com") {
            const doc = path.match(/\/document\/d\/([^/]+)/);
            if (doc)
                return { fileId: doc[1], mimeType: "application/vnd.google-apps.document" };
            const sheet = path.match(/\/spreadsheets\/d\/([^/]+)/);
            if (sheet)
                return { fileId: sheet[1], mimeType: "application/vnd.google-apps.spreadsheet" };
            const pres = path.match(/\/presentation\/d\/([^/]+)/);
            if (pres)
                return { fileId: pres[1], mimeType: "application/vnd.google-apps.presentation" };
        }
        return null;
    }
    catch {
        return null;
    }
}
export function formatFileSizeDisplay(sizeInBytes: number, mimeType?: string): string {
    if (sizeInBytes === 0 && mimeType?.includes("application/vnd.google-apps")) {
        return "—";
    }
    return convertFileSize(sizeInBytes);
}
export const convertFileSize = (sizeInBytes: number, digits?: number) => {
    if (sizeInBytes < 1024) {
        return sizeInBytes + " Bytes";
    }
    else if (sizeInBytes < 1024 * 1024) {
        const sizeInKB = sizeInBytes / 1024;
        return sizeInKB.toFixed(digits || 1) + " KB";
    }
    else if (sizeInBytes < 1024 * 1024 * 1024) {
        const sizeInMB = sizeInBytes / (1024 * 1024);
        return sizeInMB.toFixed(digits || 1) + " MB";
    }
    else {
        const sizeInGB = sizeInBytes / (1024 * 1024 * 1024);
        return sizeInGB.toFixed(digits || 1) + " GB";
    }
};
export const calculatePercentage = (sizeInBytes: number) => {
    const totalSizeInBytes = 2 * 1024 * 1024 * 1024;
    const percentage = (sizeInBytes / totalSizeInBytes) * 100;
    return Number(percentage.toFixed(2));
};
export const getFileType = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (!extension)
        return { type: "other", extension: "" };
    const documentExtensions = [
        "pdf",
        "doc",
        "docx",
        "txt",
        "xls",
        "xlsx",
        "csv",
        "rtf",
        "ods",
        "ppt",
        "odp",
        "md",
        "html",
        "htm",
        "epub",
        "pages",
        "fig",
        "psd",
        "ai",
        "indd",
        "xd",
        "sketch",
        "afdesign",
        "afphoto",
        "afphoto",
    ];
    const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];
    const videoExtensions = ["mp4", "avi", "mov", "mkv", "webm"];
    const audioExtensions = ["mp3", "wav", "ogg", "flac"];
    if (documentExtensions.includes(extension))
        return { type: "document", extension };
    if (imageExtensions.includes(extension))
        return { type: "image", extension };
    if (videoExtensions.includes(extension))
        return { type: "video", extension };
    if (audioExtensions.includes(extension))
        return { type: "audio", extension };
    return { type: "other", extension };
};
export const formatDateTime = (isoString: string | null | undefined) => {
    if (!isoString)
        return "—";
    const date = new Date(isoString);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    const time = `${hours}:${minutes.toString().padStart(2, "0")}${period}`;
    const day = date.getDate();
    const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    const month = monthNames[date.getMonth()];
    return `${time}, ${day} ${month}`;
};
export const getFileIcon = (extension: string | undefined, type: FileType | string) => {
    switch (extension) {
        case "pdf":
            return "/gdrive/assets/icons/file-pdf.svg";
        case "doc":
            return "/gdrive/assets/icons/file-doc.svg";
        case "docx":
            return "/gdrive/assets/icons/file-docx.svg";
        case "csv":
            return "/gdrive/assets/icons/file-csv.svg";
        case "txt":
            return "/gdrive/assets/icons/file-txt.svg";
        case "xls":
        case "xlsx":
            return "/gdrive/assets/icons/file-document.svg";
        case "svg":
            return "/gdrive/assets/icons/file-image.svg";
        case "mkv":
        case "mov":
        case "avi":
        case "wmv":
        case "mp4":
        case "flv":
        case "webm":
        case "m4v":
        case "3gp":
            return "/gdrive/assets/icons/file-video.svg";
        case "mp3":
        case "mpeg":
        case "wav":
        case "aac":
        case "flac":
        case "ogg":
        case "wma":
        case "m4a":
        case "aiff":
        case "alac":
            return "/gdrive/assets/icons/file-audio.svg";
        default:
            switch (type) {
                case "image":
                    return "/gdrive/assets/icons/file-image.svg";
                case "document":
                    return "/gdrive/assets/icons/file-document.svg";
                case "video":
                    return "/gdrive/assets/icons/file-video.svg";
                case "audio":
                    return "/gdrive/assets/icons/file-audio.svg";
                default:
                    return "/gdrive/assets/icons/file-other.svg";
            }
    }
};
export const constructFileUrl = (bucketFileId: string) => {
    return `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${process.env.NEXT_PUBLIC_APPWRITE_BUCKET}/files/${bucketFileId}/view?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT}`;
};
export const constructDownloadUrl = (bucketFileId: string) => {
    return `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${process.env.NEXT_PUBLIC_APPWRITE_BUCKET}/files/${bucketFileId}/download?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT}`;
};
export const getUsageSummary = (totalSpace: any, starredSummary?: {
    count: number;
    size: number;
    latestDate: string;
}) => {
    const starred = starredSummary ?? { count: 0, size: 0, latestDate: "" };
    return [
        {
            title: "Documents",
            size: totalSpace.document.size,
            latestDate: totalSpace.document.latestDate,
            icon: "/gdrive/assets/icons/file-document-light.svg",
            url: drivePath("/documents"),
        },
        {
            title: "Images",
            size: totalSpace.image.size,
            latestDate: totalSpace.image.latestDate,
            icon: "/gdrive/assets/icons/file-image-light.svg",
            url: drivePath("/images"),
        },
        {
            title: "Media",
            size: totalSpace.video.size + totalSpace.audio.size,
            latestDate: totalSpace.video.latestDate > totalSpace.audio.latestDate
                ? totalSpace.video.latestDate
                : totalSpace.audio.latestDate,
            icon: "/gdrive/assets/icons/file-video-light.svg",
            url: drivePath("/media"),
        },
        {
            title: "Starred",
            size: starred.size,
            latestDate: starred.latestDate,
            icon: "/gdrive/assets/icons/star-light.svg",
            url: drivePath("/starred"),
        },
    ];
};
export const getFileTypesParams = (type: string) => {
    switch (type) {
        case "documents":
            return ["document"];
        case "images":
            return ["image"];
        case "media":
            return ["video", "audio"];
        case "others":
            return ["other"];
        default:
            return ["document"];
    }
};
