import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ folderId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { folderId } = await ctx.params;
    const db = supabaseForUserData();
    try {
        const body = await req.json().catch(() => ({}));
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        if (!name) {
            return NextResponse.json({ error: "name required" }, { status: 400 });
        }
        const { data, error } = await db
            .from("note_folders")
            .update({ name })
            .eq("id", folderId)
            .eq("user_id", user.id)
            .select("id,name,sort_order,created_at")
            .single();
        if (error) {
            throw error;
        }
        if (!data) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({
            folder: {
                id: String(data.id),
                name: String(data.name ?? ""),
                sortOrder: Number(data.sort_order ?? 0),
                createdAt: String(data.created_at ?? ""),
            },
        });
    }
    catch (e) {
        console.error("note_folders PATCH", e);
        return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
    }
}

export async function DELETE(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { folderId } = await ctx.params;
    const db = supabaseForUserData();
    try {
        const { error } = await db
            .from("note_folders")
            .delete()
            .eq("id", folderId)
            .eq("user_id", user.id);
        if (error) {
            throw error;
        }
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("note_folders DELETE", e);
        return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }
}
