// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Chess, Square, PieceSymbol, KING } from "chess.js";
import { isEqual, xorWith } from "lodash-es";

import type { BoardPiece } from "../types/BoardPiece";
import { type RawMove, toRawMove } from "../types/RawMove";
import { adaptPieceColour, flipPieceColour } from "../constants/PieceColour";
import { setFenTurn, getCaptureSquare } from "../chess-utils";

interface TransitiveAttacker {
  directFen: string;
  square: Square;
  type: PieceSymbol;
}

function directAttackingMoves(board: Chess, piece: BoardPiece): RawMove[] {
  const attackerBoard = new Chess(
    setFenTurn(board.fen(), adaptPieceColour(flipPieceColour(piece.color))),
  );

  const attackingMoves: RawMove[] = attackerBoard
    .moves({ verbose: true })
    .filter((move) => getCaptureSquare(move) == piece.square)
    .map(toRawMove);

  const kingAttackerSquare = attackerBoard
    .attackers(piece.square)
    .find(
      (attackerSquare) => attackerBoard.get(attackerSquare)?.type == KING,
    );

  if (
    kingAttackerSquare &&
    !attackingMoves.some((attack) => attack.piece == KING)
  ) {
    attackingMoves.push({
      piece: KING,
      color: flipPieceColour(piece.color),
      from: kingAttackerSquare,
      to: piece.square,
    });
  }

  return attackingMoves;
}

export function getAttackingMoves(
  board: Chess,
  piece: BoardPiece,
  transitive: boolean = true,
): RawMove[] {
  const attackingMoves = directAttackingMoves(board, piece);
  if (!transitive) return attackingMoves;

  const frontier: TransitiveAttacker[] = attackingMoves.map(
    (attackingMove) => ({
      directFen: board.fen(),
      square: attackingMove.from,
      type: attackingMove.piece,
    }),
  );

  while (frontier.length > 0) {
    const transitiveAttacker = frontier.pop();
    if (!transitiveAttacker) break;

    const transitiveBoard = new Chess(transitiveAttacker.directFen);

    if (transitiveAttacker.type == KING) continue;

    const oldAttackingMoves = directAttackingMoves(transitiveBoard, piece);

    transitiveBoard.remove(transitiveAttacker.square);

    const revealedAttackingMoves = xorWith(
      oldAttackingMoves.filter(
        (attackingMove) => attackingMove.from != transitiveAttacker.square,
      ),
      directAttackingMoves(transitiveBoard, piece),
      isEqual,
    );

    attackingMoves.push(...revealedAttackingMoves);

    frontier.push(
      ...revealedAttackingMoves.map((attackingMove) => ({
        directFen: transitiveBoard.fen(),
        square: attackingMove.from,
        type: attackingMove.piece,
      })),
    );
  }

  return attackingMoves;
}
