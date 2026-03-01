import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { getNoteAccess } from "@/lib/notes-access";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ noteId: string }> };

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

        if (access.kind === "shared" && pinned !== undefined) {
            return NextResponse.json({ error: "Cannot change pin on a shared note" }, { status: 403 });
        }

        if (title === undefined && bodyText === undefined && pinned === undefined) {
            return NextResponse.json({ error: "title, body or pinned required" }, { status: 400 });
        }
        const updates: {
            title?: string;
            body?: string;
            pinned?: boolean;
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

        const ownerFilter =
            access.kind === "owner"
                ? db.from("notes").update(updates).eq("id", noteId).eq("user_id", user.id)
                : db.from("notes").update(updates).eq("id", noteId);

        const { data, error } = await ownerFilter.select("id,title,body,pinned,created_at,updated_at").single();
        if (error) {
            throw error;
        }
        return NextResponse.json({
            id: data.id,
            title: data.title ?? "",
            body: data.body ?? "",
            pinned: Boolean(data.pinned),
            createdAt: data.created_at,
            updatedAt: data.updated_at,
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
