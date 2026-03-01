import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";
export async function GET(req: Request, { params }: {
    params: Promise<{
        setId: string;
    }>;
}) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { setId } = await params;
    try {
        const { data, error } = await supabaseServer
            .from("flashcard_cards")
            .select("id,set_id,word,definition,created_at")
            .eq("set_id", setId)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
        if (error)
            throw error;
        const cards = (data ?? []).map((r) => ({
            id: r.id,
            setId: r.set_id,
            word: r.word,
            definition: r.definition ?? "",
            createdAt: r.created_at,
        }));
        return NextResponse.json(cards);
    }
    catch (e) {
        console.error("flashcards cards GET", e);
        return NextResponse.json({ error: "Failed to load cards" }, { status: 500 });
    }
}
export async function POST(req: Request, { params }: {
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
        const word = typeof body?.word === "string" ? body.word.trim() : "";
        const definition = typeof body?.definition === "string" ? body.definition.trim() : "";
        const { data, error } = await supabaseServer
            .from("flashcard_cards")
            .insert({ user_id: user.id, set_id: setId, word, definition })
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
        console.error("flashcards cards POST", e);
        return NextResponse.json({ error: "Failed to add card" }, { status: 500 });
    }
}
