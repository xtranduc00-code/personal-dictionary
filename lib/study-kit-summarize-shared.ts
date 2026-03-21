/** Shared limits + logging for Study Kit summarize (sync API + async jobs). */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCES = 10;
export const MAX_PASTE_CHARS = 400_000;
export const MAX_CUSTOM_SCOPE_CHARS = 3000;
export const SK_LOG = "[study-kit/summarize]";
export const STUDY_KIT_ASYNC_BUCKET = "study-kit-async-jobs";

export function parseInputMode(form: FormData): "file" | "paste" | "url" | "mixed" {
    const m = typeof form.get("inputMode") === "string" ? (form.get("inputMode") as string).trim() : "";
    if (m === "mixed")
        return "mixed";
    if (m === "paste")
        return "paste";
    if (m === "url")
        return "url";
    return "file";
}

export function sanitizeJobFileName(name: string): string {
    const n = name.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim().slice(0, 180);
    return n || "file";
}
