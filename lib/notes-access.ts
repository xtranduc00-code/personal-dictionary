import type { SupabaseClient } from "@supabase/supabase-js";

export type NoteAccess = { kind: "owner" } | { kind: "shared"; role: "viewer" | "editor" };

async function getFolderShareRoleForNote(
    db: SupabaseClient,
    userId: string,
    note: { user_id: unknown; folder_id?: unknown },
): Promise<"viewer" | "editor" | null> {
    const ownerId = String(note.user_id ?? "");
    const noteFolderIdRaw = note.folder_id;
    const noteFolderId =
        noteFolderIdRaw != null && noteFolderIdRaw !== ""
            ? String(noteFolderIdRaw)
            : "";
    if (!ownerId || !noteFolderId) {
        return null;
    }
    try {
        const { data: shares, error: sErr } = await db
            .from("note_folder_shares")
            .select("folder_id, role")
            .eq("owner_user_id", ownerId)
            .eq("shared_with_user_id", userId);
        if (sErr || !shares || shares.length === 0) {
            return null;
        }
        const { data: folders, error: fErr } = await db
            .from("note_folders")
            .select("id,parent_id")
            .eq("user_id", ownerId);
        if (fErr || !folders) {
            return null;
        }
        const parentById = new Map<string, string | null>();
        for (const f of folders) {
            const id = String((f as { id?: unknown }).id ?? "");
            if (!id) continue;
            const parentRaw = (f as { parent_id?: unknown }).parent_id;
            parentById.set(
                id,
                parentRaw != null && parentRaw !== "" ? String(parentRaw) : null,
            );
        }
        const shareRoots = new Map<string, "viewer" | "editor">();
        for (const r of shares) {
            const fid = String((r as { folder_id?: unknown }).folder_id ?? "");
            if (!fid) continue;
            const role = (r as { role?: unknown }).role === "viewer" ? "viewer" : "editor";
            const prev = shareRoots.get(fid);
            if (!prev || (prev === "viewer" && role === "editor")) {
                shareRoots.set(fid, role);
            }
        }
        // Walk up from note's folder to root, check if any ancestor is shared.
        let cur: string | null = noteFolderId;
        let best: "viewer" | "editor" | null = null;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
            seen.add(cur);
            const r = shareRoots.get(cur);
            if (r) {
                if (!best || (best === "viewer" && r === "editor")) {
                    best = r;
                }
            }
            cur = parentById.get(cur) ?? null;
        }
        return best;
    } catch {
        return null;
    }
}

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
    if (!sErr && row) {
        const role = row.role === "viewer" ? "viewer" : "editor";
        return { kind: "shared", role };
    }
    const folderRole = await getFolderShareRoleForNote(db, userId, note);
    if (!folderRole) {
        return null;
    }
    return { kind: "shared", role: folderRole };
}
