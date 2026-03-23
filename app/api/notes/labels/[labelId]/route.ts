import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ labelId: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { labelId } = await ctx.params;
    const db = supabaseForUserData();
    try {
        const { error: delLinks } = await db.from("note_note_labels").delete().eq("label_id", labelId);
        if (delLinks) {
            throw delLinks;
        }
        const { error } = await db
            .from("note_labels")
            .delete()
            .eq("id", labelId)
            .eq("user_id", user.id);
        if (error) {
            throw error;
        }
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("note_labels DELETE", e);
        return NextResponse.json({ error: "Failed to delete label" }, { status: 500 });
    }
}
