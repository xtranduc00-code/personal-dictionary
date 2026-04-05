/**
 * Detect PostgREST / Postgres errors when `notes.folder_id` is not migrated yet.
 */
export function isMissingNotesDiaryColumnsError(err: unknown): boolean {
    const m = String((err as { message?: string; code?: string })?.message ?? err)
        .toLowerCase();
    if (!m.includes("note_type") && !m.includes("diary_date")) {
        return false;
    }
    return (
        m.includes("does not exist") ||
        m.includes("schema cache") ||
        m.includes("could not find") ||
        m.includes("undefined column") ||
        (m.includes("column") && m.includes("notes"))
    );
}

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

/** Full row (folders + diary columns). */
export const NOTE_ROW_SELECT_EXT =
    "id,title,body,pinned,created_at,updated_at,folder_id,note_type,diary_date";
/** After folders migration, before diary columns. */
export const NOTE_ROW_SELECT_EXT_NO_DIARY =
    "id,title,body,pinned,created_at,updated_at,folder_id";
export const NOTE_ROW_SELECT_BASE =
    "id,title,body,pinned,created_at,updated_at";
export const NOTE_ROW_SHARED_EXT =
    "id,title,body,pinned,created_at,updated_at,user_id,folder_id,note_type,diary_date";
export const NOTE_ROW_SHARED_EXT_NO_DIARY =
    "id,title,body,pinned,created_at,updated_at,user_id,folder_id";
export const NOTE_ROW_SHARED_BASE =
    "id,title,body,pinned,created_at,updated_at,user_id";
