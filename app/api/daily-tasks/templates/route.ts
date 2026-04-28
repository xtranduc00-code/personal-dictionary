import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

type TemplateRow = {
  id: string;
  label: string;
  href: string;
  sort_order: number;
  target_count: number | null;
  is_default: boolean;
};

const DEFAULT_TEMPLATES: Array<Omit<TemplateRow, "is_default"> & { is_default: true }> = [
  { id: "read_engoo",       label: "Daily News",        href: "/news",           sort_order: 0, target_count: null, is_default: true },
  { id: "read_hbr",         label: "1 HBR article",     href: "/news?src=hbr",   sort_order: 1, target_count: null, is_default: true },
  { id: "vocab_10",         label: "5 vocab",           href: "/flashcards",     sort_order: 2, target_count: 5,    is_default: true },
  { id: "chess_puzzles_10", label: "10 Chess Puzzles",  href: "/chess",          sort_order: 3, target_count: 10,   is_default: true },
  { id: "diary_write",      label: "Write diary",       href: "/notes/diary",    sort_order: 4, target_count: null, is_default: true },
  { id: "meditation_10min", label: "10 min meditation", href: "/",               sort_order: 5, target_count: null, is_default: true },
];

const DEFAULT_TEMPLATE_IDS = DEFAULT_TEMPLATES.map((t) => t.id);

function toClient(row: TemplateRow) {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    sortOrder: row.sort_order,
    targetCount: row.target_count,
    isDefault: row.is_default,
  };
}

/** GET — fetch user's task templates (seed defaults on first use) */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseForUserData();

  const { data: rows } = await db
    .from("daily_task_templates")
    .select("id, label, href, sort_order, target_count, is_default")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  const needsSeed = !rows || rows.length === 0;
  const LEGACY_IDS = new Set([
    "chess_puzzles_5", "chess", "flashcards_10", "flashcards",
    "ielts_listening", "listening", "ielts_speaking", "ielts-speaking",
    "read_guardian", "news_category_sport",
  ]);
  const NEW_IDS = new Set(DEFAULT_TEMPLATE_IDS);
  const hasLegacy = !needsSeed && rows.some((r) => LEGACY_IDS.has(r.id));
  const hasAnyNew = !needsSeed && rows.some((r) => NEW_IDS.has(r.id) && r.id !== "read_engoo");
  const needsMigration = hasLegacy && !hasAnyNew;

  if (needsSeed || needsMigration) {
    if (needsMigration) {
      await db.from("daily_task_templates").delete().eq("user_id", user.id);
    }
    const seeds = DEFAULT_TEMPLATES.map((t) => ({ ...t, user_id: user.id }));
    await db.from("daily_task_templates").insert(seeds);
    return NextResponse.json(DEFAULT_TEMPLATES.map((t) => toClient(t as TemplateRow)));
  }

  // In-place label refresh for `vocab_10` when still showing the old "10 vocab".
  const staleVocab = rows.find((r) => r.id === "vocab_10" && r.label === "10 vocab");
  if (staleVocab) {
    await db
      .from("daily_task_templates")
      .update({ label: "5 vocab" })
      .eq("user_id", user.id)
      .eq("id", "vocab_10");
    staleVocab.label = "5 vocab";
  }

  return NextResponse.json(rows.map((r) => toClient(r as TemplateRow)));
}

/** POST — create a new manual task. Auto-track tasks must be hardcoded in
 *  feature code; this endpoint only creates manual rows. */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const targetCountRaw = body?.targetCount;
  const targetCount =
    typeof targetCountRaw === "number" && Number.isFinite(targetCountRaw) && targetCountRaw > 0
      ? Math.floor(targetCountRaw)
      : null;

  if (!label || label.length > 100) {
    return NextResponse.json({ error: "Invalid label" }, { status: 400 });
  }

  const db = supabaseForUserData();

  // Find the next sort_order
  const { data: maxRow } = await db
    .from("daily_task_templates")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? -1) + 1;

  // Generate a unique id with a manual_ prefix so we can never collide with
  // an auto-track trigger id.
  const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const insert: TemplateRow & { user_id: string } = {
    id,
    user_id: user.id,
    label,
    href: "/",
    sort_order: sortOrder,
    target_count: targetCount,
    is_default: false,
  };

  const { error } = await db.from("daily_task_templates").insert(insert);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(toClient(insert));
}
