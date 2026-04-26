// Adapted from WintrChess (GPL-3.0). Personal use only.
//
// Single-engine, local-only evaluation driver. No cloud eval.

import { round, sum } from "lodash-es";

import {
  getNodeChain,
  type StateTreeNode,
} from "./wintrchess/types/StateTreeNode";
import { Engine, STOCKFISH_DEFAULT } from "./engine";

export interface EvaluateOptions {
  workerFilename?: string;
  multiPv?: number;
  depth?: number;
  timeLimit?: number;
  onProgress?: (progress: number) => void;
}

export interface EvaluationProcess {
  evaluate: () => Promise<StateTreeNode[]>;
  cancel: () => void;
}

export function createGameEvaluator(
  rootNode: StateTreeNode,
  initialFen: string,
  options: EvaluateOptions = {},
): EvaluationProcess {
  const {
    workerFilename = STOCKFISH_DEFAULT,
    multiPv = 2,
    depth = 14,
    timeLimit,
  } = options;

  const stateTreeNodes = getNodeChain(rootNode);
  const progresses: number[] = stateTreeNodes.map(() => 0);

  let cancelled = false;
  let activeEngine: Engine | null = null;

  function getProgress() {
    return round(sum(progresses) / Math.max(stateTreeNodes.length, 1), 3);
  }

  async function evaluate(): Promise<StateTreeNode[]> {
    const engine = new Engine(workerFilename);
    activeEngine = engine;
    engine.setLineCount(multiPv);

    try {
      for (let i = 0; i < stateTreeNodes.length; i++) {
        if (cancelled) break;

        const node = stateTreeNodes[i];

        // The root node has no played move, but we still want a top line
        // for the starting position so child classification can compare.
        const uciMoves = stateTreeNodes
          .slice(1, i + 1)
          .map((n) => n.state.move?.uci)
          .filter((uci): uci is string => !!uci);

        engine.setPosition(initialFen, uciMoves);

        const lines = await engine.evaluate({
          depth,
          timeLimit: timeLimit ? timeLimit * 1000 : undefined,
          onEngineLine: (line) => {
            const localProgress =
              line.depth == 0 ? 1 : line.depth / depth;
            progresses[i] = Math.max(progresses[i], localProgress);
            options.onProgress?.(getProgress());
          },
        });

        progresses[i] = 1;
        options.onProgress?.(getProgress());

        node.state.engineLines = [...node.state.engineLines, ...lines];
      }
    } finally {
      engine.terminate();
      activeEngine = null;
    }

    return stateTreeNodes;
  }

  function cancel() {
    cancelled = true;
    activeEngine?.terminate();
  }

  return { evaluate, cancel };
}
