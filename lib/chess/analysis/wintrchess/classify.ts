// Adapted from WintrChess (GPL-3.0). Personal use only. See LICENSE.md.

import type AnalysisOptions from "./types/AnalysisOptions";
import type { StateTreeNode } from "./types/StateTreeNode";
import { Classification, classifValues } from "./constants/Classification";
import {
  extractPreviousStateTreeNode,
  extractCurrentStateTreeNode,
} from "./utils/extractNode";
import { getOpeningName } from "./utils/opening";
import { pointLossClassify } from "./classification/pointLoss";
import { considerBrilliantClassification } from "./classification/brilliant";
import { considerCriticalClassification } from "./classification/critical";

export function classify(node: StateTreeNode, options?: AnalysisOptions) {
  if (!node.parent) {
    throw new Error("no parent node exists to compare with.");
  }

  const previous = extractPreviousStateTreeNode(node.parent);
  const current = extractCurrentStateTreeNode(node);

  if (!previous || !current) {
    throw new Error("information missing from current or previous node.");
  }

  const opts: Required<AnalysisOptions> = {
    includeBrilliant: true,
    includeCritical: true,
    includeTheory: true,
    ...options,
  };

  if (previous.board.moves().length <= 1) {
    return Classification.FORCED;
  }

  const openingName = getOpeningName(current.state.fen);
  if (opts.includeTheory && openingName) {
    return Classification.THEORY;
  }

  if (current.board.isCheckmate()) {
    return Classification.BEST;
  }

  const topMovePlayed = previous.topMove.san == current.playedMove.san;

  let classification = topMovePlayed
    ? Classification.BEST
    : pointLossClassify(previous, current);

  if (
    opts.includeCritical &&
    topMovePlayed &&
    considerCriticalClassification(previous, current)
  )
    classification = Classification.CRITICAL;

  if (
    opts.includeBrilliant &&
    classifValues[classification] >= classifValues[Classification.BEST] &&
    considerBrilliantClassification(previous, current)
  )
    classification = Classification.BRILLIANT;

  return classification;
}
