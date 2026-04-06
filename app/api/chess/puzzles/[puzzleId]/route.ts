import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
const supabaseServer = supabaseForUserData();

type Params = { params: Promise<{ puzzleId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { puzzleId } = await params;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const allowed = ["title", "fen", "solution_moves", "hint", "level"] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await supabaseServer
    .from("chess_puzzles")
    .update(patch)
    .eq("id", puzzleId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { puzzleId } = await params;

  const { error } = await supabaseServer
    .from("chess_puzzles")
    .delete()
    .eq("id", puzzleId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
