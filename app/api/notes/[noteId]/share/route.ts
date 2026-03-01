import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { getNoteAccess } from "@/lib/notes-access";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ noteId: string }> };

/** Giống signin/signup: username trong DB luôn lowercase. */
function normUsername(raw: string): string {
    return raw.trim().toLowerCase();
}

/** List people this note is shared with (owner only). */
export async function GET(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { noteId } = await ctx.params;
    const db = supabaseForUserData();
    const access = await getNoteAccess(db, user.id, noteId);
    if (!access || access.kind !== "owner") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
        const { data: rows, error } = await db
            .from("note_shares")
            .select("id, role, shared_with_user_id, created_at")
            .eq("note_id", noteId)
            .order("created_at", { ascending: true });
        if (error) {
            throw error;
        }
        const ids = [...new Set((rows ?? []).map((r) => r.shared_with_user_id))];
        const names = new Map<string, string>();
        if (ids.length > 0) {
            const { data: users, error: uErr } = await db
                .from("auth_users")
                .select("id, username")
                .in("id", ids);
            if (!uErr && users) {
                for (const u of users) {
                    names.set(u.id, u.username ?? "");
                }
            }
        }
        const list = (rows ?? []).map((r) => ({
            id: r.id,
            role: r.role,
            username: names.get(r.shared_with_user_id) ?? "",
            sharedWithUserId: r.shared_with_user_id,
            createdAt: r.created_at,
        }));
        return NextResponse.json({ shares: list });
    }
    catch (e) {
        console.error("note shares GET", e);
        return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
    }
}

/** Share with a user by username (owner only). */
export async function POST(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { noteId } = await ctx.params;
    const db = supabaseForUserData();
    const access = await getNoteAccess(db, user.id, noteId);
    if (!access || access.kind !== "owner") {
        return NextResponse.json({ error: "Only the owner can share this note" }, { status: 403 });
    }
    let body: unknown;
    try {
        body = await req.json();
    }
    catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const username = normUsername(
        typeof (body as { username?: unknown }).username === "string"
            ? (body as { username: string }).username
            : "",
    );
    const roleRaw = (body as { role?: unknown }).role;
    const role = roleRaw === "viewer" ? "viewer" : "editor";

    if (!username) {
        return NextResponse.json({ error: "username required" }, { status: 400 });
    }

    const { data: target, error: findErr } = await db
        .from("auth_users")
        .select("id, username")
        .eq("username", username)
        .maybeSingle();
    if (findErr || !target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (target.id === user.id) {
        return NextResponse.json({ error: "Cannot share with yourself" }, { status: 400 });
    }

    const { data: inserted, error: insErr } = await db
        .from("note_shares")
        .insert({
            note_id: noteId,
            shared_by_user_id: user.id,
            shared_with_user_id: target.id,
            role,
        })
        .select("id, role, created_at")
        .single();

    if (insErr) {
        if (insErr.code === "23505") {
            return NextResponse.json({ error: "Already shared with this user" }, { status: 409 });
        }
        console.error("note_shares insert", insErr);
        return NextResponse.json({ error: "Failed to share" }, { status: 500 });
    }

    return NextResponse.json({
        id: inserted.id,
        role: inserted.role,
        username: target.username,
        sharedWithUserId: target.id,
        createdAt: inserted.created_at,
    });
}

/** Revoke share by username (owner only). */
export async function DELETE(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { noteId } = await ctx.params;
    const db = supabaseForUserData();
    const access = await getNoteAccess(db, user.id, noteId);
    if (!access || access.kind !== "owner") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    let body: unknown;
    try {
        body = await req.json();
    }
    catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const username = normUsername(
        typeof (body as { username?: unknown }).username === "string"
            ? (body as { username: string }).username
            : "",
    );
    if (!username) {
        return NextResponse.json({ error: "username required" }, { status: 400 });
    }
    const { data: target, error: findErr } = await db
        .from("auth_users")
        .select("id")
        .eq("username", username)
        .maybeSingle();
    if (findErr || !target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const { error: delErr } = await db
        .from("note_shares")
        .delete()
        .eq("note_id", noteId)
        .eq("shared_with_user_id", target.id);
    if (delErr) {
        console.error("note_shares delete", delErr);
        return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
