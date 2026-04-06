import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
const supabaseServer = supabaseForUserData();

function roomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let code = roomCode();
  // Retry on collision (extremely unlikely)
  for (let i = 0; i < 5; i++) {
    const { data } = await supabaseServer.from("chess_games").select("id").eq("room_code", code).maybeSingle();
    if (!data) break;
    code = roomCode();
  }

  const { data, error } = await supabaseServer
    .from("chess_games")
    .insert({ room_code: code, white_user_id: user.id, status: "waiting" })
    .select()
    .single();

  if (error) {
    console.error("chess games POST", error);
    return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
