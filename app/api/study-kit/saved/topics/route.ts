import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import { MAX_STUDY_TOPICS } from "@/lib/study-kit-saved";

export const runtime = "nodejs";

/** List subjects with sheet counts (newest topic first). */
export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    try {
        const db = supabaseForUserData();
        const { data: topics, error: te } = await db
            .from("study_kit_saved_topics")
            .select("id,name,created_at,updated_at")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false });
        if (te)
            throw te;
        const rows = Array.isArray(topics) ? topics : [];
        const ids = rows.map((r: { id: string }) => r.id);
        let countMap = new Map<string, number>();
        if (ids.length > 0) {
            const { data: counts, error: ce } = await db
                .from("study_kit_saved_sheets")
                .select("topic_id")
                .eq("user_id", user.id)
                .in("topic_id", ids);
            if (ce)
                throw ce;
            for (const row of counts ?? []) {
                const tid = (row as { topic_id: string }).topic_id;
                countMap.set(tid, (countMap.get(tid) ?? 0) + 1);
            }
        }
        const out = rows.map((r: { id: string; name: string; created_at: string; updated_at: string }) => ({
            id: r.id,
            name: r.name,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            sheetCount: countMap.get(r.id) ?? 0,
        }));
        return NextResponse.json({ topics: out });
    }
    catch (e) {
        console.error("study-kit/saved/topics GET", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}

const postSchema = z.object({
    name: z.string().trim().min(1).max(200),
});

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
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
        const { count, error: cErr } = await db
            .from("study_kit_saved_topics")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);
        if (cErr)
            throw cErr;
        if ((count ?? 0) >= MAX_STUDY_TOPICS)
            return NextResponse.json({ code: "TOPIC_LIMIT" }, { status: 400 });
        const { data, error } = await db
            .from("study_kit_saved_topics")
            .insert({
                user_id: user.id,
                name: parsed.data.name,
            })
            .select("id,name,created_at,updated_at")
            .single();
        if (error)
            throw error;
        if (!data)
            return NextResponse.json({ code: "SERVER" }, { status: 500 });
        const r = data as { id: string; name: string; created_at: string; updated_at: string };
        return NextResponse.json({
            topic: {
                id: r.id,
                name: r.name,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                sheetCount: 0,
            },
        });
    }
    catch (e) {
        console.error("study-kit/saved/topics POST", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}
