"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import {
  generateMoveCoachExplanation,
  type MoveCoachInput,
  type MoveCoachOutput,
} from "@/lib/chess/analysis/coach";

export function CoachPanel({ input }: { input: MoveCoachInput | null }) {
  const [output, setOutput] = useState<MoveCoachOutput | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!input) {
      setOutput(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.resolve(generateMoveCoachExplanation(input))
      .then((res) => {
        if (!cancelled) setOutput(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  return (
    // "AI talking" style: warm orange left border + tinted surface so the
    // panel reads as advice, distinct from the green Engine Best panel above it.
    <div className="rounded-xl border border-orange-200 border-l-[4px] border-l-orange-500 bg-orange-50/70 p-3 dark:border-orange-900/60 dark:border-l-orange-500 dark:bg-orange-950/20">
      <header className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">
        <Sparkles className="h-3.5 w-3.5" />
        Coach
      </header>

      {!input ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Select a move to see an explanation.
        </p>
      ) : loading ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
        </p>
      ) : output && output.text ? (
        <p className="text-sm leading-snug text-zinc-800 dark:text-zinc-100">
          {output.text}
        </p>
      ) : (
        <p className="text-xs text-zinc-400">No notable insight for this move.</p>
      )}
    </div>
  );
}
