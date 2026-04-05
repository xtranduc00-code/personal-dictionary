import { NextResponse } from "next/server";
import {
    isMissingNotesDiaryColumnsError,
    isMissingNotesFolderIdColumnError,
    NOTE_ROW_SELECT_BASE,
    NOTE_ROW_SELECT_EXT,
    NOTE_ROW_SELECT_EXT_NO_DIARY,
    NOTE_ROW_SHARED_BASE,
    NOTE_ROW_SHARED_EXT,
    NOTE_ROW_SHARED_EXT_NO_DIARY,
} from "@/lib/notes-db-compat";
import { enrichNotesWithFoldersAndLabels } from "@/lib/notes-enrich";
import { getAuthUser } from "@/lib/get-auth-user";
import { getNoteAccess } from "@/lib/notes-access";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ noteId: string }> };

async function selectNoteRow(
    db: ReturnType<typeof supabaseForUserData>,
    opts: { kind: "owner" | "shared"; userId: string; noteId: string },
) {
    const run = (select: string) => {
        let q = db.from("notes").select(select).eq("id", opts.noteId);
        if (opts.kind === "owner") {
            q = q.eq("user_id", opts.userId);
        }
        return q.maybeSingle();
    };

    let rowRes = await run(NOTE_ROW_SELECT_EXT);

    if (rowRes.error && isMissingNotesDiaryColumnsError(rowRes.error)) {
        const sel =
            opts.kind === "owner" ? NOTE_ROW_SELECT_EXT_NO_DIARY : NOTE_ROW_SHARED_EXT_NO_DIARY;
        rowRes = await run(sel);
    }

    if (rowRes.error && isMissingNotesFolderIdColumnError(rowRes.error)) {
        const sel = opts.kind === "owner" ? NOTE_ROW_SELECT_BASE : NOTE_ROW_SHARED_BASE;
        rowRes = await run(sel);
    }

    return rowRes;
}

/** Single-note fetch for refresh (e.g. shared note) without reloading the full list. */
export async function GET(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { noteId } = await ctx.params;
    const db = supabaseForUserData();
    const access = await getNoteAccess(db, user.id, noteId);
    if (!access) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
        const rowRes = await selectNoteRow(db, {
            kind: access.kind,
            userId: user.id,
            noteId,
        });
        if (rowRes.error) {
            throw rowRes.error;
        }
        const data = rowRes.data;
        if (!data) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const row = data as unknown as {
            id: string;
            title: string | null;
            body: string | null;
            pinned: boolean | null;
            created_at: string;
            updated_at: string;
            folder_id?: string | null;
            user_id?: string;
            note_type?: string | null;
            diary_date?: string | null;
        };
        const noteType = row.note_type === "diary" ? "diary" : "note";
        const diaryDate = row.diary_date ?? null;
        const { folderNameById, labelsByNoteId } = await enrichNotesWithFoldersAndLabels(db, [
            { id: String(row.id), folder_id: row.folder_id ?? null },
        ]);
        const fid = row.folder_id != null ? String(row.folder_id) : null;
        const folderName = fid ? (folderNameById.get(fid) ?? null) : null;
        const labels = labelsByNoteId.get(String(row.id)) ?? [];

        if (access.kind === "owner") {
            return NextResponse.json({
                id: String(row.id),
                title: row.title ?? "",
                body: row.body ?? "",
                pinned: Boolean(row.pinned),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                folderId: fid,
                folderName,
                labels,
                noteType,
                diaryDate,
                access: "owner",
            });
        }

        let ownerUsername = "";
        if (row.user_id) {
            const { data: ownerRow } = await db
                .from("auth_users")
                .select("username")
                .eq("id", row.user_id)
                .maybeSingle();
            ownerUsername = ownerRow?.username ?? "";
        }

        return NextResponse.json({
            id: String(row.id),
            title: row.title ?? "",
            body: row.body ?? "",
            pinned: Boolean(row.pinned),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            folderId: fid,
            folderName,
            labels,
            noteType,
            diaryDate,
            access: "shared",
            role: access.role,
            ownerUsername,
        });
    }
    catch (e) {
        console.error("notes GET one", e);
        return NextResponse.json({ error: "Failed to load note" }, { status: 500 });
    }
}

