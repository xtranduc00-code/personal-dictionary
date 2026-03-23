import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("note_folders")
            .select("id,name,sort_order,created_at")
            .eq("user_id", user.id)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true });
        if (error) {
            throw error;
        }
        const list = (data ?? []).map((r) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            sortOrder: Number(r.sort_order ?? 0),
            createdAt: String(r.created_at ?? ""),
        }));
        return NextResponse.json({ folders: list });
    }
    catch (e) {
        console.error("note_folders GET", e);
        return NextResponse.json({ error: "Failed to load folders" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const body = await req.json().catch(() => ({}));
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        if (!name) {
            return NextResponse.json({ error: "name required" }, { status: 400 });
        }
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("note_folders")
            .insert({ user_id: user.id, name })
            .select("id,name,sort_order,created_at")
            .single();
        if (error) {
            throw error;
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
        console.error("note_folders POST", e);
        return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
    }
}
