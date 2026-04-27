import { NextResponse } from "next/server";
import { z } from "zod";
import { pgOne } from "@/lib/chess/puzzles-api/db";
import { NO_STORE_HEADERS } from "@/lib/chess/puzzles-api/constants";
import { getAuthUser } from "@/lib/get-auth-user";

/**
 * POST /api/chess/puzzles/:puzzleId/attempt
 * Body: { solved: boolean, hintsUsed?: 0..3, durationMs?: number }
 *
 * Records a single attempt for the authenticated user. Writes to
 * `public.chess_attempts` with either `lib_puzzle_id` or `game_puzzle_id`
 * set, never both (CHECK constraint at the DB level).
 *
 * Returns the freshly-updated solved count for the puzzle's difficulty
 * bucket so the client can tick the progress bar without a list reload.
 */

const AttemptSchema = z.object({
  solved: z.boolean(),
  hintsUsed: z.number().int().min(0).max(3).optional().default(0),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional().default(0),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ puzzleId: string }> },
): Promise<NextResponse> {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { puzzleId } = await ctx.params;
  if (!puzzleId) {
    return NextResponse.json({ error: "puzzleId required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = AttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid attempt", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { solved, hintsUsed, durationMs } = parsed.data;

  try {
    // Verify the puzzle exists in the right table and capture its level for
    // the post-write progress refresh. The `gp_` prefix tags game-extracted
    // puzzles; everything else is a Lichess library id.
    const isGamePuzzle = puzzleId.startsWith("gp_");
    let level: string;
    if (isGamePuzzle) {
      const exists = await pgOne<{ id: string }>(
        `SELECT id FROM public.chess_game_puzzles
          WHERE id = $1 AND user_id = $2`,
        [puzzleId, user.id],
      );
      if (!exists) {
        return NextResponse.json({ error: "Puzzle not found", puzzleId }, { status: 404 });
      }
      // Game puzzles aren't bucketed by Lichess difficulty levels — return
      // a synthetic value so the FE can still display a counter.
      level = "from-my-games";
    } else {
      const row = await pgOne<{ level: string }>(
        `SELECT level FROM public.chess_lib_puzzles WHERE puzzle_id = $1`,
        [puzzleId],
      );
      if (!row) {
        return NextResponse.json({ error: "Puzzle not found", puzzleId }, { status: 404 });
      }
      level = row.level;
    }

    await pgOne(
      `INSERT INTO public.chess_attempts
         (user_id, lib_puzzle_id, game_puzzle_id, solved, hints_used, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        isGamePuzzle ? null : puzzleId,
        isGamePuzzle ? puzzleId : null,
        solved,
        hintsUsed,
        durationMs,
      ],
    );

    let levelSolvedCount: number;
    if (isGamePuzzle) {
      const r = await pgOne<{ n: string | number }>(
        `SELECT COUNT(DISTINCT a.game_puzzle_id) AS n
           FROM public.chess_attempts a
          WHERE a.user_id = $1 AND a.solved = TRUE AND a.game_puzzle_id IS NOT NULL`,
        [user.id],
      );
      levelSolvedCount = Number(r?.n ?? 0);
    } else {
      const r = await pgOne<{ n: string | number }>(
        `SELECT COUNT(DISTINCT a.lib_puzzle_id) AS n
           FROM public.chess_attempts a
           JOIN public.chess_lib_puzzles p ON p.puzzle_id = a.lib_puzzle_id
          WHERE a.user_id = $1 AND a.solved = TRUE AND p.level = $2`,
        [user.id, level],
      );
      levelSolvedCount = Number(r?.n ?? 0);
    }

    console.log(
      `[chess/puzzles/:puzzleId/attempt] ok user=${user.id} puzzle=${puzzleId} solved=${solved} hints=${hintsUsed} ms=${durationMs}`,
    );
    return NextResponse.json(
      {
        ok: true,
        puzzleId,
        level,
        solved,
        levelSolvedCount,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    console.error("[chess/puzzles/:puzzleId/attempt]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to record attempt" },
      { status: 500 },
    );
  }
}
