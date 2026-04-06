import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
const supabaseServer = supabaseForUserData();

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("chess_puzzles")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const fen = typeof body.fen === "string" ? body.fen.trim() : "";
  if (!fen) return NextResponse.json({ error: "fen required" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("chess_puzzles")
    .insert({
      user_id: user.id,
      title: typeof body.title === "string" ? body.title.trim() : "",
      fen,
      solution_moves: Array.isArray(body.solution_moves) ? body.solution_moves : [],
      hint: typeof body.hint === "string" ? body.hint.trim() : "",
      level: typeof body.level === "string" ? body.level : "beginner",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
