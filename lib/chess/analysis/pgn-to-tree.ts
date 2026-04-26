// MVP PGN → mainline state tree. Uses chess.js loadPgn to avoid pulling in
// @mliebelt/pgn-parser; variations are dropped (not needed for this MVP).

import { Chess } from "chess.js";
import { uniqueId } from "lodash-es";

import PieceColour from "./wintrchess/constants/PieceColour";
import { STARTING_FEN } from "./wintrchess/constants/pieces";
import type { StateTreeNode } from "./wintrchess/types/StateTreeNode";

export interface PgnHeaders {
  white?: string;
  black?: string;
  whiteElo?: string;
  blackElo?: string;
  result?: string;
  date?: string;
  event?: string;
  site?: string;
  fen?: string;
}

export interface ParsedPgn {
  rootNode: StateTreeNode;
  initialFen: string;
  headers: PgnHeaders;
  moveCount: number;
}

function readHeaders(board: Chess): PgnHeaders {
  const h = board.getHeaders() as Record<string, string | undefined>;
  return {
    white: h["White"],
    black: h["Black"],
    whiteElo: h["WhiteElo"],
    blackElo: h["BlackElo"],
    result: h["Result"],
    date: h["Date"],
    event: h["Event"],
    site: h["Site"],
    fen: h["FEN"],
  };
}

export function parsePgnToStateTree(pgn: string): ParsedPgn {
  const trimmed = pgn.trim();
  if (!trimmed) throw new Error("PGN is empty.");

  const board = new Chess();
  // chess.js throws on invalid PGN
  board.loadPgn(trimmed, { strict: false });

  const headers = readHeaders(board);
  const initialFen = headers.fen || STARTING_FEN;

  // Walk the game move-by-move from a fresh board so we capture each FEN
  const replay = new Chess(initialFen);
  const moveHistory = board.history({ verbose: true });

  const rootNode: StateTreeNode = {
    id: uniqueId(),
    mainline: true,
    children: [],
    state: { fen: replay.fen(), engineLines: [] },
  };

  let lastNode = rootNode;

  for (const move of moveHistory) {
    const applied = replay.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
    if (!applied) break;

    const newNode: StateTreeNode = {
      id: uniqueId(),
      mainline: true,
      parent: lastNode,
      children: [],
      state: {
        fen: replay.fen(),
        engineLines: [],
        move: { san: applied.san, uci: applied.lan },
        moveColour:
          applied.color == "w" ? PieceColour.WHITE : PieceColour.BLACK,
      },
    };

    lastNode.children.push(newNode);
    lastNode = newNode;
  }

  return {
    rootNode,
    initialFen,
    headers,
    moveCount: moveHistory.length,
  };
}
