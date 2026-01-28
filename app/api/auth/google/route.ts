import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomHex } from "@/lib/auth-crypto";
import { getGoogleAppOAuthCredentials, resolveGoogleOAuthOrigin } from "@/lib/google-app-oauth";
const STATE_COOKIE = "kfc_google_oauth_state";
const STATE_MAX_AGE = 600;
export async function GET(req: Request) {
    const origin = resolveGoogleOAuthOrigin(req);
    const creds = getGoogleAppOAuthCredentials();
    if (!creds) {
        return NextResponse.redirect(`${origin}/auth/google/finish?error=config`);
    }
    const redirectUri = `${origin}/api/auth/google/callback`;
    const state = randomHex(24);
    const cookieStore = await cookies();
    cookieStore.set(STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: STATE_MAX_AGE,
    });
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", creds.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "online");
    authUrl.searchParams.set("prompt", "select_account");
    return NextResponse.redirect(authUrl.toString());
}
