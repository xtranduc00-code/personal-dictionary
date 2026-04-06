export type BuiltInPuzzle = {
  id: string;
  title: string;
  fen: string;
  /** UCI moves: alternating player / opponent / player … ends on player's mating move */
  solutionMoves: string[];
  hint: string;
  level: "beginner" | "intermediate" | "hard";
  theme: string;
};

export const BUILT_IN_PUZZLES: BuiltInPuzzle[] = [
  // ── Beginner (mate in 1, simple patterns) ─────────────────────────────────
  {
    id: "b1",
    title: "Fool's Mate",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
    solutionMoves: ["d8h4"],
    hint: "Look at the open diagonal leading to the white king",
    level: "beginner",
    theme: "Diagonal attack",
  },
  {
    id: "b2",
    title: "Scholar's Mate",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    solutionMoves: ["h5f7"],
    hint: "The f7 pawn is only guarded by the king",
    level: "beginner",
    theme: "Queen & bishop battery",
  },
  {
    id: "b3",
    title: "Back Rank Mate",
    fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    solutionMoves: ["d1d8"],
    hint: "A rook on the 8th rank covers every square on that rank",
    level: "beginner",
    theme: "Back rank",
  },
  // ── Intermediate (trickier mate in 1 patterns) ────────────────────────────
  {
    id: "i1",
    title: "Smothered King",
    fen: "6rk/6pp/7N/8/8/8/6PP/6K1 w - - 0 1",
    solutionMoves: ["h6f7"],
    hint: "The king's own pieces can trap it — find the mating square",
    level: "intermediate",
    theme: "Smothered mate",
  },
  {
    id: "i2",
    title: "Bishop Assists the Queen",
    fen: "6k1/5ppp/8/8/8/5B2/5PPP/3Q2K1 w - - 0 1",
    solutionMoves: ["d1d8"],
    hint: "Clear the way for the queen to reach the back rank",
    level: "intermediate",
    theme: "Queen battery",
  },
  {
    id: "i3",
    title: "Queen on the Long Diagonal",
    fen: "6k1/5ppp/8/Q7/8/8/5PPP/6K1 w - - 0 1",
    solutionMoves: ["a5d8"],
    hint: "The queen can travel far on an open diagonal",
    level: "intermediate",
    theme: "Long diagonal",
  },
  {
    id: "i4",
    title: "King & Queen Ending",
    fen: "3k4/4Q3/3K4/8/8/8/8/8 w - - 0 1",
    solutionMoves: ["e7d7"],
    hint: "Use your queen and king together to cover every escape square",
    level: "intermediate",
    theme: "Queen endgame",
  },
  // ── Hard (mate in 2) ───────────────────────────────────────────────────────
  {
    id: "h1",
    title: "Two Rooks – Staircase",
    fen: "7k/8/8/8/8/8/8/KRR5 w - - 0 1",
    // 1. Rb7 (cuts off rank 7 — king forced to g8), 2. Rc8#
    solutionMoves: ["b1b7", "h8g8", "c1c8"],
    hint: "Use both rooks to push the king step by step",
    level: "hard",
    theme: "Two rooks ladder",
  },
  {
    id: "h2",
    title: "Knight & Queen Combo",
    fen: "6k1/5ppp/6N1/8/8/8/5PPP/3Q2K1 w - - 0 1",
    // 1. Ne7+ Kh8 (or Kf8), 2. Qd8#
    solutionMoves: ["g6e7", "g8h8", "d1d8"],
    hint: "Use the knight to drive the king into the queen's line of fire",
    level: "hard",
    theme: "Knight fork & queen mate",
  },
];

export function getPuzzlesByLevel(level: BuiltInPuzzle["level"]): BuiltInPuzzle[] {
  return BUILT_IN_PUZZLES.filter((p) => p.level === level);
}

export function getPuzzleById(id: string): BuiltInPuzzle | undefined {
  return BUILT_IN_PUZZLES.find((p) => p.id === id);
}
