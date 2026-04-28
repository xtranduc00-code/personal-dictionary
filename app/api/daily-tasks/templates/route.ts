import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const DEFAULT_TEMPLATES = [
  { id: "read_engoo", label: "Daily News", href: "/news", sort_order: 0 },
  { id: "read_hbr", label: "1 HBR article", href: "/news?src=hbr", sort_order: 1 },
  { id: "vocab_10", label: "5 vocab", href: "/flashcards", sort_order: 2 },
  { id: "chess_puzzles_10", label: "10 Chess Puzzles", href: "/chess", sort_order: 3 },
  { id: "diary_write", label: "Write diary", href: "/notes/diary", sort_order: 4 },
  // Manual-check task — no auto-detect, user clicks the checkbox after they
  // actually meditated. Keeps the streak honest and exercises the manual-tick
  // path without any new schema/types.
  { id: "meditation_10min", label: "10 min meditation", href: "/", sort_order: 5 },
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

  const needsSeed = !rows || rows.length === 0;
  // Migrate users still on any legacy default id (one-shot: skips once new ids are present)
  const LEGACY_IDS = new Set([
    "chess_puzzles_5", "chess", "flashcards_10", "flashcards",
    "ielts_listening", "listening", "ielts_speaking", "ielts-speaking",
    "read_guardian", "news_category_sport",
  ]);
  const NEW_IDS = new Set(DEFAULT_TEMPLATES.map((t) => t.id));
  const hasLegacy = !needsSeed && rows.some((r) => LEGACY_IDS.has(r.id));
  const hasAnyNew = !needsSeed && rows.some((r) => NEW_IDS.has(r.id) && r.id !== "read_engoo");
  const needsMigration = hasLegacy && !hasAnyNew;

  if (needsSeed || needsMigration) {
    if (needsMigration) {
      await db.from("daily_task_templates").delete().eq("user_id", user.id);
    }
    const seeds = DEFAULT_TEMPLATES.map((t) => ({ ...t, user_id: user.id }));
    await db.from("daily_task_templates").insert(seeds);
    return NextResponse.json(DEFAULT_TEMPLATES.map(({ id, label, href }) => ({ id, label, href })));
  }

  // In-place label refresh for `vocab_10` when still showing the old "10 vocab" label.
  const staleVocab = rows.find((r) => r.id === "vocab_10" && r.label === "10 vocab");
  if (staleVocab) {
    await db
      .from("daily_task_templates")
      .update({ label: "5 vocab" })
      .eq("user_id", user.id)
      .eq("id", "vocab_10");
    staleVocab.label = "5 vocab";
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
