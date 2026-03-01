import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";
export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const { data, error } = await supabaseServer
            .from("flashcard_sets")
            .select("id,name,created_at,pinned")
            .eq("user_id", user.id)
            .order("pinned", { ascending: false })
            .order("created_at", { ascending: false });
        if (error)
            throw error;
        const sets = (data ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            createdAt: r.created_at,
            pinned: r.pinned ?? false,
        }));
        return NextResponse.json(sets);
    }
    catch (e) {
        console.error("flashcards sets GET", e);
        return NextResponse.json({ error: "Failed to load sets" }, { status: 500 });
    }
}
export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json();
        const name = typeof body?.name === "string" ? body.name.trim() || "New set" : "New set";
        const { data, error } = await supabaseServer
            .from("flashcard_sets")
            .insert({ user_id: user.id, name })
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
        console.error("flashcards sets POST", e);
        return NextResponse.json({ error: "Failed to create set" }, { status: 500 });
    }
}
