import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const db = supabaseForUserData();

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("repertoire_lines")
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

  const { data, error } = await db
    .from("repertoire_lines")
    .insert({
      user_id: user.id,
      name:    body.name    ?? "Untitled Line",
      color:   body.color   ?? "white",
      moves:   body.moves   ?? [],
      pgn:     body.pgn     ?? "",
      notes:   body.notes   ?? "",
    })
    .select()
    .single();

  if (error) {
    console.error("repertoire POST", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
