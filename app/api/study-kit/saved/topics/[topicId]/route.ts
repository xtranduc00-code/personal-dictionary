import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ topicId: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { topicId } = await ctx.params;
    if (!topicId)
        return NextResponse.json({ code: "BAD_ID" }, { status: 400 });
    try {
        const db = supabaseForUserData();
        const { data: topic, error: te } = await db
            .from("study_kit_saved_topics")
            .select("id,name,created_at,updated_at")
            .eq("id", topicId)
            .eq("user_id", user.id)
            .maybeSingle();
        if (te)
            throw te;
        if (!topic)
            return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
        const { data: sheets, error: se } = await db
            .from("study_kit_saved_sheets")
            .select("id,title,markdown,truncated,saved_at")
            .eq("topic_id", topicId)
            .eq("user_id", user.id)
            .order("saved_at", { ascending: false });
        if (se)
            throw se;
        const t = topic as { id: string; name: string; created_at: string; updated_at: string };
        const sh = (sheets ?? []) as {
            id: string;
            title: string;
            markdown: string;
            truncated: boolean;
            saved_at: string;
        }[];
        return NextResponse.json({
            topic: {
                id: t.id,
                name: t.name,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
                sheets: sh.map((s) => ({
                    id: s.id,
                    title: s.title,
                    markdown: s.markdown,
                    truncated: Boolean(s.truncated),
                    savedAt: s.saved_at,
                })),
            },
        });
    }
    catch (e) {
        console.error("study-kit/saved/topics/[topicId] GET", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}

const patchSchema = z.object({
    name: z.string().trim().min(1).max(200),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ topicId: string }> }) {
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
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success)
        return NextResponse.json({ code: "BAD_BODY" }, { status: 400 });
    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("study_kit_saved_topics")
            .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
            .eq("id", topicId)
            .eq("user_id", user.id)
            .select("id,name,created_at,updated_at")
            .maybeSingle();
        if (error)
            throw error;
        if (!data)
            return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
        const r = data as { id: string; name: string; created_at: string; updated_at: string };
        return NextResponse.json({
            topic: {
                id: r.id,
                name: r.name,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            },
        });
    }
    catch (e) {
        console.error("study-kit/saved/topics/[topicId] PATCH", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ topicId: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { topicId } = await ctx.params;
    if (!topicId)
        return NextResponse.json({ code: "BAD_ID" }, { status: 400 });
    try {
        const db = supabaseForUserData();
        const { error } = await db
            .from("study_kit_saved_topics")
            .delete()
            .eq("id", topicId)
            .eq("user_id", user.id);
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("study-kit/saved/topics/[topicId] DELETE", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}
