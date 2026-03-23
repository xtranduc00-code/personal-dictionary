import type { SupabaseClient } from "@supabase/supabase-js";

export type NoteLabelRow = { id: string; name: string };

type NoteRowLike = { id: string; folder_id?: string | null };

/**
 * Batch-load folder names and per-note labels for a list of notes (one query each for links + labels + folders).
 * If folder/label tables are missing (migration not applied), returns empty maps — notes still load.
 */
export async function enrichNotesWithFoldersAndLabels(
    db: SupabaseClient,
    notes: NoteRowLike[],
): Promise<{
    folderNameById: Map<string, string>;
    labelsByNoteId: Map<string, NoteLabelRow[]>;
}> {
    try {
        const folderIds = [
            ...new Set(
                notes.map((n) => (n.folder_id ? String(n.folder_id) : "")).filter(Boolean),
            ),
        ];
        const noteIds = notes.map((n) => String(n.id));

        const folderNameById = new Map<string, string>();
        if (folderIds.length > 0) {
            const { data, error } = await db
                .from("note_folders")
                .select("id,name")
                .in("id", folderIds);
            if (error) {
                throw error;
            }
            for (const row of data ?? []) {
                folderNameById.set(String(row.id), String(row.name ?? ""));
            }
        }

        const labelsByNoteId = new Map<string, NoteLabelRow[]>();
        for (const id of noteIds) {
            labelsByNoteId.set(id, []);
        }

        if (noteIds.length === 0) {
            return { folderNameById, labelsByNoteId };
        }

        const { data: links, error: lErr } = await db
            .from("note_note_labels")
            .select("note_id,label_id")
            .in("note_id", noteIds);
        if (lErr) {
            throw lErr;
        }

        const labelIds = [
            ...new Set((links ?? []).map((x) => String(x.label_id)).filter(Boolean)),
        ];
        const labelNameById = new Map<string, string>();
        if (labelIds.length > 0) {
            const { data: labs, error: labErr } = await db
                .from("note_labels")
                .select("id,name")
                .in("id", labelIds);
            if (labErr) {
                throw labErr;
            }
            for (const row of labs ?? []) {
                labelNameById.set(String(row.id), String(row.name ?? ""));
            }
        }

        for (const link of links ?? []) {
            const nid = String(link.note_id);
            const lid = String(link.label_id);
            const name = labelNameById.get(lid);
            if (name === undefined) {
                continue;
            }
            const list = labelsByNoteId.get(nid);
            if (list) {
                list.push({ id: lid, name });
            }
        }

        for (const [, list] of labelsByNoteId) {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }

        return { folderNameById, labelsByNoteId };
    }
    catch (e) {
        console.warn("[notes-enrich] skipping folder/label enrich (tables missing or error)", e);
        const labelsByNoteId = new Map<string, NoteLabelRow[]>();
        for (const n of notes) {
            labelsByNoteId.set(String(n.id), []);
        }
        return { folderNameById: new Map<string, string>(), labelsByNoteId };
    }
}
