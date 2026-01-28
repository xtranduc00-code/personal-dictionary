import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const supabaseServer = createClient(supabaseUrl || "https://placeholder.supabase.co", anonKey);
export function getSupabaseServiceClient(): SupabaseClient | null {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !key)
        return null;
    return createClient(supabaseUrl, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
export function supabaseForUserData(): SupabaseClient {
    return getSupabaseServiceClient() ?? supabaseServer;
}
