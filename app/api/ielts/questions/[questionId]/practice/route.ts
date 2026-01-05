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
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("ielts_practice")
      .select("draft,history")
      .eq("question_id", questionId)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    const draft = data?.draft ?? "";
    const history = Array.isArray(data?.history) ? data.history : [];
    return NextResponse.json({ draft, history });
  } catch (e) {
    console.error("ielts practice GET", e);
    return NextResponse.json(
      { error: "Failed to load practice" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;
  try {
    const body = await req.json();
    const supabase = getSupabase();

    if (body?.draft !== undefined || body?.attempt !== undefined) {
      const { data: existing } = await supabase
        .from("ielts_practice")
        .select("draft,history")
        .eq("question_id", questionId)
        .single();

      let draft = typeof existing?.draft === "string" ? existing.draft : "";
      let history = Array.isArray(existing?.history) ? existing.history : [];

      if (typeof body.draft === "string") draft = body.draft;

      if (body.attempt && typeof body.attempt === "object" && typeof body.attempt.answer === "string") {
        const attempt = {
          answer: body.attempt.answer,
          score: body.attempt.score,
          feedback: body.attempt.feedback,
          improvedAnswer: body.attempt.improvedAnswer,
          practicedAt: body.attempt.practicedAt ?? new Date().toISOString(),
        };
        history = [attempt, ...history];
        draft = body.attempt.answer;
      }

      const { error } = await supabase
        .from("ielts_practice")
        .upsert(
          { question_id: questionId, draft, history },
          { onConflict: "question_id" },
        );
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ielts practice POST", e);
    return NextResponse.json(
      { error: "Failed to save practice" },
      { status: 500 },
    );
  }
}
