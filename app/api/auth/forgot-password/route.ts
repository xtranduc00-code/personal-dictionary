import { NextResponse } from "next/server";
import { supabaseForUserData } from "@/lib/supabase-server";
import { randomHex, sha256Hex } from "@/lib/auth-crypto";
import { normalizeEmail, emailValidationError } from "@/lib/auth-credentials";
import { sendPasswordResetEmail } from "@/lib/send-reset-email";
const TOKEN_BYTES = 32;
const RESET_TTL_MS = 60 * 60 * 1000;

/** Base URL for links inside transactional email (reset password). */
function publicOriginForEmailLinks(req: Request): string {
    const candidates = [process.env.AUTH_APP_BASE_URL?.trim(), process.env.NEXT_PUBLIC_SITE_URL?.trim()];
    for (const raw of candidates) {
        if (!raw) {
            continue;
        }
        try {
            return new URL(raw.replace(/\/$/, "")).origin;
        }
        catch {
            /* next */
        }
    }
    return new URL(req.url).origin;
}

function mailEnvFlags() {
    return {
        hasResendKey: Boolean(process.env.RESEND_API_KEY?.trim()),
        hasSmtp: Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()),
    };
}

type DevForgotDebug = {
    userFound: boolean;
    mailSent: boolean;
    hint: string;
    hasResendKey: boolean;
    hasSmtp: boolean;
    /** Resend/SMTP error text (development only). */
    mailError?: string;
};

function devForgotBody(base: { ok: true }, debug: DevForgotDebug) {
    if (process.env.NODE_ENV !== "development") {
        return base;
    }
    return { ...base, debug };
}

/** Same JSON whether or not the account exists (anti user enumeration). Production never includes `debug`. */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const emailErr = emailValidationError(body?.email ?? "");
        if (emailErr) {
            return NextResponse.json({ error: emailErr }, { status: 400 });
        }
        const email = normalizeEmail(body.email as string);
        const db = supabaseForUserData();
        const { data: user } = await db
            .from("auth_users")
            .select("id")
            .eq("email", email)
            .maybeSingle();
        const payload = { ok: true as const };
        const { hasResendKey, hasSmtp } = mailEnvFlags();
        if (!user) {
            return NextResponse.json(devForgotBody(payload, {
                userFound: false,
                mailSent: false,
                hasResendKey,
                hasSmtp,
                hint: "No auth_users row with this exact email — Resend was not called. Sign up with this email or fix the address in DB.",
            }));
        }
        const token = randomHex(TOKEN_BYTES);
        const token_hash = sha256Hex(token);
        const expires_at = new Date(Date.now() + RESET_TTL_MS).toISOString();
        await db
            .from("auth_password_reset_tokens")
            .delete()
            .eq("user_id", user.id)
            .is("used_at", null);
        const { error: insErr } = await db.from("auth_password_reset_tokens").insert({
            user_id: user.id,
            token_hash,
            expires_at,
        });
        if (insErr) {
            return NextResponse.json(devForgotBody({ ok: true }, {
                userFound: true,
                mailSent: false,
                hasResendKey,
                hasSmtp,
                hint: "Could not save reset token (check SUPABASE_SERVICE_ROLE_KEY and RLS). Resend not called.",
            }));
        }
        const base = publicOriginForEmailLinks(req);
        const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
        const { sent, mailError } = await sendPasswordResetEmail({ to: email, resetUrl });
        if (!sent) {
            console.error("[auth/forgot-password] reset email not sent:", mailError ?? "unknown");
        }
        /** Never return the reset URL to the client — user must open the link from email only. */
        return NextResponse.json(devForgotBody(payload, {
            userFound: true,
            mailSent: sent,
            hasResendKey,
            hasSmtp,
            mailError: sent ? undefined : mailError,
            hint: sent
                ? "Provider accepted — check inbox and spam."
                : hasResendKey || hasSmtp
                    ? "Mail API failed — full error is in the server log."
                    : "Add RESEND_API_KEY or SMTP_* and restart the dev server.",
        }));
    }
    catch (e) {
        const { hasResendKey, hasSmtp } = mailEnvFlags();
        return NextResponse.json(devForgotBody({ ok: true }, {
            userFound: false,
            mailSent: false,
            hasResendKey,
            hasSmtp,
            hint: `Server threw before send — ${e instanceof Error ? e.message : String(e)}`,
        }));
    }
}
