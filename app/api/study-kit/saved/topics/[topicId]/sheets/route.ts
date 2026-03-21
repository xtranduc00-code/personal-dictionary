import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import {
    MAX_SHEETS_PER_TOPIC,
    MAX_SHEETS_TOTAL,
} from "@/lib/study-kit-saved";

export const runtime = "nodejs";

const MAX_MD = 900_000;

const postSchema = z.object({
    title: z.string().max(200).optional(),
    markdown: z.string().min(1).max(MAX_MD),
    truncated: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ topicId: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { topicId } = await ctx.params;
    if (!topicId)
        return NextResponse.json({ code: "BAD_ID" }, { status: 400 });
    let json: unknown;
    try {
        json = await req.json();
    }
    catch {
        return NextResponse.json({ code: "BAD_JSON" }, { status: 400 });
    }
    const parsed = postSchema.safeParse(json);
    if (!parsed.success)
        return NextResponse.json({ code: "BAD_BODY" }, { status: 400 });
    try {
        const db = supabaseForUserData();
        const { data: topic, error: te } = await db
            .from("study_kit_saved_topics")
            .select("id")
            .eq("id", topicId)
            .eq("user_id", user.id)
            .maybeSingle();
        if (te)
            throw te;
        if (!topic)
            return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

        const { count: totalSheets, error: tErr } = await db
            .from("study_kit_saved_sheets")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);
        if (tErr)
            throw tErr;
        if ((totalSheets ?? 0) >= MAX_SHEETS_TOTAL)
            return NextResponse.json({ code: "SHEET_TOTAL_LIMIT" }, { status: 400 });

        const { count: topicSheets, error: cErr } = await db
            .from("study_kit_saved_sheets")
            .select("*", { count: "exact", head: true })
            .eq("topic_id", topicId)
            .eq("user_id", user.id);
        if (cErr)
            throw cErr;
        if ((topicSheets ?? 0) >= MAX_SHEETS_PER_TOPIC)
            return NextResponse.json({ code: "SHEET_TOPIC_LIMIT" }, { status: 400 });

        const title = (parsed.data.title ?? "").trim() || "Study sheet";
        const { data: row, error: ie } = await db
            .from("study_kit_saved_sheets")
            .insert({
                user_id: user.id,
                topic_id: topicId,
                title,
                markdown: parsed.data.markdown,
                truncated: Boolean(parsed.data.truncated),
            })
            .select("id,title,markdown,truncated,saved_at")
            .single();
        if (ie)
            throw ie;
        if (!row)
            return NextResponse.json({ code: "SERVER" }, { status: 500 });

        await db
            .from("study_kit_saved_topics")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", topicId)
            .eq("user_id", user.id);

        const s = row as {
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
        console.error("study-kit/saved/.../sheets POST", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}
