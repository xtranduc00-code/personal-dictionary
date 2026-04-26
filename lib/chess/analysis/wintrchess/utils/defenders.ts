// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Chess } from "chess.js";
import { minBy } from "lodash-es";

import type { BoardPiece } from "../types/BoardPiece";
import { adaptPieceColour, flipPieceColour } from "../constants/PieceColour";
import { setFenTurn } from "../chess-utils";
import { getAttackingMoves } from "./attackers";

export function getDefendingMoves(
  board: Chess,
  piece: BoardPiece,
  transitive: boolean = true,
) {
  const defenderBoard = new Chess(board.fen());

  const attackingMoves = getAttackingMoves(defenderBoard, piece, false);

  const smallestRecapturerSet = minBy(
    attackingMoves
      .map((attackingMove) => {
        const captureBoard = new Chess(
          setFenTurn(
            defenderBoard.fen(),
            adaptPieceColour(flipPieceColour(piece.color)),
          ),
        );

        try {
          captureBoard.move(attackingMove);
        } catch {
          return;
        }

        return getAttackingMoves(
          captureBoard,
          {
            type: attackingMove.piece,
            color: attackingMove.color,
            square: attackingMove.to,
          },
          transitive,
        );
      })
      .filter((recapturers) => !!recapturers),
    (recapturers) => recapturers.length,
  );

  if (!smallestRecapturerSet) {
    const flippedPiece: BoardPiece = {
      type: piece.type,
      color: flipPieceColour(piece.color),
      square: piece.square,
    };

    defenderBoard.put(flippedPiece, piece.square);
    return getAttackingMoves(defenderBoard, flippedPiece, transitive);
  }

  return smallestRecapturerSet;
}
