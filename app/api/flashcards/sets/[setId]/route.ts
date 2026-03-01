import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";
export async function PATCH(req: Request, { params }: {
    params: Promise<{
        setId: string;
    }>;
}) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { setId } = await params;
    try {
        const body = await req.json();
        const name = typeof body?.name === "string" ? body.name.trim() : undefined;
        const pinned = typeof body?.pinned === "boolean" ? body.pinned : undefined;
        if (name === undefined && pinned === undefined) {
            return NextResponse.json({ error: "nothing to update" }, { status: 400 });
        }
        const updates: Record<string, unknown> = {};
        if (name !== undefined)
            updates.name = name;
        if (pinned !== undefined)
            updates.pinned = pinned;
        const { data, error } = await supabaseServer
            .from("flashcard_sets")
            .update(updates)
            .eq("id", setId)
            .eq("user_id", user.id)
            .select("id,name,created_at,pinned")
            .single();
        if (error)
            throw error;
        return NextResponse.json({
            id: data.id,
            name: data.name,
            createdAt: data.created_at,
            pinned: data.pinned ?? false,
        });
    }
    catch (e) {
        console.error("flashcards set PATCH", e);
        return NextResponse.json({ error: "Failed to update set" }, { status: 500 });
    }
}
export async function DELETE(req: Request, { params }: {
    params: Promise<{
        setId: string;
    }>;
}) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { setId } = await params;
    try {
        const { error } = await supabaseServer
            .from("flashcard_sets")
            .delete()
            .eq("id", setId)
            .eq("user_id", user.id);
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("flashcards set DELETE", e);
        return NextResponse.json({ error: "Failed to delete set" }, { status: 500 });
    }
}
