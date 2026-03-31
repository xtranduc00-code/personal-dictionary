import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
        throw new Error("Missing Supabase env");
    return createClient(url, key);
}
export async function GET(_req: Request, { params }: {
    params: Promise<{
        topicId: string;
    }>;
}) {
    const { topicId } = await params;
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from("ielts_topic_vocab")
            .select("items")
            .eq("topic_id", topicId)
            .single();
        if (error && error.code !== "PGRST116")
            throw error;
        const items = Array.isArray(data?.items) ? data.items : [];
        return NextResponse.json(items);
    }
    catch (e) {
        console.error("ielts vocab GET", e);
        return NextResponse.json({ error: "Failed to load vocab" }, { status: 500 });
    }
}
export async function POST(req: Request, { params }: {
    params: Promise<{
        topicId: string;
    }>;
}) {
    const { topicId } = await params;
    try {
        const body = await req.json();
        const word = typeof body?.word === "string" ? body.word.trim() : "";
        const explanation = typeof body?.explanation === "string" ? body.explanation.trim() : "";
        const example = typeof body?.example === "string" ? body.example.trim() : "";
        if (!word)
            return NextResponse.json({ error: "word required" }, { status: 400 });
        const supabase = getSupabase();
        const { data: row } = await supabase
            .from("ielts_topic_vocab")
            .select("items")
            .eq("topic_id", topicId)
            .single();
        const items = Array.isArray(row?.items) ? [...row.items] : [];
        const item: {
            word: string;
            explanation?: string;
            example?: string;
        } = { word };
        if (explanation)
            item.explanation = explanation;
        if (example)
            item.example = example;
        items.push(item);
        const { error } = await supabase
            .from("ielts_topic_vocab")
            .upsert({ topic_id: topicId, items }, { onConflict: "topic_id" });
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("ielts vocab POST", e);
        return NextResponse.json({ error: "Failed to add vocab" }, { status: 500 });
    }
}
export async function PATCH(req: Request, { params }: {
    params: Promise<{
        topicId: string;
    }>;
}) {
    const { topicId } = await params;
    try {
        const body = await req.json();
        const index = typeof body?.index === "number" ? body.index : -1;
        const word = typeof body?.word === "string" ? body.word.trim() : "";
        const explanation = typeof body?.explanation === "string" ? body.explanation.trim() : "";
        const example = typeof body?.example === "string" ? body.example.trim() : "";
        if (index < 0 || !word) {
            return NextResponse.json({ error: "index and word required" }, { status: 400 });
        }
        const supabase = getSupabase();
        const { data: row, error: fetchErr } = await supabase
            .from("ielts_topic_vocab")
            .select("items")
            .eq("topic_id", topicId)
            .single();
        if (fetchErr && fetchErr.code !== "PGRST116")
            throw fetchErr;
        const items = Array.isArray(row?.items) ? [...row.items] : [];
        if (index >= items.length) {
            return NextResponse.json({ error: "index out of range" }, { status: 400 });
        }
        // Preserve any extra fields (e.g. examples[], sentences[]) added by migrations/scripts.
        const prev = (items[index] && typeof items[index] === "object") ? items[index] : {};
        const next: any = { ...prev, word };
        if (explanation)
            next.explanation = explanation;
        else
            delete next.explanation;
        if (example)
            next.example = example;
        else
            delete next.example;
        items[index] = next;
        const { error } = await supabase
            .from("ielts_topic_vocab")
            .upsert({ topic_id: topicId, items }, { onConflict: "topic_id" });
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("ielts vocab PATCH", e);
        return NextResponse.json({ error: "Failed to update vocab" }, { status: 500 });
    }
}
export async function DELETE(req: Request, { params }: {
    params: Promise<{
        topicId: string;
    }>;
}) {
    const { topicId } = await params;
    const url = new URL(req.url);
    const index = url.searchParams.get("index");
    const idx = index !== null ? parseInt(index, 10) : -1;
    if (Number.isNaN(idx) || idx < 0) {
        return NextResponse.json({ error: "index required" }, { status: 400 });
    }
    try {
        const supabase = getSupabase();
        const { data: row, error: fetchErr } = await supabase
            .from("ielts_topic_vocab")
            .select("items")
            .eq("topic_id", topicId)
            .single();
        if (fetchErr && fetchErr.code !== "PGRST116")
            throw fetchErr;
        const items = Array.isArray(row?.items) ? [...row.items] : [];
        items.splice(idx, 1);
        const { error } = await supabase
            .from("ielts_topic_vocab")
            .upsert({ topic_id: topicId, items }, { onConflict: "topic_id" });
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("ielts vocab DELETE", e);
        return NextResponse.json({ error: "Failed to remove vocab" }, { status: 500 });
    }
}
