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
      .from("ielts_topics")
      .select("id,name,created_at")
      .eq("id", topicId)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
    });
  } catch (e) {
    console.error("ielts topic GET", e);
    return NextResponse.json(
      { error: "Failed to load topic" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params;
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : null;
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const supabase = getSupabase();
    const { error } = await supabase
      .from("ielts_topics")
      .update({ name })
      .eq("id", topicId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ielts topic PATCH", e);
    return NextResponse.json(
      { error: "Failed to update topic" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params;
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("ielts_topics").delete().eq("id", topicId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ielts topic DELETE", e);
    return NextResponse.json(
      { error: "Failed to delete topic" },
      { status: 500 },
    );
  }
}
