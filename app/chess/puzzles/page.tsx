"use client";

import { ChessWorkspace } from "../chess-workspace";

/**
 * Direct entry into the puzzle library. Optional query params (level, theme,
 * q, sort) are picked up by the library on mount via its existing filter UI;
 * deep-linking simply lands the user in the right list.
 */
export default function ChessPuzzlesLibraryPage() {
  return <ChessWorkspace initialMode="puzzles" />;
}
