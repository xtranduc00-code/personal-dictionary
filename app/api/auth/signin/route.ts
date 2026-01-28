import { NextResponse } from "next/server";
import { supabaseForUserData } from "@/lib/supabase-server";
import { randomHex } from "@/lib/auth-crypto";
import { normalizeUsername, usernameValidationError, passwordValidationError, normalizeEmail, emailValidationError, isEmailLikeIdentifier, } from "@/lib/auth-credentials";
import { verifyPassword } from "@/lib/password";
const TOKEN_BYTES = 32;
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const raw = String(body?.login ?? body?.username ?? "").trim();
        if (!raw) {
            return NextResponse.json({ error: "Email/username and password are required" }, { status: 400 });
        }
        const pwErr = passwordValidationError(body?.password);
        if (pwErr) {
            return NextResponse.json({ error: pwErr }, { status: 400 });
        }
        const password = body.password as string;
        const db = supabaseForUserData();
        let user: {
            id: string;
            username: string;
            created_at: string;
            password_hash: string | null;
            email: string | null;
            avatar_url: string | null;
        } | null = null;
        if (isEmailLikeIdentifier(raw)) {
            const emailErr = emailValidationError(raw);
            if (emailErr) {
                return NextResponse.json({ error: emailErr }, { status: 400 });
            }
            const email = normalizeEmail(raw);
            const { data, error: findErr } = await db
                .from("auth_users")
                .select("id, username, created_at, password_hash, email, avatar_url")
                .eq("email", email)
                .maybeSingle();
            if (findErr) {
                return NextResponse.json({ error: "Invalid email/username or password" }, { status: 401 });
            }
            user = data;
        }
        else {
            const usernameErr = usernameValidationError(raw);
            if (usernameErr) {
                return NextResponse.json({ error: usernameErr }, { status: 400 });
            }
            const uname = normalizeUsername(raw);
            const { data, error: findErr } = await db
                .from("auth_users")
                .select("id, username, created_at, password_hash, email, avatar_url")
                .eq("username", uname)
                .maybeSingle();
            if (findErr) {
                return NextResponse.json({ error: "Invalid email/username or password" }, { status: 401 });
            }
            user = data;
        }
        if (!user) {
            return NextResponse.json({ error: "Invalid email/username or password" }, { status: 401 });
        }
        const hash = user.password_hash as string | null;
        if (!hash) {
            return NextResponse.json({
                error: "No password set yet. Use Forgot password with your account email if it’s on file, or contact support.",
            }, { status: 403 });
        }
        const match = await verifyPassword(password, hash);
        if (!match) {
            return NextResponse.json({ error: "Invalid email/username or password" }, { status: 401 });
        }
        const token = randomHex(TOKEN_BYTES);
        const { error: sessionErr } = await db.from("auth_sessions").insert({
            user_id: user.id,
            token,
            expires_at: null,
        });
        if (sessionErr) {
            return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
        }
        return NextResponse.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email ?? null,
                hasPassword: true,
                avatarUrl: user.avatar_url ?? null,
            },
            token,
        });
    }
    catch {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
}
