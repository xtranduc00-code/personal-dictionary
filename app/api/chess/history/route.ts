import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const supabaseServer = supabaseForUserData();

const TERMINAL = ["finished", "resigned", "draw", "timeout"];

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const result     = url.searchParams.get("result") ?? "";
  const timeCtrl   = url.searchParams.get("time_control") ?? "";
  const from       = url.searchParams.get("from") ?? "";
  const to         = url.searchParams.get("to") ?? "";
  const limit      = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
  const offset     = parseInt(url.searchParams.get("offset") ?? "0");

  // ── Base query ──────────────────────────────────────────────────────────────
  let query = supabaseServer
    .from("chess_games")
    .select("*", { count: "exact" })
    .or(`white_user_id.eq.${user.id},black_user_id.eq.${user.id}`)
    .in("status", TERMINAL)
    .order("created_at", { ascending: false });

  if (timeCtrl) query = query.eq("time_control", timeCtrl);
  if (from)     query = query.gte("created_at", from);
  if (to)       query = query.lte("created_at", to);

  // Get a larger page when filtering by result (server can't filter by relative win/loss easily)
  const fetchLimit = result ? Math.min(limit * 10, 500) : limit;
  query = query.range(offset, offset + fetchLimit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });

  const userId = user.id;

  const enriched = (data ?? []).map((row) => {
    const isWhite = row.white_user_id === userId;
    const isBlack = row.black_user_id === userId;
    const myColor = isWhite ? "white" : isBlack ? "black" : null;

    let gameResult: "win" | "loss" | "draw" | null = null;
    if (row.winner === "draw") {
      gameResult = "draw";
    } else if (myColor && row.winner === myColor) {
      gameResult = "win";
    } else if (myColor && row.winner && row.winner !== myColor) {
      gameResult = "loss";
    }

    return {
      id: row.id,
      roomCode: row.room_code,
      fen: row.fen,
      pgn: row.pgn ?? "",
      whiteUserId: row.white_user_id,
      blackUserId: row.black_user_id,
      status: row.status,
      turn: row.turn,
      winner: row.winner,
      whitePlayer: row.white_player ?? null,
      blackPlayer: row.black_player ?? null,
      whiteAccuracy: row.white_accuracy ?? null,
      blackAccuracy: row.black_accuracy ?? null,
      timeControl: row.time_control ?? null,
      durationSeconds: row.duration_seconds ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      myColor,
      result: gameResult,
    };
  });

  // Client-side result filter (when requested)
  const filtered = result
    ? enriched.filter((g) => g.result === result).slice(0, limit)
    : enriched;

  return NextResponse.json({ items: filtered, total: count ?? 0 });
}
