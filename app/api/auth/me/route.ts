import { NextResponse } from "next/server";
import { supabaseForUserData } from "@/lib/supabase-server";
export async function GET(req: Request) {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const db = supabaseForUserData();
    const { data: session } = await db
        .from("auth_sessions")
        .select("user_id")
        .eq("token", token)
        .maybeSingle();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: user } = await db
        .from("auth_users")
        .select("id, username, created_at, email, password_hash, avatar_url")
        .eq("id", session.user_id)
        .single();
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 401 });
    }
    return NextResponse.json({
        user: {
            id: user.id,
            username: user.username,
            email: user.email ?? null,
            hasPassword: Boolean(user.password_hash),
            avatarUrl: user.avatar_url ?? null,
        },
    });
}
