/**
 * Detect PostgREST / Postgres errors when `notes.folder_id` is not migrated yet.
 */
export function isMissingNotesFolderIdColumnError(err: unknown): boolean {
    const m = String((err as { message?: string; code?: string })?.message ?? err)
        .toLowerCase();
    if (!m.includes("folder_id")) {
        return false;
    }
    return (
        m.includes("does not exist") ||
        m.includes("schema cache") ||
        m.includes("could not find") ||
        m.includes("undefined column") ||
        m.includes("column") && m.includes("notes")
    );
}

export const NOTE_ROW_SELECT_EXT =
    "id,title,body,pinned,created_at,updated_at,folder_id";
export const NOTE_ROW_SELECT_BASE =
    "id,title,body,pinned,created_at,updated_at";
export const NOTE_ROW_SHARED_EXT =
    "id,title,body,pinned,created_at,updated_at,user_id,folder_id";
export const NOTE_ROW_SHARED_BASE =
    "id,title,body,pinned,created_at,updated_at,user_id";
