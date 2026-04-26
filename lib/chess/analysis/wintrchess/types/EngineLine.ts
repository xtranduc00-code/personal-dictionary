// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

import { maxBy } from "lodash-es";

import type Evaluation from "./Evaluation";

export interface EngineMove {
  uci: string;
  san: string;
}

export interface EngineLine {
  evaluation: Evaluation;
  source: string;
  depth: number;
  index: number;
  moves: EngineMove[];
}

export function getLineGroupSibling(
  lines: EngineLine[],
  referenceLine: EngineLine,
  index: number,
) {
  return lines.find(
    (line) =>
      line.depth == referenceLine.depth &&
      line.source == referenceLine.source &&
      line.index == index,
  );
}

export function getTopEngineLine(lines: EngineLine[]) {
  return maxBy(lines, (line) => line.depth - line.index);
}
