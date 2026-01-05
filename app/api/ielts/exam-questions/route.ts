import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

type Row = {
  id: string;
  topic_id: string;
  text: string;
  part: string;
  created_at: string;
  ielts_topics: { name: string } | null;
};

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("ielts_questions")
      .select("id,topic_id,text,part,created_at,ielts_topics(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const part1 = rows.filter((r) => r.part === "1").map((r) => ({
      id: r.id,
      topicId: r.topic_id,
      topicName: r.ielts_topics?.name ?? "",
      text: r.text,
      part: "1" as const,
      createdAt: r.created_at,
    }));
    const part2 = rows.filter((r) => r.part === "2").map((r) => ({
      id: r.id,
      topicId: r.topic_id,
      topicName: r.ielts_topics?.name ?? "",
      text: r.text,
      part: "2" as const,
      createdAt: r.created_at,
    }));
    const part3 = rows.filter((r) => r.part === "3").map((r) => ({
      id: r.id,
      topicId: r.topic_id,
      topicName: r.ielts_topics?.name ?? "",
      text: r.text,
      part: "3" as const,
      createdAt: r.created_at,
    }));
    return NextResponse.json({ part1, part2, part3 });
  } catch (e) {
    console.error("ielts exam-questions GET", e);
    return NextResponse.json(
      { error: "Failed to load exam questions" },
      { status: 500 },
    );
  }
}
