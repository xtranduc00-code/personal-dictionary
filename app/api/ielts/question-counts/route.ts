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
      .from("ielts_questions")
      .select("topic_id");
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const r of data ?? []) {
      const id = r.topic_id as string;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return NextResponse.json(counts);
  } catch (e) {
    console.error("ielts question-counts GET", e);
    return NextResponse.json(
      { error: "Failed to load counts" },
      { status: 500 },
    );
  }
}
