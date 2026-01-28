import { NextResponse } from "next/server";
import { supabaseForUserData } from "@/lib/supabase-server";
import { sha256Hex } from "@/lib/auth-crypto";
import { passwordValidationError } from "@/lib/auth-credentials";
import { hashPassword } from "@/lib/password";
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const token = typeof body?.token === "string" ? body.token.trim() : "";
        if (!token) {
            return NextResponse.json({ error: "Reset token is required" }, { status: 400 });
        }
        const pwErr = passwordValidationError(body?.password);
        if (pwErr) {
            return NextResponse.json({ error: pwErr }, { status: 400 });
        }
        const password = body.password as string;
        const confirm = body.confirmPassword ?? body.confirm_password;
        if (typeof confirm !== "string" || password !== confirm) {
            return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
        }
        const token_hash = sha256Hex(token);
        const db = supabaseForUserData();
        const { data: row, error: findErr } = await db
            .from("auth_password_reset_tokens")
            .select("id, user_id, expires_at, used_at")
            .eq("token_hash", token_hash)
            .maybeSingle();
        if (findErr || !row || row.used_at) {
            return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
        }
        if (new Date(row.expires_at as string) < new Date()) {
            return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
        }
        const password_hash = await hashPassword(password);
        const { error: userErr } = await db
            .from("auth_users")
            .update({ password_hash })
            .eq("id", row.user_id);
        if (userErr) {
            return NextResponse.json({ error: "Could not update password" }, { status: 500 });
        }
        await db
            .from("auth_password_reset_tokens")
            .update({ used_at: new Date().toISOString() })
            .eq("id", row.id);
        await db.from("auth_sessions").delete().eq("user_id", row.user_id);
        return NextResponse.json({ ok: true });
    }
    catch {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
}
