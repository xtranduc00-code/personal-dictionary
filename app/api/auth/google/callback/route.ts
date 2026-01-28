import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomHex } from "@/lib/auth-crypto";
import { getGoogleAppOAuthCredentials, resolveGoogleOAuthOrigin } from "@/lib/google-app-oauth";
import { ensureGoogleAppUser } from "@/lib/ensure-google-app-user";
import { supabaseForUserData } from "@/lib/supabase-server";
const STATE_COOKIE = "kfc_google_oauth_state";
const TOKEN_BYTES = 32;
type GoogleUserInfo = {
    email?: string;
    email_verified?: boolean;
    picture?: string;
};
export async function GET(req: Request) {
    const url = new URL(req.url);
    const origin = resolveGoogleOAuthOrigin(req);
    const finish = (err: string) => NextResponse.redirect(`${origin}/auth/google/finish?error=${encodeURIComponent(err)}`);
    const oauthError = url.searchParams.get("error");
    if (oauthError === "access_denied") {
        return finish("denied");
    }
    if (oauthError) {
        return finish("oauth");
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieStore = await cookies();
    const expected = cookieStore.get(STATE_COOKIE)?.value;
    cookieStore.delete(STATE_COOKIE);
    if (!code || !state || !expected || state !== expected) {
        return finish("invalid");
    }
    const creds = getGoogleAppOAuthCredentials();
    if (!creds) {
        return finish("config");
    }
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });
    if (!tokenRes.ok) {
        return finish("token");
    }
    const tokens = (await tokenRes.json()) as {
        access_token?: string;
    };
    const accessToken = tokens.access_token;
    if (!accessToken) {
        return finish("token");
    }
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
        return finish("profile");
    }
    const profile = (await userRes.json()) as GoogleUserInfo;
    const email = profile.email?.trim();
    if (!email || profile.email_verified === false) {
        return finish("email");
    }
    const googlePictureUrl = typeof profile.picture === "string" ? profile.picture.trim() : null;
    try {
        const user = await ensureGoogleAppUser({ email, googlePictureUrl });
        const db = supabaseForUserData();
        const sessionToken = randomHex(TOKEN_BYTES);
        const { error: sessionErr } = await db.from("auth_sessions").insert({
            user_id: user.id,
            token: sessionToken,
            expires_at: null,
        });
        if (sessionErr) {
            console.error("google oauth session", sessionErr);
            return finish("session");
        }
        return NextResponse.redirect(`${origin}/auth/google/finish?token=${encodeURIComponent(sessionToken)}`);
    }
    catch (e) {
        console.error("google oauth user", e);
        return finish("user");
    }
}
