import { NextResponse } from "next/server";
import { z } from "zod";
import { Classification } from "@/lib/chess/analysis/wintrchess/constants/Classification";
import type { StateTreeNode } from "@/lib/chess/analysis/wintrchess/types/StateTreeNode";
import {
  extractTrainablePuzzles,
  gameIdFromPgn,
} from "@/lib/chess/puzzles-api/game-puzzles";
import {
  persistExtracted,
} from "@/lib/chess/puzzles-api/game-puzzles-repo";
import { PuzzleDbMissingError } from "@/lib/chess/puzzles-api/db";
import { NO_STORE_HEADERS } from "@/lib/chess/puzzles-api/constants";

/**
 * POST /api/chess/game-puzzles/extract
 *
 * Body: { pgn, initialFen?, rootNode (StateTreeNode tree), sourceUrl?,
 *         whiteName?, blackName? }
 *
 * Pulls every trainable position out of the analysed game tree (mistakes
 * + blunders with eval-swing ≥ 150 cp) and writes them to
 * `progress.game_puzzles`. Idempotent: re-analysing the same PGN produces
 * the same synthetic ids and INSERT OR IGNORE silently no-ops.
 *
 * The client calls this once when an analysis run finishes successfully —
 * the route handler doesn't re-evaluate, just reads the cached PV / class
 * fields off each StateTreeNode.
 */

// Zod schemas for the bits of StateTreeNode we actually read. Anything
// extra is allowed through (`.passthrough()`) so future evolutions of the
// analysis tree don't break this endpoint.
const EngineMoveSchema = z.object({ uci: z.string(), san: z.string() });
const EvaluationSchema = z.object({
  type: z.enum(["centipawn", "mate"]),
  value: z.number(),
});
const EngineLineSchema = z
  .object({
    evaluation: EvaluationSchema,
    source: z.string(),
    depth: z.number(),
    index: z.number(),
    moves: z.array(EngineMoveSchema),
  })
  .passthrough();
type SerializedNode = {
  id: string;
  mainline: boolean;
  state: {
    fen: string;
    move?: { san: string; uci: string };
    moveColour?: unknown;
    engineLines: unknown[];
    classification?: string;
    accuracy?: number;
    opening?: string;
  };
  children: SerializedNode[];
};
const StateTreeNodeSchema: z.ZodType<SerializedNode> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      mainline: z.boolean(),
      state: z
        .object({
          fen: z.string(),
          move: z.object({ san: z.string(), uci: z.string() }).optional(),
          moveColour: z.any().optional(),
          engineLines: z.array(EngineLineSchema),
          classification: z.string().optional(),
          accuracy: z.number().optional(),
          opening: z.string().optional(),
        })
        .passthrough(),
      children: z.array(StateTreeNodeSchema),
    })
    .passthrough(),
);
const ExtractRequestSchema = z.object({
  pgn: z.string().min(1),
  initialFen: z.string().optional(),
  rootNode: StateTreeNodeSchema,
  sourceUrl: z.string().url().optional().nullable(),
  whiteName: z.string().optional().nullable(),
  blackName: z.string().optional().nullable(),
});

/** Re-link parent refs after JSON round-trip. The localStorage helper does
 *  the same — that's what makes StateTreeNode usable post-deserialisation
 *  (parent walks during ply numbering, etc.). */
function relinkParents(
  node: SerializedNode,
  parent?: StateTreeNode,
): StateTreeNode {
  const live = {
    ...node,
    parent,
    children: [],
  } as unknown as StateTreeNode;
  // Defensive: the validated `classification` is a free string; coerce to
  // the enum (or strip if unknown) so downstream comparison-by-enum works.
  const cls = node.state.classification;
  const validCls = cls && Object.values(Classification).includes(cls as Classification)
    ? (cls as Classification)
    : undefined;
  live.state = {
    ...node.state,
    classification: validCls,
    engineLines: (node.state.engineLines ?? []) as StateTreeNode["state"]["engineLines"],
  } as StateTreeNode["state"];
  live.children = node.children.map((c) => relinkParents(c, live));
  return live;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const { pgn, initialFen, rootNode, sourceUrl, whiteName, blackName } = parsed.data;

  try {
    const tree = relinkParents(rootNode);
    const puzzles = extractTrainablePuzzles(tree, { pgn, initialFen });

    if (puzzles.length === 0) {
      // Common case: clean game, nothing to train. Skip the DB roundtrip
      // and report zeros so the client UI shows a calm "no blunders" state.
      console.log(
        `[chess/game-puzzles/extract] no_blunders pgn_hash=${gameIdFromPgn(pgn)}`,
      );
      return NextResponse.json(
        { gameId: gameIdFromPgn(pgn), extracted: 0, inserted: 0, existed: 0 },
        { headers: NO_STORE_HEADERS },
      );
    }

    const { inserted, existed } = persistExtracted({
      pgn,
      sourceUrl: sourceUrl ?? null,
      whiteName: whiteName ?? null,
      blackName: blackName ?? null,
      puzzles,
    });
    console.log(
      `[chess/game-puzzles/extract] gameId=${puzzles[0].gameId} extracted=${puzzles.length} inserted=${inserted} existed=${existed}`,
    );

    return NextResponse.json(
      {
        gameId: puzzles[0].gameId,
        extracted: puzzles.length,
        inserted,
        existed,
        // Surface the ids so the client can deep-link the most recent one
        // without a follow-up list call.
        puzzles: puzzles.map((p) => ({
          id: p.id,
          ply: p.ply,
          fullmove: p.fullmove,
          side: p.side,
          classification: p.classification,
          swingCp: p.swingCp,
        })),
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
    console.error("[chess/game-puzzles/extract]", e);
    return NextResponse.json(
      { error: "Failed to extract puzzles" },
      { status: 500 },
    );
  }
}
