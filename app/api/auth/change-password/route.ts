import { NextResponse } from "next/server";
import { supabaseForUserData } from "@/lib/supabase-server";
import { passwordValidationError } from "@/lib/auth-credentials";
import { hashPassword, verifyPassword } from "@/lib/password";
export async function POST(req: Request) {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const body = await req.json();
        const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
        const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
        const confirm = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
        const npErr = passwordValidationError(newPassword);
        if (npErr) {
            return NextResponse.json({ error: npErr }, { status: 400 });
        }
        if (newPassword !== confirm) {
            return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
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
        const { data: row, error: userErr } = await db
            .from("auth_users")
            .select("id, password_hash")
            .eq("id", session.user_id)
            .single();
        if (userErr || !row) {
            return NextResponse.json({ error: "User not found" }, { status: 401 });
        }
        const hash = row.password_hash as string | null;
        if (!hash) {
            return NextResponse.json({ error: "No password set for this account" }, { status: 400 });
        }
        const ok = await verifyPassword(currentPassword, hash);
        if (!ok) {
            return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
        }
        const nextHash = await hashPassword(newPassword);
        const { error: updErr } = await db
            .from("auth_users")
            .update({ password_hash: nextHash })
            .eq("id", row.id);
        if (updErr) {
            return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    }
    catch {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
}
