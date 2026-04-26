import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { getNoteAccess } from "@/lib/notes-access";
import { NOTES_PDF_BUCKET, notesPdfStoragePath } from "@/lib/notes-pdf-storage";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ noteId: string }> };

export async function GET(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { noteId } = await ctx.params;
    const db = supabaseForUserData();

    const access = await getNoteAccess(db, String(user.id), noteId);
    if (!access) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Need the row to confirm note_type and (when shared) the owner's id —
    // the storage path is keyed by owner, not the requesting user.
    const { data: row, error } = await db
        .from("notes")
        .select("id, user_id, note_type, body, title")
        .eq("id", noteId)
        .maybeSingle();
    if (error || !row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const typed = row as {
        id: string;
        user_id: string;
        note_type: string | null;
        body: string | null;
        title: string | null;
    };
    if (typed.note_type !== "pdf") {
        return NextResponse.json({ error: "Not a PDF note" }, { status: 400 });
    }

    const storagePath =
        typeof typed.body === "string" && typed.body.trim()
            ? typed.body.trim()
            : notesPdfStoragePath(String(typed.user_id), noteId);

    const dl = await db.storage.from(NOTES_PDF_BUCKET).download(storagePath);
    if (dl.error || !dl.data) {
        console.error("[notes/pdf GET] download failed", dl.error);
        return NextResponse.json({ error: "PDF file missing" }, { status: 404 });
    }

    const buf = await dl.data.arrayBuffer();
    const fileName = (typed.title ?? "document.pdf").replace(/[\r\n"]/g, "_");
    return new Response(buf, {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(buf.byteLength),
            "Content-Disposition": `inline; filename="${fileName}"`,
            "Cache-Control": "private, max-age=60",
        },
    });
}
