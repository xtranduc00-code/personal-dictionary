import { createClient, type SupabaseClient } from "@supabase/supabase-js";
/**
 * Browser client: anon key + user JWT from `/api/auth/storage-jwt` so Storage RLS sees `auth.uid()`.
 * Never put service_role in the browser.
 */
export function createSupabaseBrowserClient(accessToken: string): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !key) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
    const token = accessToken.trim();
    if (!token) {
        throw new Error("Missing access token");
    }
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
    });
}
