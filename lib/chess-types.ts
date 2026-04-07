export type PuzzleLevel = "beginner" | "intermediate" | "hard" | "expert";

export type LibraryPuzzle = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  level: PuzzleLevel;
};
