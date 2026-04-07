import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
const supabaseServer = supabaseForUserData();

type Params = { params: Promise<{ roomCode: string }> };

export async function GET(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomCode } = await params;
  const { data, error } = await supabaseServer
    .from("chess_games")
    .select("*")
    .eq("room_code", roomCode.toUpperCase())
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomCode } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const allowed = ["fen", "pgn", "turn", "status", "winner", "white_player", "black_player", "time_control", "duration_seconds", "white_time_ms", "black_time_ms"] as const;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await supabaseServer
    .from("chess_games")
    .update(patch)
    .eq("room_code", roomCode.toUpperCase())
    .or(`white_user_id.eq.${user.id},black_user_id.eq.${user.id}`)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Game not found or not authorized" }, { status: 404 });
  return NextResponse.json(data);
}
