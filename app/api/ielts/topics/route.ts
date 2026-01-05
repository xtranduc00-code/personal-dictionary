import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("ielts_topics")
      .select("id,name,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const topics = (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
    }));
    return NextResponse.json(topics);
  } catch (e) {
    console.error("ielts topics GET", e);
    return NextResponse.json(
      { error: "Failed to load topics" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() || "New topic" : "New topic";
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("ielts_topics")
      .insert({ name })
      .select("id,name,created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
    });
  } catch (e) {
    console.error("ielts topics POST", e);
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 },
    );
  }
}
