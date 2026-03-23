/** Map legacy / SQL default folder titles to English UI labels (DB name unchanged). */
const LEGACY_FOLDER_UI_EN: Record<string, string> = {
    "Ghi chú cũ": "General",
};

export function noteFolderDisplayName(name: string | null | undefined): string | null {
    if (name == null || name === "") {
        return null;
    }
    return LEGACY_FOLDER_UI_EN[name] ?? name;
}
