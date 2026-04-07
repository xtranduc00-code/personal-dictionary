import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const LEVELS = new Set(["beginner", "intermediate", "hard", "expert"]);

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const puzzleId = typeof body.puzzleId === "string" ? body.puzzleId.trim() : "";
  const levelRaw = typeof body.level === "string" ? body.level.trim() : "";
  const attempts = typeof body.attempts === "number" && Number.isFinite(body.attempts) ? Math.floor(body.attempts) : 1;

  if (!puzzleId) return NextResponse.json({ error: "puzzleId required" }, { status: 400 });
  if (!LEVELS.has(levelRaw)) return NextResponse.json({ error: "invalid level" }, { status: 400 });
  if (attempts < 1) return NextResponse.json({ error: "attempts must be >= 1" }, { status: 400 });

  const db = supabaseForUserData();
  const { error } = await db.from("user_puzzle_progress").upsert(
    {
      user_id: user.id,
      puzzle_id: puzzleId,
      puzzle_level: levelRaw,
      solved_at: new Date().toISOString(),
      attempts,
    },
    { onConflict: "user_id,puzzle_id" },
  );

  if (error) {
    console.error("[library/progress POST]", error);
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
