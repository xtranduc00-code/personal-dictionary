import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const supabaseServer = supabaseForUserData();

type Params = { params: Promise<{ gameId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gameId } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.white_accuracy === "number") patch.white_accuracy = body.white_accuracy;
  if (typeof body.black_accuracy === "number") patch.black_accuracy = body.black_accuracy;

  const { error } = await supabaseServer
    .from("chess_games")
    .update(patch)
    .eq("id", gameId)
    .or(`white_user_id.eq.${user.id},black_user_id.eq.${user.id}`);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
