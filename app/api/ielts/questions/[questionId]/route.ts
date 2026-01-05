import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;
  try {
    const body = await req.json();
    const updates: { text?: string; part?: string } = {};
    if (typeof body?.text === "string" && body.text.trim()) updates.text = body.text.trim();
    if (body?.part === "1" || body?.part === "2" || body?.part === "3") updates.part = body.part;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }
    const supabase = getSupabase();
    const { error } = await supabase
      .from("ielts_questions")
      .update(updates)
      .eq("id", questionId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ielts question PATCH", e);
    return NextResponse.json(
      { error: "Failed to update question" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("ielts_questions").delete().eq("id", questionId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ielts question DELETE", e);
    return NextResponse.json(
      { error: "Failed to delete question" },
      { status: 500 },
    );
  }
}
