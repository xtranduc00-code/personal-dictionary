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
import { formatDiaryTitle } from "@/lib/diary-note-utils";
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
    note_type?: string | null;
    diary_date?: string | null;
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
    const nt = r.note_type === "diary" ? "diary" : "note";
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
        noteType: nt,
        diaryDate: r.diary_date ?? null,
        access: extra.access,
        ...(extra.role ? { role: extra.role } : {}),
        ...(extra.ownerUsername ? { ownerUsername: extra.ownerUsername } : {}),
    };
}

/** YYYY-MM-DD */
const DIARY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const db = supabaseForUserData();
        const userId = String(user.id);
        const scope = new URL(req.url).searchParams.get("scope");

        if (scope === "diary") {
            let diaryQ = await db
                .from("notes")
                .select(NOTE_ROW_SELECT_EXT)
                .eq("user_id", userId)
                .eq("note_type", "diary")
                .order("diary_date", { ascending: false })
                .order("updated_at", { ascending: false })
                .limit(400);
            if (diaryQ.error && isMissingNotesDiaryColumnsError(diaryQ.error)) {
                return NextResponse.json([]);
            }
            if (diaryQ.error) {
                throw diaryQ.error;
            }
            const rows = (diaryQ.data ?? []) as NoteDbRow[];
            const { folderNameById, labelsByNoteId } = await enrichNotesWithFoldersAndLabels(
                db,
                rows.map((r) => ({ id: r.id, folder_id: r.folder_id ?? null })),
            );
            const list = rows.map((r) => {
                const fid = r.folder_id != null ? String(r.folder_id) : null;
                return mapNoteRow(r, { access: "owner" }, {
                    folderName: fid ? (folderNameById.get(fid) ?? null) : null,
                    labels: labelsByNoteId.get(String(r.id)) ?? [],
                });
            });
            return NextResponse.json(list);
        }

        const ownedExt = await db
            .from("notes")
            .select(NOTE_ROW_SELECT_EXT)
            .eq("user_id", userId)
            .neq("note_type", "diary")
            .order("pinned", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(500);

        const ownedAfterDiary =
            ownedExt.error && isMissingNotesDiaryColumnsError(ownedExt.error)
                ? await db
                      .from("notes")
                      .select(NOTE_ROW_SELECT_EXT_NO_DIARY)
                      .eq("user_id", userId)
                      .order("pinned", { ascending: false })
                      .order("updated_at", { ascending: false })
                      .limit(500)
                : ownedExt;

        const ownedFallbackFolder =
            ownedAfterDiary.error && isMissingNotesFolderIdColumnError(ownedAfterDiary.error)
                ? await db
                      .from("notes")
                      .select(NOTE_ROW_SELECT_BASE)
                      .eq("user_id", userId)
                      .order("pinned", { ascending: false })
                      .order("updated_at", { ascending: false })
                      .limit(500)
                : null;
        const ownedRes = ownedFallbackFolder ?? ownedAfterDiary;
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

        let sharedNotes: Array<NoteDbRow & { user_id: string }> = [];

        if (sharedIds.length > 0) {
            const sharedExt = await db
                .from("notes")
                .select(NOTE_ROW_SHARED_EXT)
                .in("id", sharedIds);
            const sharedAfterDiary =
                sharedExt.error && isMissingNotesDiaryColumnsError(sharedExt.error)
                    ? await db
                          .from("notes")
                          .select(NOTE_ROW_SHARED_EXT_NO_DIARY)
                          .in("id", sharedIds)
                    : sharedExt;
            const sharedFb =
                sharedAfterDiary.error && isMissingNotesFolderIdColumnError(sharedAfterDiary.error)
                    ? await db
                          .from("notes")
                          .select(NOTE_ROW_SHARED_BASE)
                          .in("id", sharedIds)
                    : null;
            const sharedRes = sharedFb ?? sharedAfterDiary;
            const { data: sn, error: nErr } = sharedRes;
            if (nErr) {
                throw nErr;
            }
            sharedNotes = (sn ?? []) as Array<NoteDbRow & { user_id: string }>;
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

        const sharedFiltered = sharedNotes.filter((r) => r.note_type !== "diary");

        const mergedRows: NoteDbRow[] = [
            ...(owned ?? []).map((r) => {
                const row = r as NoteDbRow;
                return { ...row, folder_id: row.folder_id ?? null };
            }),
            ...sharedFiltered.map((r) => {
                const row = r as NoteDbRow & { user_id: string };
                return {
                    id: row.id,
                    title: row.title,
                    body: row.body,
                    pinned: row.pinned,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    folder_id: row.folder_id ?? null,
                    note_type: row.note_type,
                    diary_date: row.diary_date,
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
        const sharedList = sharedFiltered.map((r) => {
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
                    note_type: sr.note_type,
                    diary_date: sr.diary_date,
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
        const dbIns = supabaseForUserData();

        if (body?.noteType === "diary") {
            const rawDate = typeof body?.diaryDate === "string" ? body.diaryDate.trim() : "";
            if (!DIARY_DATE_RE.test(rawDate)) {
                return NextResponse.json({ error: "Invalid diaryDate (use YYYY-MM-DD)." }, {
                    status: 400,
                });
            }
            const locale =
                body?.locale === "vi" ? "vi" : "en";
            const bodyText = typeof body?.body === "string" ? body.body : "";
            let title =
                typeof body?.title === "string" && body.title.trim()
                    ? body.title.trim()
                    : formatDiaryTitle(rawDate, locale);

            const existing = await dbIns
                .from("notes")
                .select(NOTE_ROW_SELECT_EXT)
                .eq("user_id", user.id)
                .eq("note_type", "diary")
                .eq("diary_date", rawDate)
                .maybeSingle();

            if (existing.error && !isMissingNotesDiaryColumnsError(existing.error)) {
                throw existing.error;
            }
            if (existing.error && isMissingNotesDiaryColumnsError(existing.error)) {
                return NextResponse.json(
                    { error: "Diary requires database migration (notes_diary_columns.sql)." },
                    { status: 503 },
                );
            }
            if (existing.data) {
                const row = existing.data as NoteDbRow;
                const { folderNameById, labelsByNoteId } = await enrichNotesWithFoldersAndLabels(
                    dbIns,
                    [{ id: row.id, folder_id: row.folder_id ?? null }],
                );
                const fid = row.folder_id != null ? String(row.folder_id) : null;
                return NextResponse.json(
                    mapNoteRow(row, { access: "owner" }, {
                        folderName: fid ? (folderNameById.get(fid) ?? null) : null,
                        labels: labelsByNoteId.get(String(row.id)) ?? [],
                    }),
                );
            }

            const insertRow: Record<string, unknown> = {
                user_id: user.id,
                title,
                body: bodyText,
                note_type: "diary",
                diary_date: rawDate,
                folder_id: null,
            };

            let ins = await dbIns
                .from("notes")
                .insert(insertRow)
                .select(NOTE_ROW_SELECT_EXT)
                .single();

            if (ins.error?.code === "23505") {
                const again = await dbIns
                    .from("notes")
                    .select(NOTE_ROW_SELECT_EXT)
                    .eq("user_id", user.id)
                    .eq("note_type", "diary")
                    .eq("diary_date", rawDate)
                    .maybeSingle();
                if (again.data) {
                    const row = again.data as NoteDbRow;
                    const { folderNameById, labelsByNoteId } = await enrichNotesWithFoldersAndLabels(
                        dbIns,
                        [{ id: row.id, folder_id: row.folder_id ?? null }],
                    );
                    const fid = row.folder_id != null ? String(row.folder_id) : null;
                    return NextResponse.json(
                        mapNoteRow(row, { access: "owner" }, {
                            folderName: fid ? (folderNameById.get(fid) ?? null) : null,
                            labels: labelsByNoteId.get(String(row.id)) ?? [],
                        }),
                    );
                }
            }

            if (ins.error && isMissingNotesFolderIdColumnError(ins.error)) {
                const legacy = { ...insertRow };
                delete legacy.folder_id;
                ins = await dbIns
                    .from("notes")
                    .insert(legacy)
                    .select(NOTE_ROW_SELECT_EXT)
                    .single();
            }
            const { data, error } = ins;
            if (error) {
                throw error;
            }

            const { folderNameById, labelsByNoteId } = await enrichNotesWithFoldersAndLabels(
                dbIns,
                [{ id: data.id, folder_id: data.folder_id ?? null }],
            );
            const fid = data.folder_id != null ? String(data.folder_id) : null;
            return NextResponse.json(
                mapNoteRow(data as NoteDbRow, { access: "owner" }, {
                    folderName: fid ? (folderNameById.get(fid) ?? null) : null,
                    labels: labelsByNoteId.get(String(data.id)) ?? [],
                }),
            );
        }

        const title = typeof body?.title === "string" ? body.title : "";
        const bodyText = typeof body?.body === "string" ? body.body : "";
        const folderIdRaw = body?.folderId;
        let folderId: string | null = null;
        if (folderIdRaw === null) {
            folderId = null;
        }
        else if (typeof folderIdRaw === "string" && folderIdRaw.trim()) {
            const { data: f, error: fErr } = await dbIns
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

        let ins = await dbIns
            .from("notes")
            .insert(insertRow)
            .select(NOTE_ROW_SELECT_EXT)
            .single();
        if (ins.error && isMissingNotesDiaryColumnsError(ins.error)) {
            const legacyInsert = { ...insertRow };
            ins = await dbIns
                .from("notes")
                .insert(legacyInsert)
                .select(NOTE_ROW_SELECT_EXT_NO_DIARY)
                .single();
        }
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
