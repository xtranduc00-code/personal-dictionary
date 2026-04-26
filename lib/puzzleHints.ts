// Progressive 3-level hints derived from a puzzle's themes (Lichess) and
// the first move of its solution.
//
// Level 1 — motif name + one-line description from a theme lookup.
// Level 2 — which piece moves, by piece + origin square.
// Level 3 — destination hint (file/rank), one step short of the literal move.

import { Chess, type PieceSymbol } from "chess.js";

const PIECE_NAMES: Record<PieceSymbol, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

interface ThemeInfo {
  /** Short human label, e.g. "Fork" or "Mate in 2". */
  label: string;
  /** One-line description shown in level 1. */
  description: string;
}

/**
 * 25+ most common Lichess puzzle themes mapped to label + description.
 * Source: https://github.com/lichess-org/lila/blob/master/translation/source/puzzleTheme.xml
 */
export const THEME_INFO: Record<string, ThemeInfo> = {
  fork: {
    label: "Fork",
    description: "One piece attacks two targets at once.",
  },
  pin: {
    label: "Pin",
    description: "A piece is stuck shielding a more valuable one behind it.",
  },
  skewer: {
    label: "Skewer",
    description:
      "A high-value piece is attacked; moving it exposes a lesser piece behind.",
  },
  discoveredAttack: {
    label: "Discovered attack",
    description:
      "Moving one piece unmasks an attack from another piece behind it.",
  },
  doubleCheck: {
    label: "Double check",
    description: "Two pieces attack the king at once — only the king can move.",
  },
  hangingPiece: {
    label: "Hanging piece",
    description: "An undefended piece is sitting there for free.",
  },
  trappedPiece: {
    label: "Trapped piece",
    description: "A piece has no safe squares — it can be won.",
  },
  attraction: {
    label: "Attraction",
    description: "Lure an opposing piece onto a bad square, then exploit it.",
  },
  deflection: {
    label: "Deflection",
    description: "Force a defender away from the square it's protecting.",
  },
  decoy: {
    label: "Decoy",
    description: "Drag the opponent's piece to a square where it's vulnerable.",
  },
  sacrifice: {
    label: "Sacrifice",
    description: "Give up material to unlock a stronger follow-up.",
  },
  clearance: {
    label: "Clearance",
    description: "Get a piece out of the way to open a line for another.",
  },
  interference: {
    label: "Interference",
    description: "Block a defender's line by interposing a piece.",
  },
  xRayAttack: {
    label: "X-ray",
    description: "Attack through a piece to hit a target behind it.",
  },
  zwischenzug: {
    label: "Zwischenzug",
    description:
      "An in-between move that ignores the expected reply to create a bigger threat.",
  },
  quietMove: {
    label: "Quiet move",
    description: "A non-capture, non-check move that sets up an unstoppable threat.",
  },
  mate: { label: "Checkmate", description: "There is a forced checkmate." },
  mateIn1: { label: "Mate in 1", description: "One move delivers checkmate." },
  mateIn2: {
    label: "Mate in 2",
    description: "A two-move forcing sequence ends in checkmate.",
  },
  mateIn3: {
    label: "Mate in 3",
    description: "A three-move forcing sequence ends in checkmate.",
  },
  mateIn4: {
    label: "Mate in 4",
    description: "A four-move forcing sequence ends in checkmate.",
  },
  mateIn5: {
    label: "Mate in 5",
    description: "A five-move forcing sequence ends in checkmate.",
  },
  backRankMate: {
    label: "Back-rank mate",
    description: "Watch the back rank — the king has no escape squares.",
  },
  smotheredMate: {
    label: "Smothered mate",
    description: "The king is boxed in by its own pieces — a knight delivers mate.",
  },
  arabianMate: {
    label: "Arabian mate",
    description: "A rook + knight pattern traps the king in the corner.",
  },
  bodenMate: {
    label: "Boden's mate",
    description: "Two crossing bishops deliver mate against a castled king.",
  },
  doubleBishopMate: {
    label: "Double bishop mate",
    description: "Two bishops corner the king together.",
  },
  hookMate: {
    label: "Hook mate",
    description: "Rook, knight, and pawn combine to mate on the edge.",
  },
  advancedPawn: {
    label: "Advanced pawn",
    description: "A passed pawn near promotion is the deciding threat.",
  },
  promotion: {
    label: "Promotion",
    description: "A pawn pushes through to promote.",
  },
  underPromotion: {
    label: "Underpromotion",
    description: "Promoting to something other than a queen is the trick.",
  },
  exposedKing: {
    label: "Exposed king",
    description: "The king has no shelter — open lines decide it.",
  },
  kingsideAttack: {
    label: "Kingside attack",
    description: "Pile pieces against the kingside.",
  },
  queensideAttack: {
    label: "Queenside attack",
    description: "The decisive blow comes on the queenside.",
  },
  zugzwang: {
    label: "Zugzwang",
    description: "Every legal move worsens the opponent's position.",
  },
  endgame: { label: "Endgame", description: "Endgame technique decides this." },
  rookEndgame: {
    label: "Rook endgame",
    description: "Rook activity and king position are everything.",
  },
  pawnEndgame: {
    label: "Pawn endgame",
    description: "Counting tempi and key squares is the key.",
  },
  defensiveMove: {
    label: "Defensive move",
    description: "The right defence neutralises a heavy threat.",
  },
  intermezzo: {
    label: "Intermezzo",
    description: "Inject a forcing move before recapturing.",
  },
  capturingDefender: {
    label: "Capturing the defender",
    description: "Eliminate the piece holding the position together.",
  },
  attackingF2F7: {
    label: "Attacking f2 / f7",
    description: "The weakest square near the uncastled king is the target.",
  },
  crushing: {
    label: "Crushing tactic",
    description: "There is a winning forced line — find the strongest move.",
  },
};

