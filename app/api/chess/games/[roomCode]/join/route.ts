import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
const supabaseServer = supabaseForUserData();

type Params = { params: Promise<{ roomCode: string }> };

export async function POST(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomCode } = await params;

  const { data: game } = await supabaseServer
    .from("chess_games")
    .select("*")
    .eq("room_code", roomCode.toUpperCase())
    .maybeSingle();

  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // Already a player in this game
  if (game.white_user_id === user.id || game.black_user_id === user.id) {
    return NextResponse.json(game);
  }

  if (game.status !== "waiting") {
    return NextResponse.json({ error: "Game already started" }, { status: 409 });
  }

  if (game.black_user_id) {
    return NextResponse.json({ error: "Game is full" }, { status: 409 });
  }

  const { data, error } = await supabaseServer
    .from("chess_games")
    .update({ black_user_id: user.id, status: "active", updated_at: new Date().toISOString() })
    .eq("room_code", roomCode.toUpperCase())
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to join" }, { status: 500 });
  return NextResponse.json(data);
}
