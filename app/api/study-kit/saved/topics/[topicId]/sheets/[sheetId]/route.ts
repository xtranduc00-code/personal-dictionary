import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

export const runtime = "nodejs";

const MAX_MD = 900_000;

const patchSchema = z.object({
    title: z.string().max(200).optional(),
    markdown: z.string().max(MAX_MD).optional(),
    truncated: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ topicId: string; sheetId: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { topicId, sheetId } = await ctx.params;
    if (!topicId || !sheetId)
        return NextResponse.json({ code: "BAD_ID" }, { status: 400 });
    let json: unknown;
    try {
        json = await req.json();
    }
    catch {
        return NextResponse.json({ code: "BAD_JSON" }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success)
        return NextResponse.json({ code: "BAD_BODY" }, { status: 400 });
    const u = parsed.data;
    if (u.title === undefined && u.markdown === undefined && u.truncated === undefined)
        return NextResponse.json({ code: "BAD_BODY" }, { status: 400 });
    try {
        const db = supabaseForUserData();
        const patch: Record<string, unknown> = {};
        if (u.title !== undefined)
            patch.title = u.title.trim() || "Study sheet";
        if (u.markdown !== undefined)
            patch.markdown = u.markdown;
        if (u.truncated !== undefined)
            patch.truncated = u.truncated;

        const { data, error } = await db
            .from("study_kit_saved_sheets")
            .update(patch)
            .eq("id", sheetId)
            .eq("topic_id", topicId)
            .eq("user_id", user.id)
            .select("id,title,markdown,truncated,saved_at")
            .maybeSingle();
        if (error)
            throw error;
        if (!data)
            return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

        await db
            .from("study_kit_saved_topics")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", topicId)
            .eq("user_id", user.id);

        const s = data as {
            id: string;
            title: string;
            markdown: string;
            truncated: boolean;
            saved_at: string;
        };
        return NextResponse.json({
            sheet: {
                id: s.id,
                title: s.title,
                markdown: s.markdown,
                truncated: Boolean(s.truncated),
                savedAt: s.saved_at,
            },
        });
    }
    catch (e) {
        console.error("study-kit/saved/.../sheets/[sheetId] PATCH", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ topicId: string; sheetId: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { topicId, sheetId } = await ctx.params;
    if (!topicId || !sheetId)
        return NextResponse.json({ code: "BAD_ID" }, { status: 400 });
    try {
        const db = supabaseForUserData();
        const { error } = await db
            .from("study_kit_saved_sheets")
            .delete()
            .eq("id", sheetId)
            .eq("topic_id", topicId)
            .eq("user_id", user.id);
        if (error)
            throw error;
        await db
            .from("study_kit_saved_topics")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", topicId)
            .eq("user_id", user.id);
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("study-kit/saved/.../sheets/[sheetId] DELETE", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}
