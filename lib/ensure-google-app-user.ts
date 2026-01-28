import { supabaseForUserData } from "@/lib/supabase-server";
import { normalizeEmail, USERNAME_MIN, USERNAME_MAX } from "@/lib/auth-credentials";
import { randomHex } from "@/lib/auth-crypto";
function isLikelyGoogleAvatarUrl(url: string): boolean {
    try {
        return new URL(url).hostname.includes("googleusercontent.com");
    }
    catch {
        return false;
    }
}
async function maybeSyncGoogleProfilePhoto(userId: string, picture: string | null | undefined): Promise<void> {
    const next = picture?.trim();
    if (!next)
        return;
    const db = supabaseForUserData();
    const { data: row } = await db.from("auth_users").select("avatar_url").eq("id", userId).maybeSingle();
    const current = row?.avatar_url?.trim() || "";
    if (current && !isLikelyGoogleAvatarUrl(current)) {
        return;
    }
    await db.from("auth_users").update({ avatar_url: next }).eq("id", userId);
}
function suggestUsernameFromEmail(email: string): string {
    const local = email.split("@")[0] || "user";
    let base = local
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "") || "user";
    if (base.length < USERNAME_MIN) {
        base = `${base}_user`.slice(0, USERNAME_MAX);
    }
    return base.slice(0, USERNAME_MAX);
}
export async function ensureGoogleAppUser(params: {
    email: string;
    /** From Google userinfo `picture`; stored unless user already has a custom (non-Google) avatar. */
    googlePictureUrl?: string | null;
}): Promise<{
    id: string;
    username: string;
}> {
    const email = normalizeEmail(params.email);
    const db = supabaseForUserData();
    const { data: existing } = await db
        .from("auth_users")
        .select("id, username")
        .eq("email", email)
        .maybeSingle();
    if (existing) {
        await maybeSyncGoogleProfilePhoto(existing.id, params.googlePictureUrl);
        return { id: existing.id, username: existing.username };
    }
    for (let attempt = 0; attempt < 24; attempt++) {
        const candidate = attempt === 0
            ? suggestUsernameFromEmail(email)
            : `u_${randomHex(4)}`.slice(0, USERNAME_MAX);
        const { data: taken } = await db
            .from("auth_users")
            .select("id")
            .eq("username", candidate)
            .maybeSingle();
        if (taken) {
            continue;
        }
        const pic = params.googlePictureUrl?.trim() || null;
        const { data: row, error } = await db
            .from("auth_users")
            .insert({
                username: candidate,
                email,
                password_hash: null,
                avatar_url: pic,
            })
            .select("id, username")
            .single();
        if (!error && row) {
            return { id: row.id, username: row.username };
        }
    }
    throw new Error("Could not create account");
}
