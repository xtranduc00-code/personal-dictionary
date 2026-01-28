import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { mintSupabaseUserJwt } from "@/lib/supabase-storage-jwt";
export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const { token, expiresIn } = await mintSupabaseUserJwt(user.id);
        return NextResponse.json({ accessToken: token, expiresIn });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : "Server error";
        if (msg.includes("Missing SUPABASE_JWT_SECRET")) {
            return NextResponse.json({
                error: "Set SUPABASE_JWT_SECRET in server env to match Supabase Dashboard → Settings → API → JWT Secret (not the service_role key). Restart the dev server.",
            }, { status: 503 });
        }
        if (msg.includes("Missing NEXT_PUBLIC_SUPABASE_URL")) {
            return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 503 });
        }
        console.error("storage-jwt", e);
        return NextResponse.json({ error: "Could not issue storage token" }, { status: 500 });
    }
}
