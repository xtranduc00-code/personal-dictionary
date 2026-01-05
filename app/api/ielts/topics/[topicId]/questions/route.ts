import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("ielts_questions")
      .select("id,topic_id,text,part,created_at")
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const questions = (data ?? []).map((r) => ({
      id: r.id,
      topicId: r.topic_id,
      text: r.text,
      part: r.part,
      createdAt: r.created_at,
    }));
    return NextResponse.json(questions);
  } catch (e) {
    console.error("ielts questions GET", e);
    return NextResponse.json(
      { error: "Failed to load questions" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params;
  try {
    const body = await req.json();
    const part = body?.part === "1" || body?.part === "2" || body?.part === "3" ? body.part : "1";
    let texts: string[] = [];
    if (Array.isArray(body?.texts)) {
      texts = body.texts.map((t: unknown) => String(t).trim()).filter(Boolean);
    } else if (typeof body?.text === "string" && body.text.trim()) {
      texts = [body.text.trim()];
    }
    if (texts.length === 0) {
      return NextResponse.json({ error: "text or texts required" }, { status: 400 });
    }
    const supabase = getSupabase();
    const rows = texts.map((text) => ({ topic_id: topicId, text, part }));
    const { data, error } = await supabase.from("ielts_questions").insert(rows).select("id");
    if (error) throw error;
    return NextResponse.json({ count: (data ?? []).length });
  } catch (e) {
    console.error("ielts questions POST", e);
    return NextResponse.json(
      { error: "Failed to add questions" },
      { status: 500 },
    );
  }
}
