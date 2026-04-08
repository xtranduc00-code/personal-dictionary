import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const DEFAULT_TEMPLATES = [
  { id: "read_engoo", label: "Read Engoo", href: "/news", sort_order: 0 },
  { id: "read_guardian", label: "Read Guardian", href: "/news?src=guardian", sort_order: 1 },
  { id: "flashcards_10", label: "10 Flashcards", href: "/flashcards", sort_order: 2 },
  { id: "ielts_listening", label: "IELTS Listening", href: "/listening", sort_order: 3 },
  { id: "ielts_speaking", label: "IELTS Speaking", href: "/ielts-speaking", sort_order: 4 },
  { id: "chess_puzzles_5", label: "5 Chess Puzzles", href: "/chess", sort_order: 5 },
];

/** GET — fetch user's task templates (seed defaults on first use) */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseForUserData();

  const { data: rows } = await db
    .from("daily_task_templates")
    .select("id, label, href, sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  // First time: seed defaults
  if (!rows || rows.length === 0) {
    const seeds = DEFAULT_TEMPLATES.map((t) => ({ ...t, user_id: user.id }));
    await db.from("daily_task_templates").insert(seeds);
    return NextResponse.json(DEFAULT_TEMPLATES.map(({ id, label, href }) => ({ id, label, href })));
  }

  return NextResponse.json(rows.map(({ id, label, href }) => ({ id, label, href })));
}

/** PUT — replace all templates (full sync from client) */
export async function PUT(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const templates = body as { id: string; label: string; href: string }[];

  if (!Array.isArray(templates)) {
    return NextResponse.json({ error: "Expected array" }, { status: 400 });
  }

  const db = supabaseForUserData();

  // Delete all existing templates for user
  await db.from("daily_task_templates").delete().eq("user_id", user.id);

  // Insert new ones
  if (templates.length > 0) {
    const rows = templates.map((t, i) => ({
      id: t.id,
      user_id: user.id,
      label: t.label,
      href: t.href || "/",
      sort_order: i,
    }));
    const { error } = await db.from("daily_task_templates").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
