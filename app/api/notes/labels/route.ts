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
            .from("note_labels")
            .select("id,name,created_at")
            .eq("user_id", user.id)
            .order("name", { ascending: true });
        if (error) {
            throw error;
        }
        const list = (data ?? []).map((r) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            createdAt: String(r.created_at ?? ""),
        }));
        return NextResponse.json({ labels: list });
    }
    catch (e) {
        console.error("note_labels GET", e);
        return NextResponse.json({ error: "Failed to load labels" }, { status: 500 });
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
        const lower = name.toLowerCase();
        const { data: existing, error: exErr } = await db
            .from("note_labels")
            .select("id,name,created_at")
            .eq("user_id", user.id);
        if (exErr) {
            throw exErr;
        }
        const dup = (existing ?? []).find(
            (r) => String(r.name ?? "").trim().toLowerCase() === lower,
        );
        if (dup) {
            return NextResponse.json({
                label: {
                    id: String(dup.id),
                    name: String(dup.name ?? ""),
                    createdAt: String(dup.created_at ?? ""),
                },
                existed: true,
            });
        }
        const { data, error } = await db
            .from("note_labels")
            .insert({ user_id: user.id, name })
            .select("id,name,created_at")
            .single();
        if (error) {
            throw error;
        }
        return NextResponse.json({
            label: {
                id: String(data.id),
                name: String(data.name ?? ""),
                createdAt: String(data.created_at ?? ""),
            },
            existed: false,
        });
    }
    catch (e) {
        console.error("note_labels POST", e);
        return NextResponse.json({ error: "Failed to create label" }, { status: 500 });
    }
}
