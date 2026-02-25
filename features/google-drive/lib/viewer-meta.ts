export function driveMimeKindLabel(mime?: string): string {
    if (!mime)
        return "Google Drive";
    if (mime.includes("google-apps.document"))
        return "Google Docs";
    if (mime.includes("spreadsheet"))
        return "Google Sheets";
    if (mime.includes("presentation"))
        return "Google Slides";
    if (mime === "application/pdf")
        return "PDF";
    if (mime.startsWith("image/"))
        return "Image";
    if (mime.startsWith("video/"))
        return "Video";
    if (mime.startsWith("audio/"))
        return "Audio";
    return "File";
}
export function formatDriveModifiedShort(iso?: string): string | null {
    if (!iso)
        return null;
    try {
        const d = new Date(iso);
        const nowY = new Date().getFullYear();
        return `Last edited ${d.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            ...(d.getFullYear() !== nowY ? { year: "numeric" as const } : {}),
        })}`;
    }
    catch {
        return null;
    }
}