const FILE_NAMES: Record<string, string> = {
  a: "a",
  b: "b",
  c: "c",
  d: "d",
  e: "e",
  f: "f",
  g: "g",
  h: "h",
};

/** Pick the most informative theme, preferring specific motifs over generic tags. */
const GENERIC_LAST = new Set([
  "crushing",
  "advantage",
  "endgame",
  "middlegame",
  "opening",
  "long",
  "short",
  "veryLong",
  "oneMove",
  "master",
  "masterVsMaster",
  "superGM",
]);

export function pickPrimaryTheme(themes: string[]): string | undefined {
  const known = themes.find((t) => THEME_INFO[t] && !GENERIC_LAST.has(t));
  if (known) return known;
  // Fall back to any theme we have copy for, even generic ones.
  return themes.find((t) => THEME_INFO[t]);
}

export interface PuzzleHintLevel1 {
  level: 1;
  label: string;
  description: string;
}

export interface PuzzleHintLevel2 {
  level: 2;
  text: string;
}

export interface PuzzleHintLevel3 {
  level: 3;
  text: string;
}

export type PuzzleHint = PuzzleHintLevel1 | PuzzleHintLevel2 | PuzzleHintLevel3;

/** Level 1 — motif name + description, derived from themes. */
export function buildLevel1Hint(themes: string[]): PuzzleHintLevel1 {
  const primary = pickPrimaryTheme(themes);
  if (primary && THEME_INFO[primary]) {
    return { level: 1, label: THEME_INFO[primary].label, description: THEME_INFO[primary].description };
  }
  return {
    level: 1,
    label: "Tactic",
    description: "Look for a forcing move that creates more than one threat.",
  };
}

/** Level 2 — which piece moves and from where. */
export function buildLevel2Hint(
  fen: string,
  solutionUci: string,
): PuzzleHintLevel2 {
  const from = solutionUci.slice(0, 2);
  try {
    const board = new Chess(fen);
    const piece = board.get(from as never);
    if (piece) {
      const name = PIECE_NAMES[piece.type] ?? "piece";
      return {
        level: 2,
        text: `Your ${name} on ${from} has the key move.`,
      };
    }
  } catch {
    // fall through
  }
  return { level: 2, text: `The piece on ${from} has the key move.` };
}

/** Level 3 — destination hint (file or rank) without the literal move. */
export function buildLevel3Hint(
  fen: string,
  solutionUci: string,
): PuzzleHintLevel3 {
  const from = solutionUci.slice(0, 2);
  const to = solutionUci.slice(2, 4);
  const file = to[0];
  const rank = to[1];

  let pieceName = "piece";
  try {
    const board = new Chess(fen);
    const piece = board.get(from as never);
    if (piece) pieceName = PIECE_NAMES[piece.type] ?? "piece";
  } catch {
    // ignore
  }

  // Prefer file when the move shifts files (most tactics); fall back to rank.
  if (FILE_NAMES[file] && from[0] !== file) {
    return {
      level: 3,
      text: `Move your ${pieceName} to the ${file}-file — toward ${to.toLowerCase()}'s area.`,
    };
  }
  return {
    level: 3,
    text: `Move your ${pieceName} along the ${rank}-rank — toward ${to.toLowerCase()}'s area.`,
  };
}

export const HINT_MAX_LEVEL = 3;
