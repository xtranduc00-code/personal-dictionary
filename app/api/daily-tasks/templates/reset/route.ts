import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const DEFAULT_TEMPLATES = [
  { id: "read_engoo",       label: "Daily News",        href: "/news",         sort_order: 0, target_count: null, is_default: true },
  { id: "read_hbr",         label: "1 HBR article",     href: "/news?src=hbr", sort_order: 1, target_count: null, is_default: true },
  { id: "vocab_10",         label: "5 vocab",           href: "/flashcards",   sort_order: 2, target_count: 5,    is_default: true },
  { id: "chess_puzzles_10", label: "10 Chess Puzzles",  href: "/chess",        sort_order: 3, target_count: 10,   is_default: true },
  { id: "diary_write",      label: "Write diary",       href: "/notes/diary",  sort_order: 4, target_count: null, is_default: true },
  { id: "meditation_10min", label: "10 min meditation", href: "/",             sort_order: 5, target_count: null, is_default: true },
];

/** POST — wipe the user's templates and re-seed the 6 defaults.
 *  Manual tasks the user added are removed in the process. No confirmation
 *  step on the server — the UI handles that. */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseForUserData();

  await db.from("daily_task_templates").delete().eq("user_id", user.id);

  const seeds = DEFAULT_TEMPLATES.map((t) => ({ ...t, user_id: user.id }));
  const { error } = await db.from("daily_task_templates").insert(seeds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: seeds.length });
}
