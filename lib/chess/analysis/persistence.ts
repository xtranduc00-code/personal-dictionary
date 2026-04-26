// localStorage cache for the last completed analysis. Drops StateTreeNode
// parent refs before stringifying and re-links them on load.

import type { StateTreeNode } from "./wintrchess/types/StateTreeNode";

const STORAGE_KEY = "chess-analysis-last-v1";

type SerializedNode = Omit<StateTreeNode, "parent" | "children"> & {
  children: SerializedNode[];
};

export interface PersistedAnalysisStats {
  white: number;
  black: number;
  whiteName: string;
  blackName: string;
  whiteElo?: string;
  blackElo?: string;
}

export interface PersistedAnalysis {
  version: 1;
  savedAt: number;
  pgn: string;
  initialFen: string;
  rootNode: SerializedNode;
  selectedNodeId: string;
  stats: PersistedAnalysisStats | null;
  analyzed: boolean;
}

/** Strip parent refs from a StateTreeNode tree so JSON.stringify won't
 *  hit a circular reference. Exported so the game-puzzle extract POST can
 *  reuse the same serialisation shape this module already invented. */
export function stripParents(node: StateTreeNode): SerializedNode {
  return {
    ...node,
    parent: undefined,
    children: node.children.map(stripParents),
  } as SerializedNode;
}

function relinkParents(
  node: SerializedNode,
  parent?: StateTreeNode,
): StateTreeNode {
  const live: StateTreeNode = {
    ...node,
    parent,
    children: [],
  };
  live.children = node.children.map((c) => relinkParents(c, live));
  return live;
}

export function saveAnalysis(input: {
  pgn: string;
  initialFen: string;
  rootNode: StateTreeNode;
  selectedNodeId: string;
  stats: PersistedAnalysisStats | null;
  analyzed: boolean;
}): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedAnalysis = {
      version: 1,
      savedAt: Date.now(),
      pgn: input.pgn,
      initialFen: input.initialFen,
      rootNode: stripParents(input.rootNode),
      selectedNodeId: input.selectedNodeId,
      stats: input.stats,
      analyzed: input.analyzed,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota or serialization error — silently drop
  }
}

export function loadAnalysis(): {
  pgn: string;
  initialFen: string;
  rootNode: StateTreeNode;
  selectedNodeId: string;
  stats: PersistedAnalysisStats | null;
  analyzed: boolean;
  savedAt: number;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAnalysis;
    if (parsed.version !== 1) return null;
    return {
      pgn: parsed.pgn,
      initialFen: parsed.initialFen,
      rootNode: relinkParents(parsed.rootNode),
      selectedNodeId: parsed.selectedNodeId,
      stats: parsed.stats,
      analyzed: parsed.analyzed,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearAnalysis(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
