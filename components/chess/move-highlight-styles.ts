/** Last-move overlays for react-chessboard `squareStyles` (algebraic keys). */
//
// chess.com-style yellow-green tint applied to both squares of the previous
// move regardless of who played it.
const MOVE_HIGHLIGHT = "rgba(255, 255, 0, 0.4)";

export const MOVE_HIGHLIGHT_OPPONENT_FROM = MOVE_HIGHLIGHT;
export const MOVE_HIGHLIGHT_OPPONENT_TO = MOVE_HIGHLIGHT;
export const MOVE_HIGHLIGHT_USER_FROM = MOVE_HIGHLIGHT;
export const MOVE_HIGHLIGHT_USER_TO = MOVE_HIGHLIGHT;

export function squareStylesForLastMove(
  from: string,
  to: string,
  _side: "user" | "opponent",
): Record<string, { backgroundColor: string }> {
  return {
    [from]: { backgroundColor: MOVE_HIGHLIGHT },
    [to]: { backgroundColor: MOVE_HIGHLIGHT },
  };
}
