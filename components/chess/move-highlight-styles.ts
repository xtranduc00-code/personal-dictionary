/** Last-move overlays for react-chessboard `squareStyles` (algebraic keys). */
export const MOVE_HIGHLIGHT_OPPONENT_FROM = "rgba(255, 228, 170, 0.58)";
export const MOVE_HIGHLIGHT_OPPONENT_TO = "rgba(255, 165, 70, 0.48)";
export const MOVE_HIGHLIGHT_USER_FROM = "rgba(186, 245, 200, 0.55)";
export const MOVE_HIGHLIGHT_USER_TO = "rgba(34, 197, 94, 0.52)";

export function squareStylesForLastMove(
  from: string,
  to: string,
  side: "user" | "opponent",
): Record<string, { backgroundColor: string }> {
  if (side === "user") {
    return {
      [from]: { backgroundColor: MOVE_HIGHLIGHT_USER_FROM },
      [to]: { backgroundColor: MOVE_HIGHLIGHT_USER_TO },
    };
  }
  return {
    [from]: { backgroundColor: MOVE_HIGHLIGHT_OPPONENT_FROM },
    [to]: { backgroundColor: MOVE_HIGHLIGHT_OPPONENT_TO },
  };
}
