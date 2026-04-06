export const CHESS_MOVE_ANNOUNCE_KEY = "ken_chess_move_announce";

export const CHESS_MOVE_ANNOUNCE_EVENT = "ken:chess-move-announce-changed";

export function readChessMoveAnnounceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(CHESS_MOVE_ANNOUNCE_KEY) !== "0";
}

export function writeChessMoveAnnounceEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHESS_MOVE_ANNOUNCE_KEY, on ? "1" : "0");
  window.dispatchEvent(new Event(CHESS_MOVE_ANNOUNCE_EVENT));
}
