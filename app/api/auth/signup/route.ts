import { NextResponse } from "next/server";
import { supabaseForUserData } from "@/lib/supabase-server";
import { randomHex } from "@/lib/auth-crypto";
import { normalizeUsername, usernameValidationError, passwordValidationError, normalizeEmail, emailValidationError, } from "@/lib/auth-credentials";
import { hashPassword } from "@/lib/password";
const TOKEN_BYTES = 32;
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const usernameErr = usernameValidationError(body?.username ?? "");
        if (usernameErr) {
            return NextResponse.json({ error: usernameErr }, { status: 400 });
        }
        const emailErr = emailValidationError(body?.email ?? "");
        if (emailErr) {
            return NextResponse.json({ error: emailErr }, { status: 400 });
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
        const rawUser = normalizeUsername(body.username);
        const email = normalizeEmail(body.email as string);
        const db = supabaseForUserData();
        const { data: existingUser } = await db
            .from("auth_users")
            .select("id")
            .eq("username", rawUser)
            .maybeSingle();
        if (existingUser) {
            return NextResponse.json({ error: "Username already taken" }, { status: 409 });
        }
        const { data: existingEmail } = await db
            .from("auth_users")
            .select("id")
            .eq("email", email)
            .maybeSingle();
        if (existingEmail) {
            return NextResponse.json({ error: "Email already registered" }, { status: 409 });
        }
        const password_hash = await hashPassword(password);
        const { data: user, error: insertErr } = await db
            .from("auth_users")
            .insert({ username: rawUser, email, password_hash })
            .select("id, username, created_at")
            .single();
        if (insertErr || !user) {
            return NextResponse.json({ error: insertErr?.message ?? "Failed to create user" }, { status: 500 });
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
                email,
                hasPassword: true,
                avatarUrl: null,
            },
            token,
        });
    }
    catch {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
}
