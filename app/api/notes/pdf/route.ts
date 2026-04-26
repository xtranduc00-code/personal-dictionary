import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import {
    NOTES_PDF_BUCKET,
    notesPdfStoragePath,
    sanitizePdfFileName,
} from "@/lib/notes-pdf-storage";
import { NOTE_ROW_SELECT_EXT } from "@/lib/notes-db-compat";
import { supabaseForUserData } from "@/lib/supabase-server";

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
    }
    const rawName =
        (file as Blob & { name?: string }).name ||
        (typeof form.get("fileName") === "string" ? String(form.get("fileName")) : "document.pdf");
    const fileName = sanitizePdfFileName(rawName);
    if (!/\.pdf$/i.test(fileName)) {
        return NextResponse.json({ error: "Only .pdf files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
        return NextResponse.json(
            { error: `File too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB)` },
            { status: 413 },
        );
    }
    if (file.type && !/pdf/i.test(file.type)) {
        return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    const folderIdRaw = form.get("folderId");
    let folderId: string | null = null;
    if (typeof folderIdRaw === "string" && folderIdRaw.trim()) {
        folderId = folderIdRaw.trim();
    }

    const db = supabaseForUserData();

    if (folderId !== null) {
        const { data: f, error: fErr } = await db
            .from("note_folders")
            .select("id")
            .eq("id", folderId)
            .eq("user_id", user.id)
            .maybeSingle();
        if (fErr || !f) {
            return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
        }
    }

    // Insert the row first so we have a stable ID for the storage path. If
    // the upload fails afterwards we'll roll the row back.
    const insertRow: Record<string, unknown> = {
        user_id: user.id,
        title: fileName,
        body: "",
        note_type: "pdf",
    };
    if (folderId !== null) insertRow.folder_id = folderId;

    const ins = await db
        .from("notes")
        .insert(insertRow)
        .select(NOTE_ROW_SELECT_EXT)
        .single();
    if (ins.error || !ins.data) {
        console.error("[notes/pdf] insert", ins.error);
        return NextResponse.json(
            {
                error:
                    "Failed to create PDF note. The DB may need migration (notes_pdf_type.sql).",
            },
            { status: 500 },
        );
    }

    const noteId = String((ins.data as { id: string }).id);
    const storagePath = notesPdfStoragePath(String(user.id), noteId);
    const fileBlob: Blob = file;

    async function uploadOnce() {
        const buf = new Uint8Array(await fileBlob.arrayBuffer());
        return db.storage.from(NOTES_PDF_BUCKET).upload(storagePath, buf, {
            contentType: "application/pdf",
            upsert: true,
        });
    }

    try {
        let up = await uploadOnce();
        // Auto-create the bucket the first time. Supabase returns
        // "Bucket not found" with status 404 when the bucket is missing.
        if (up.error && /bucket.*not.*found/i.test(up.error.message ?? "")) {
            const created = await db.storage.createBucket(NOTES_PDF_BUCKET, {
                public: false,
                fileSizeLimit: MAX_BYTES,
                allowedMimeTypes: ["application/pdf"],
            });
            if (created.error && !/already exists/i.test(created.error.message ?? "")) {
                throw created.error;
            }
            up = await uploadOnce();
        }
        if (up.error) throw up.error;
    } catch (uploadErr) {
        console.error("[notes/pdf] upload failed, rolling back row", uploadErr);
        await db.from("notes").delete().eq("id", noteId).eq("user_id", user.id);
        const detail =
            uploadErr instanceof Error && uploadErr.message ? `: ${uploadErr.message}` : "";
        return NextResponse.json(
            { error: `Storage upload failed${detail}` },
            { status: 500 },
        );
    }

    // Persist the storage path on the row so the GET endpoint and the UI
    // know where to fetch the binary from. (Title stays the original
    // filename; body is the path so downstream code stays simple.)
    await db
        .from("notes")
        .update({ body: storagePath })
        .eq("id", noteId)
        .eq("user_id", user.id);

    const row = ins.data as {
        id: string;
        title: string | null;
        pinned: boolean | null;
        created_at: string;
        updated_at: string;
        folder_id?: string | null;
    };
    return NextResponse.json({
        id: noteId,
        title: row.title ?? fileName,
        body: storagePath,
        pinned: Boolean(row.pinned),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        folderId: row.folder_id != null ? String(row.folder_id) : null,
        folderName: null,
        labels: [],
        noteType: "pdf",
        access: "owner",
    });
}
