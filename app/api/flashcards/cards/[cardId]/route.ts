import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";
export async function PATCH(req: Request, { params }: {
    params: Promise<{
        cardId: string;
    }>;
}) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { cardId } = await params;
    try {
        const body = await req.json();
        const word = typeof body?.word === "string" ? body.word.trim() : undefined;
        const definition = typeof body?.definition === "string" ? body.definition.trim() : undefined;
        if (word === undefined && definition === undefined) {
            return NextResponse.json({ error: "word or definition required" }, { status: 400 });
        }
        const updates: {
            word?: string;
            definition?: string;
        } = {};
        if (word !== undefined)
            updates.word = word;
        if (definition !== undefined)
            updates.definition = definition;
        const { data, error } = await supabaseServer
            .from("flashcard_cards")
            .update(updates)
            .eq("id", cardId)
            .eq("user_id", user.id)
            .select("id,set_id,word,definition,created_at")
            .single();
        if (error)
            throw error;
        return NextResponse.json({
            id: data.id,
            setId: data.set_id,
            word: data.word,
            definition: data.definition ?? "",
            createdAt: data.created_at,
        });
    }
    catch (e) {
        console.error("flashcards card PATCH", e);
        return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
    }
}
export async function DELETE(req: Request, { params }: {
    params: Promise<{
        cardId: string;
    }>;
}) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { cardId } = await params;
    try {
        const { error } = await supabaseServer
            .from("flashcard_cards")
            .delete()
            .eq("id", cardId)
            .eq("user_id", user.id);
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("flashcards card DELETE", e);
        return NextResponse.json({ error: "Failed to delete card" }, { status: 500 });
    }
}
