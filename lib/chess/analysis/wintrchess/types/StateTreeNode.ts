// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { Chess } from "chess.js";
import { round, uniqueId } from "lodash-es";

import { Classification } from "../constants/Classification";
import PieceColour from "../constants/PieceColour";
import type { EngineLine } from "./EngineLine";

export interface BoardState {
  fen: string;
  move?: { san: string; uci: string };
  moveColour?: PieceColour;
  engineLines: EngineLine[];
  classification?: Classification;
  accuracy?: number;
  opening?: string;
}

export interface StateTreeNode {
  id: string;
  mainline: boolean;
  state: BoardState;
  parent?: StateTreeNode;
  children: StateTreeNode[];
}

/**
 * Returns root node + chain of priority children. With `expand`, walks
 * every child (variations included). MVP only uses mainline.
 */
export function getNodeChain(rootNode: StateTreeNode, expand?: boolean) {
  const chain: StateTreeNode[] = [];
  const frontier: StateTreeNode[] = [rootNode];

  while (frontier.length > 0) {
    const current = frontier.pop();
    if (!current) break;

    chain.push(current);

    for (const child of current.children) {
      frontier.push(child);
      if (!expand) break;
    }
  }

  return chain;
}

export function getNodeMoveNumber(
  node: StateTreeNode,
  initialPosition?: string,
) {
  let initialMoveNumber = 1;

  if (initialPosition) {
    const board = new Chess(initialPosition);
    initialMoveNumber = board.moveNumber() + (board.turn() == "b" ? 0.5 : 0);
  }

  let current: StateTreeNode = node;
  let depth = 0;

  while (current?.parent) {
    current = current.parent;
    depth++;
  }

  const pairDepth = (depth - 1) / 2;
  return round(pairDepth, 1) + initialMoveNumber;
}

export function addChildMove(node: StateTreeNode, san: string) {
  const existingNode = node.children.find(
    (child) => child.state.move?.san == san,
  );

  const childMove = new Chess(node.state.fen).move(san);

  const createdNode: StateTreeNode = {
    id: uniqueId(),
    mainline:
      node.mainline && !node.children.some((child) => child.mainline),
    parent: node,
    children: [],
    state: {
      fen: childMove.after,
      engineLines: [],
      move: { san: childMove.san, uci: childMove.lan },
      moveColour:
        childMove.color == "w" ? PieceColour.WHITE : PieceColour.BLACK,
    },
  };

  if (!existingNode) {
    node.children.push(createdNode);
  }

  return existingNode || createdNode;
}
