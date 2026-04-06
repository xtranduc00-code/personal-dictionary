import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
const supabaseServer = supabaseForUserData();

type Params = { params: Promise<{ puzzleId: string }> };

export async function POST(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { puzzleId } = await params;

  const { error: rpcErr } = await supabaseServer.rpc("increment_puzzle_solved", { puzzle_id: puzzleId });
  if (rpcErr) {
    // Fallback: manual increment
    const { data } = await supabaseServer
      .from("chess_puzzles")
      .select("times_solved")
      .eq("id", puzzleId)
      .eq("user_id", user.id)
      .single();
    if (data) {
      await supabaseServer
        .from("chess_puzzles")
        .update({ times_solved: (data.times_solved as number) + 1 })
        .eq("id", puzzleId);
    }
  }

  return NextResponse.json({ ok: true });
}
