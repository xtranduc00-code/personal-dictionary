/**
 * Extracts trainable puzzle positions from an analysed game's state tree.
 *
 * A "trainable" position is one where the user played a Mistake or Blunder
 * with a meaningful eval swing. The position BEFORE the bad move becomes
 * the puzzle FEN, and the engine's principal variation at that position
 * becomes the solution.
 *
 * Pure module: no I/O, no DB. The HTTP layer takes the array this module
 * produces and persists it.
 */
import { createHash } from "node:crypto";
import { Classification } from "@/lib/chess/analysis/wintrchess/constants/Classification";
import {
  getNodeChain,
  type StateTreeNode,
} from "@/lib/chess/analysis/wintrchess/types/StateTreeNode";
import { getTopEngineLine } from "@/lib/chess/analysis/wintrchess/types/EngineLine";
import type { Evaluation } from "@/lib/chess/analysis/wintrchess/types/Evaluation";

/** Min |eval-swing| (centipawns) for a position to be worth training.
 *  Below this is noise / classifier disagreement, not a teachable moment. */
export const MIN_SWING_CP = 150;
/** Treat a forced mate as ±10 000 cp for swing arithmetic. Any depth of
 *  mate is the same magnitude — finite cp anywhere on the other side
 *  produces a swing well over the 150-cp threshold. */
const MATE_CP = 10_000;
/** Cap the engine PV to this many plies (≈ 3 user moves). Past that the
 *  position has drifted far from the original tactic, branching gets wide,
 *  and the user spends working memory replaying the engine instead of
 *  internalising the lesson. Stockfish PVs at depth 14 routinely reach
 *  16+ plies; trimming keeps each puzzle a focused punch line. */
const MAX_SOLUTION_PLIES = 6;

export interface ExtractedGamePuzzle {
  id: string;             // gp_<gameId12>_<ply>
  gameId: string;         // <gameId12>
  ply: number;            // halfmove index, 1-based
  fullmove: number;       // chess move number
  side: "w" | "b";        // side to move at the puzzle position
  fen: string;            // position BEFORE the bad move
  solutionMoves: string[];// UCI sequence (engine PV at the position)
  playedUci: string;      // the bad move the user actually played
  classification: "mistake" | "blunder";
  evalBeforeCp: number | null;  // null for mate
  evalAfterCp: number | null;
  swingCp: number;
  themes: string[];
}

/** 12-hex prefix of sha256(pgn). Stable per PGN, collision-safe for a
 *  single user. Same PGN re-analysed → same id → INSERT OR IGNORE makes
 *  extraction idempotent. */
export function gameIdFromPgn(pgn: string): string {
  return createHash("sha256").update(pgn).digest("hex").slice(0, 12);
}

function evalToCp(ev: Evaluation | null | undefined): number | null {
  if (!ev) return null;
  if (ev.type === "mate") {
    if (ev.value === 0) return null; // already mated
    return ev.value > 0 ? MATE_CP : -MATE_CP;
  }
  return ev.value;
}

/** Convert "FEN-after-position" knowledge into the side-to-move at the
 *  puzzle position. The puzzle FEN is parent.state.fen, so its 2nd field
 *  carries who's to move. Pulled out as a tiny helper for readability. */
function sideToMoveFromFen(fen: string): "w" | "b" {
  const turn = fen.split(" ")[1];
  return turn === "b" ? "b" : "w";
}

/** True iff the engine PV at the position is a forced mate-in-1: top line
 *  has exactly one move to give and its evaluation is mate ±1. We skip
 *  these — finding M1 isn't training, it's pattern recognition the player
 *  presumably already has by the time they're hanging mates. */
function isObviousMateInOne(parent: StateTreeNode): boolean {
  const top = getTopEngineLine(parent.state.engineLines);
  if (!top) return false;
  if (top.evaluation.type !== "mate") return false;
  if (Math.abs(top.evaluation.value) !== 1) return false;
  return top.moves.length <= 1;
}

/** Pull every trainable position from a finished game analysis. The caller
 *  is responsible for having actually run the analysis; we just read what's
 *  cached on each StateTreeNode. */
export function extractTrainablePuzzles(
  rootNode: StateTreeNode,
  options: {
    pgn: string;          // for stable game id
    initialFen?: string;  // affects fullmove math
  },
): ExtractedGamePuzzle[] {
  const gameId = gameIdFromPgn(options.pgn);
  const chain = getNodeChain(rootNode);
  const out: ExtractedGamePuzzle[] = [];

  // chain[0] is the root (no move), chain[i] = position after move i.
  // For each chain[i] with i >= 1, the parent is the position BEFORE move i.
  for (let i = 1; i < chain.length; i++) {
    const node = chain[i];
    const parent = node.parent;
    if (!parent) continue;

    const cls = node.state.classification;
    if (cls !== Classification.MISTAKE && cls !== Classification.BLUNDER) continue;

    const move = node.state.move;
    if (!move) continue;

    const parentTop = getTopEngineLine(parent.state.engineLines);
    const nodeTop = getTopEngineLine(node.state.engineLines);
    if (!parentTop) continue; // can't form a puzzle without a known best move

    const evalBefore = evalToCp(parentTop.evaluation);
    const evalAfter = evalToCp(nodeTop?.evaluation);
    const swing =
      evalBefore != null && evalAfter != null
        ? Math.abs(evalBefore - evalAfter)
        : MATE_CP; // missing eval-after but we know it's a blunder → still trainable

    if (swing < MIN_SWING_CP) continue;
    if (isObviousMateInOne(parent)) continue;

    const ply = i;
    const fullmove = Math.floor((ply - 1) / 2) + 1;
    const side = sideToMoveFromFen(parent.state.fen);
    const solutionMoves = parentTop.moves.slice(0, MAX_SOLUTION_PLIES).map((m) => m.uci);
    if (solutionMoves.length === 0) continue; // no PV → can't grade attempts

    const themes: string[] = ["from-my-games"];
    themes.push(cls === Classification.BLUNDER ? "blunder" : "mistake");
    // Tag puzzles whose engine PV ends in a mate as `mate` so they show
    // up in the same Mates filter as Lichess mate puzzles.
    const pvLeadsToMate =
      parentTop.evaluation.type === "mate" && parentTop.evaluation.value > 0;
    if (pvLeadsToMate) themes.push("mate");

    out.push({
      id: `gp_${gameId}_${ply}`,
      gameId,
      ply,
      fullmove,
      side,
      fen: parent.state.fen,
      solutionMoves,
      playedUci: move.uci,
      classification: cls === Classification.BLUNDER ? "blunder" : "mistake",
      evalBeforeCp: evalBefore,
      evalAfterCp: evalAfter,
      swingCp: swing,
      themes,
    });
  }

  return out;
}
