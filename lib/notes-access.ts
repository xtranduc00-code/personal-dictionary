import type { SupabaseClient } from "@supabase/supabase-js";

export type NoteAccess = { kind: "owner" } | { kind: "shared"; role: "viewer" | "editor" };

/**
 * Resolve whether the user can access a note (owner or share recipient).
 */
export async function getNoteAccess(
    db: SupabaseClient,
    userId: string,
    noteId: string,
): Promise<NoteAccess | null> {
    const { data: note, error: nErr } = await db
        .from("notes")
        .select("id, user_id")
        .eq("id", noteId)
        .maybeSingle();
    if (nErr || !note) {
        return null;
    }
    if (note.user_id === userId) {
        return { kind: "owner" };
    }
    const { data: row, error: sErr } = await db
        .from("note_shares")
        .select("role")
        .eq("note_id", noteId)
        .eq("shared_with_user_id", userId)
        .maybeSingle();
    if (sErr || !row) {
        return null;
    }
    const role = row.role === "viewer" ? "viewer" : "editor";
    return { kind: "shared", role };
}
