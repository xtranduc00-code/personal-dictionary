import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { setId } = await params;

  let body: { cards?: { word: string; definition?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cards = body.cards;
  if (!Array.isArray(cards) || cards.length === 0) {
    return NextResponse.json({ error: "No cards provided" }, { status: 400 });
  }

  const rows = cards
    .map((c) => ({
      user_id: user.id,
      set_id: setId,
      word: typeof c.word === "string" ? c.word.trim().slice(0, 500) : "",
      definition: typeof c.definition === "string" ? c.definition.trim().slice(0, 5000) : "",
    }))
    .filter((r) => r.word.length > 0);

  if (rows.length === 0) {
    return NextResponse.json({ error: "All cards had empty word" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseServer
      .from("flashcard_cards")
      .insert(rows)
      .select("id,set_id,word,definition,created_at");

    if (error) throw error;

    return NextResponse.json({ inserted: data?.length ?? rows.length });
  } catch (e) {
    console.error("flashcards bulk POST", e);
    return NextResponse.json({ error: "Failed to insert cards" }, { status: 500 });
  }
}
