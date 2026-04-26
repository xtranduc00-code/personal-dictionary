import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, PuzzleDbMissingError } from "@/lib/chess/puzzles-api/db";
import { NO_STORE_HEADERS } from "@/lib/chess/puzzles-api/constants";

/**
 * POST /api/chess/puzzles/:puzzleId/attempt
 * Body: { solved: boolean, hintsUsed?: 0..3, durationMs?: number }
 *
 * Records a single attempt against the local puzzle library. Writes a row
 * to `progress.attempts` (in `data/progress.sqlite`). No auth — this is a
 * single-user app per the project spec.
 *
 * Returns the freshly-updated solved count for the puzzle's difficulty
 * bucket so the client doesn't have to re-fetch the library list just to
 * tick the progress bar.
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
    const db = getDb();

    // Verify the puzzle exists. The Lichess set lives in `puzzles`; game-
    // extracted puzzles in `progress.game_puzzles` (gp_ prefix). Either
    // is acceptable — we just need confirmation before writing the
    // attempt row, and we want the puzzle's "level" for the progress
    // bar refresh.
    let level: string | null = null;
    if (puzzleId.startsWith("gp_")) {
      const row = db
        .prepare(`SELECT 1 FROM progress.game_puzzles WHERE id = ?`)
        .get(puzzleId);
      if (!row) {
        return NextResponse.json({ error: "Puzzle not found", puzzleId }, { status: 404 });
      }
      // Game puzzles aren't bucketed by Lichess difficulty levels — return
      // a synthetic value so the FE can still display a counter; nothing
      // else depends on this exact string.
      level = "from-my-games";
    } else {
      const exists = db
        .prepare(`SELECT level FROM puzzles WHERE puzzle_id = ?`)
        .get(puzzleId) as { level: string } | undefined;
      if (!exists) {
        return NextResponse.json({ error: "Puzzle not found", puzzleId }, { status: 404 });
      }
      level = exists.level;
    }

    db.prepare(
      `INSERT INTO progress.attempts (puzzle_id, attempted_at, solved, hints_used, duration_ms)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(puzzleId, Date.now(), solved ? 1 : 0, hintsUsed, durationMs);

    // Refresh the level-scoped solved count so the UI's progress bar can
    // tick without a list reload. For Lichess puzzles this is the puzzle
    // count at the bucket; for game-puzzles we report the total game-
    // puzzles solved so the value is meaningful in either context.
    let levelSolvedCount: number;
    if (puzzleId.startsWith("gp_")) {
      const r = db
        .prepare(
          `SELECT COUNT(DISTINCT a.puzzle_id) AS n
             FROM progress.attempts a
             JOIN progress.game_puzzles gp ON gp.id = a.puzzle_id
            WHERE a.solved = 1`,
        )
        .get() as { n: number };
      levelSolvedCount = r.n;
    } else {
      const r = db
        .prepare(
          `SELECT COUNT(DISTINCT a.puzzle_id) AS n
             FROM progress.attempts a
             JOIN puzzles p ON p.puzzle_id = a.puzzle_id
            WHERE a.solved = 1 AND p.level = ?`,
        )
        .get(level) as { n: number };
      levelSolvedCount = r.n;
    }

    console.log(
      `[chess/puzzles/:puzzleId/attempt] ok puzzle=${puzzleId} solved=${solved} hints=${hintsUsed} ms=${durationMs}`,
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
    if (e instanceof PuzzleDbMissingError) {
      return NextResponse.json(
        { error: e.message, dbMissing: true },
        { status: 503 },
      );
    }
    console.error("[chess/puzzles/:puzzleId/attempt]", e);
    return NextResponse.json(
      { error: "Failed to record attempt" },
      { status: 500 },
    );
  }
}
