import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const db = supabaseForUserData();
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { correct?: number; total?: number };

  // Increment cumulative stats and update last_drilled_at
  const { data: existing } = await db
    .from("repertoire_lines")
    .select("drill_correct, drill_total")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await db
    .from("repertoire_lines")
    .update({
      drill_correct:   (existing.drill_correct ?? 0) + (body.correct ?? 0),
      drill_total:     (existing.drill_total   ?? 0) + (body.total   ?? 0),
      last_drilled_at: new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
