"use client";

import { useEffect, useRef } from "react";

import {
  getNodeChain,
  type StateTreeNode,
} from "@/lib/chess/analysis/wintrchess/types/StateTreeNode";
import { ClassificationBadge } from "./ClassificationBadge";

export function MoveList({
  rootNode,
  selectedNodeId,
  onSelect,
}: {
  rootNode: StateTreeNode;
  selectedNodeId: string;
  onSelect: (node: StateTreeNode) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const moves = getNodeChain(rootNode).filter((n) => !!n.state.move);
  const pairs: { num: number; white?: StateTreeNode; black?: StateTreeNode }[] =
    [];

  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  // Auto-scroll the active row to the *centre* of the visible area on selection
  // change. `block: "center"` is what wintrchess does — keeps the user oriented
  // when arrow-keying through a long game instead of flicking the row to the
  // top/bottom edge.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      `[data-node-id="${selectedNodeId}"]`,
    );
    active?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedNodeId]);

  if (moves.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
        No moves yet — paste a PGN to begin.
      </div>
    );
  }

  return (
    // h-full so this scroll container actually fills the parent's
    // `min-h-0 flex-1` panel; without it the list content sets its own height
    // and pushes the row vertical instead of scrolling internally.
    <div ref={containerRef} className="h-full overflow-y-auto">
      <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {pairs.map((p) => (
          <li
            key={p.num}
            className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1 px-2 py-2 text-sm"
          >
            <span className="text-right text-xs font-mono text-zinc-400">
              {p.num}.
            </span>
            <MoveCell
              node={p.white}
              selected={selectedNodeId === p.white?.id}
              onSelect={onSelect}
            />
            <MoveCell
              node={p.black}
              selected={selectedNodeId === p.black?.id}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function MoveCell({
  node,
  selected,
  onSelect,
}: {
  node?: StateTreeNode;
  selected: boolean;
  onSelect: (node: StateTreeNode) => void;
}) {
  if (!node?.state.move) return <span className="text-zinc-300">—</span>;

  const cls = node.state.classification;

  return (
    <button
      type="button"
      data-node-id={node.id}
      onClick={() => onSelect(node)}
      className={`flex items-center gap-1.5 rounded-r px-2 py-1 text-left font-mono text-[13px] transition border-l-[3px] ${
        selected
          ? "bg-emerald-50 text-emerald-900 font-semibold border-l-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-100"
          : "border-l-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      <span className="truncate">{node.state.move.san}</span>
      {cls ? <ClassificationBadge classification={cls} size={14} /> : null}
    </button>
  );
}
