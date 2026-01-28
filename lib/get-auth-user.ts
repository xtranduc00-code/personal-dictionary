import { supabaseForUserData } from "@/lib/supabase-server";
export type AuthUser = {
    id: string;
    username: string;
};
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!token)
        return null;
    const db = supabaseForUserData();
    const { data: session } = await db
        .from("auth_sessions")
        .select("user_id")
        .eq("token", token)
        .maybeSingle();
    if (!session)
        return null;
    const { data: user } = await db
        .from("auth_users")
        .select("id, username")
        .eq("id", session.user_id)
        .single();
    if (!user)
        return null;
    return { id: user.id, username: user.username };
}
