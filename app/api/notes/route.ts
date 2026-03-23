import { NextResponse } from "next/server";
import {
    isMissingNotesFolderIdColumnError,
    NOTE_ROW_SELECT_BASE,
    NOTE_ROW_SELECT_EXT,
    NOTE_ROW_SHARED_BASE,
    NOTE_ROW_SHARED_EXT,
} from "@/lib/notes-db-compat";
import { enrichNotesWithFoldersAndLabels } from "@/lib/notes-enrich";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

type NoteDbRow = {
    id: string;
    title: string | null;
    body: string | null;
    pinned: boolean | null;
    created_at: string;
    updated_at: string;
    folder_id?: string | null;
};

function mapNoteRow(
    r: NoteDbRow,
    extra: {
        access: "owner" | "shared";
        role?: "viewer" | "editor";
        ownerUsername?: string;
    },
    org: { folderName: string | null; labels: { id: string; name: string }[] },
) {
    return {
        id: r.id,
        title: r.title ?? "",
        body: r.body ?? "",
        pinned: Boolean(r.pinned),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        folderId: r.folder_id != null ? String(r.folder_id) : null,
        folderName: org.folderName,
        labels: org.labels,
        access: extra.access,
        ...(extra.role ? { role: extra.role } : {}),
        ...(extra.ownerUsername ? { ownerUsername: extra.ownerUsername } : {}),
    };
}