export async function PATCH(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { noteId } = await ctx.params;
    const db = supabaseForUserData();
    const access = await getNoteAccess(db, user.id, noteId);
    if (!access) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (access.kind === "shared" && access.role === "viewer") {
        return NextResponse.json({ error: "Read only" }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const title = typeof body?.title === "string" ? body.title : undefined;
        const bodyText = typeof body?.body === "string" ? body.body : undefined;
        const pinned = typeof body?.pinned === "boolean" ? body.pinned : undefined;
        const folderIdRaw = body?.folderId;
        const folderId =
            folderIdRaw === null
                ? null
                : typeof folderIdRaw === "string"
                  ? folderIdRaw.trim() || null
                  : undefined;
        const labelIdsRaw = body?.labelIds;
        const labelIds =
            Array.isArray(labelIdsRaw) && labelIdsRaw.every((x) => typeof x === "string")
                ? (labelIdsRaw as string[])
                : undefined;

        let isDiary = false;
        {
            let mq = db.from("notes").select("note_type").eq("id", noteId);
            if (access.kind === "owner") {
                mq = mq.eq("user_id", user.id);
            }
            const mr = await mq.maybeSingle();
            if (!mr.error && mr.data?.note_type === "diary") {
                isDiary = true;
            }
        }

        if (access.kind === "shared" && pinned !== undefined) {
            return NextResponse.json({ error: "Cannot change pin on a shared note" }, { status: 403 });
        }

        if (access.kind === "shared" && (folderId !== undefined || labelIds !== undefined)) {
            return NextResponse.json(
                { error: "Only the owner can change folder or labels" },
                { status: 403 },
            );
        }

        if (isDiary && access.kind === "owner") {
            if (folderId !== undefined) {
                return NextResponse.json(
                    { error: "Diary entries stay outside folders." },
                    { status: 400 },
                );
            }
            if (labelIds !== undefined) {
                return NextResponse.json(
                    { error: "Diary entries do not use labels." },
                    { status: 400 },
                );
            }
        }

        if (
            title === undefined &&
            bodyText === undefined &&
            pinned === undefined &&
            folderId === undefined &&
            labelIds === undefined
        ) {
            return NextResponse.json(
                { error: "title, body, pinned, folderId or labelIds required" },
                { status: 400 },
            );
        }
        const updates: {
            title?: string;
            body?: string;
            pinned?: boolean;
            folder_id?: string | null;
            updated_at?: string;
        } = {
            updated_at: new Date().toISOString(),
        };
        if (title !== undefined) {
            updates.title = title;
        }
        if (bodyText !== undefined) {
            updates.body = bodyText;
        }
        if (pinned !== undefined) {
            updates.pinned = pinned;
        }
        if (folderId !== undefined) {
            if (folderId === null) {
                updates.folder_id = null;
            }
            else {
                const { data: f, error: fErr } = await db
                    .from("note_folders")
                    .select("id")
                    .eq("id", folderId)
                    .eq("user_id", user.id)
                    .maybeSingle();
                if (fErr) {
                    console.warn(
                        "[notes PATCH] note_folders unavailable; skipping folder update",
                        fErr,
                    );
                }
                else if (!f) {
                    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
                }
                else {
                    updates.folder_id = f.id;
                }
            }
        }

        const runUpdate = (u: typeof updates) =>
            access.kind === "owner"
                ? db.from("notes").update(u).eq("id", noteId).eq("user_id", user.id)
                : db.from("notes").update(u).eq("id", noteId);

        let { error: uErr } = await runUpdate(updates);
        if (
            uErr &&
            updates.folder_id !== undefined &&
            isMissingNotesFolderIdColumnError(uErr)
        ) {
            const { folder_id: _drop, ...rest } = updates;
            ({ error: uErr } = await runUpdate(rest));
        }
        if (uErr) {
            throw uErr;
        }

        const rowRes = await selectNoteRow(db, {
            kind: access.kind,
            userId: user.id,
            noteId,
        });
        if (rowRes.error) {
            throw rowRes.error;
        }
        const data = rowRes.data;
        if (!data) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        if (labelIds !== undefined && access.kind === "owner") {
            const unique = [...new Set(labelIds.map(String))];
            try {
                if (unique.length > 0) {
                    const { data: labs, error: labErr } = await db
                        .from("note_labels")
                        .select("id")
                        .in("id", unique)
                        .eq("user_id", user.id);
                    if (labErr) {
                        throw labErr;
                    }
                    if ((labs?.length ?? 0) !== unique.length) {
                        return NextResponse.json({ error: "Invalid label id" }, { status: 400 });
                    }
                }
                const { error: delErr } = await db
                    .from("note_note_labels")
                    .delete()
                    .eq("note_id", noteId);
                if (delErr) {
                    throw delErr;
                }
                if (unique.length > 0) {
                    const { error: insErr } = await db.from("note_note_labels").insert(
                        unique.map((lid) => ({ note_id: noteId, label_id: lid })),
                    );
                    if (insErr) {
                        throw insErr;
                    }
                }
            }
            catch (labE) {
                console.warn("[notes PATCH] label sync skipped (tables missing or error)", labE);
            }
        }

        const typed = data as unknown as {
            id: string;
            title: string | null;
            body: string | null;
            pinned: boolean | null;
            created_at: string;
            updated_at: string;
            folder_id?: string | null;
            note_type?: string | null;
            diary_date?: string | null;
        };
        const { folderNameById, labelsByNoteId } = await enrichNotesWithFoldersAndLabels(db, [
            { id: typed.id, folder_id: typed.folder_id ?? null },
        ]);
        const fid = typed.folder_id != null ? String(typed.folder_id) : null;
        const noteType = typed.note_type === "diary" ? "diary" : "note";
        const diaryDate = typed.diary_date ?? null;
        return NextResponse.json({
            id: typed.id,
            title: typed.title ?? "",
            body: typed.body ?? "",
            pinned: Boolean(typed.pinned),
            createdAt: typed.created_at,
            updatedAt: typed.updated_at,
            folderId: fid,
            folderName: fid ? (folderNameById.get(fid) ?? null) : null,
            labels: labelsByNoteId.get(String(typed.id)) ?? [],
            noteType,
            diaryDate,
        });
    }
    catch (e) {
        console.error("notes PATCH", e);
        return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
    }
}

export async function DELETE(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { noteId } = await ctx.params;
    const db = supabaseForUserData();
    const access = await getNoteAccess(db, user.id, noteId);
    if (!access || access.kind !== "owner") {
        return NextResponse.json({ error: "Only the owner can delete this note" }, { status: 403 });
    }
    try {
        const { error } = await db.from("notes").delete().eq("id", noteId).eq("user_id", user.id);
        if (error) {
            throw error;
        }
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("notes DELETE", e);
        return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
    }
}