export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const db = supabaseForUserData();
        const userId = String(user.id);
        const ownedFirst = await db
            .from("notes")
            .select(NOTE_ROW_SELECT_EXT)
            .eq("user_id", userId)
            .order("pinned", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(500);
        const ownedFallback =
            ownedFirst.error && isMissingNotesFolderIdColumnError(ownedFirst.error)
                ? await db
                      .from("notes")
                      .select(NOTE_ROW_SELECT_BASE)
                      .eq("user_id", userId)
                      .order("pinned", { ascending: false })
                      .order("updated_at", { ascending: false })
                      .limit(500)
                : null;
        const ownedRes = ownedFallback ?? ownedFirst;
        const { data: owned, error: oErr } = ownedRes;
        if (oErr) {
            throw oErr;
        }

        const { data: shareRows, error: sErr } = await db
            .from("note_shares")
            .select("note_id, role")
            .eq("shared_with_user_id", userId);
        if (sErr) {
            throw sErr;
        }

        const sharedIds = (shareRows ?? []).map((s) => String(s.note_id)).filter(Boolean);
        const roleByNote = new Map<string, "viewer" | "editor">(
            (shareRows ?? []).map((s) => [
                String(s.note_id),
                s.role === "viewer" ? ("viewer" as const) : ("editor" as const),
            ]),
        );

        let sharedNotes: Array<{
            id: string;
            title: string | null;
            body: string | null;
            pinned: boolean | null;
            created_at: string;
            updated_at: string;
            user_id: string;
            folder_id?: string | null;
        }> = [];

        if (sharedIds.length > 0) {
            const sharedFirst = await db
                .from("notes")
                .select(NOTE_ROW_SHARED_EXT)
                .in("id", sharedIds);
            const sharedFb =
                sharedFirst.error && isMissingNotesFolderIdColumnError(sharedFirst.error)
                    ? await db
                          .from("notes")
                          .select(NOTE_ROW_SHARED_BASE)
                          .in("id", sharedIds)
                    : null;
            const sharedRes = sharedFb ?? sharedFirst;
            const { data: sn, error: nErr } = sharedRes;
            if (nErr) {
                throw nErr;
            }
            sharedNotes = sn ?? [];
        }

        const ownerIds = [...new Set(sharedNotes.map((n) => String(n.user_id)))];
        const ownerNameById = new Map<string, string>();
        if (ownerIds.length > 0) {
            const { data: owners, error: uErr } = await db
                .from("auth_users")
                .select("id, username")
                .in("id", ownerIds);
            if (!uErr && owners) {
                for (const o of owners) {
                    ownerNameById.set(o.id, o.username ?? "");
                }
            }
        }

        const mergedRows: NoteDbRow[] = [
            ...(owned ?? []).map((r) => {
                const row = r as NoteDbRow;
                return { ...row, folder_id: row.folder_id ?? null };
            }),
            ...sharedNotes.map((r) => {
                const row = r as NoteDbRow & { user_id: string };
                return {
                    id: row.id,
                    title: row.title,
                    body: row.body,
                    pinned: row.pinned,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    folder_id: row.folder_id ?? null,
                };
            }),
        ];

        const { folderNameById, labelsByNoteId } = await enrichNotesWithFoldersAndLabels(
            db,
            mergedRows.map((r) => ({ id: r.id, folder_id: r.folder_id })),
        );

        const ownedList = (owned ?? []).map((r) => {
            const row = { ...(r as NoteDbRow), folder_id: (r as NoteDbRow).folder_id ?? null };
            const fid = row.folder_id != null ? String(row.folder_id) : null;
            return mapNoteRow(row, { access: "owner" }, {
                folderName: fid ? (folderNameById.get(fid) ?? null) : null,
                labels: labelsByNoteId.get(String(row.id)) ?? [],
            });
        });
        const sharedList = sharedNotes.map((r) => {
            const sr = r as NoteDbRow & { user_id: string };
            const fid = sr.folder_id != null ? String(sr.folder_id) : null;
            return mapNoteRow(
                {
                    id: sr.id,
                    title: sr.title,
                    body: sr.body,
                    pinned: sr.pinned,
                    created_at: sr.created_at,
                    updated_at: sr.updated_at,
                    folder_id: sr.folder_id ?? null,
                },
                {
                    access: "shared",
                    role: roleByNote.get(sr.id) ?? "editor",
                    ownerUsername: ownerNameById.get(sr.user_id) ?? "",
                },
                {
                    folderName: fid ? (folderNameById.get(fid) ?? null) : null,
                    labels: labelsByNoteId.get(String(sr.id)) ?? [],
                },
            );
        });

        const merged = [...ownedList, ...sharedList].sort((a, b) => {
            if (a.pinned !== b.pinned) {
                return a.pinned ? -1 : 1;
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        return NextResponse.json(merged);
    }
    catch (e) {
        console.error("notes GET", e);
        return NextResponse.json({ error: "Failed to load notes" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const body = await req.json().catch(() => ({}));
        const title = typeof body?.title === "string" ? body.title : "";
        const bodyText = typeof body?.body === "string" ? body.body : "";
        const folderIdRaw = body?.folderId;
        let folderId: string | null = null;
        if (folderIdRaw === null) {
            folderId = null;
        }
        else if (typeof folderIdRaw === "string" && folderIdRaw.trim()) {
            const db = supabaseForUserData();
            const { data: f, error: fErr } = await db
                .from("note_folders")
                .select("id")
                .eq("id", folderIdRaw.trim())
                .eq("user_id", user.id)
                .maybeSingle();
            if (fErr) {
                console.warn("[notes POST] note_folders unavailable; creating note without folder", fErr);
            }
            else if (!f) {
                return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
            }
            else {
                folderId = f.id;
            }
        }

        const insertRow: Record<string, unknown> = {
            user_id: user.id,
            title,
            body: bodyText,
        };
        if (folderId !== null) {
            insertRow.folder_id = folderId;
        }

        const dbIns = supabaseForUserData();
        let ins = await dbIns
            .from("notes")
            .insert(insertRow)
            .select(NOTE_ROW_SELECT_EXT)
            .single();
        if (ins.error && isMissingNotesFolderIdColumnError(ins.error)) {
            const legacyInsert = { ...insertRow };
            delete legacyInsert.folder_id;
            ins = await dbIns
                .from("notes")
                .insert(legacyInsert)
                .select(NOTE_ROW_SELECT_BASE)
                .single();
        }
        const { data, error } = ins;
        if (error) {
            throw error;
        }

        const { folderNameById, labelsByNoteId } = await enrichNotesWithFoldersAndLabels(
            supabaseForUserData(),
            [{ id: data.id, folder_id: data.folder_id ?? null }],
        );
        const fid =
            data.folder_id != null ? String(data.folder_id) : null;
        return NextResponse.json(
            mapNoteRow(data as NoteDbRow, { access: "owner" }, {
                folderName: fid ? (folderNameById.get(fid) ?? null) : null,
                labels: labelsByNoteId.get(String(data.id)) ?? [],
            }),
        );
    }
    catch (e) {
        console.error("notes POST", e);
        return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
    }
}
