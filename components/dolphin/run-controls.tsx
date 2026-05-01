"use client";

import { Loader2, Play, RotateCcw, Square } from "lucide-react";
import { useDolphin } from "@/lib/dolphin/context";
import type {
  BulkCreateFormValues,
  NameParseError,
  ProfilePair,
  ProxyParseError,
} from "@/lib/dolphin/types";
import { StatusBadge } from "@/components/dolphin/shared/status-badge";

function formatPauseBanner(
  remainingMs: number,
  reason: string | null,
): string {
  const seconds = Math.ceil(remainingMs / 1000);
  if (reason && reason.trim().length > 0) {
    return `${reason} — resuming in ${seconds}s.`;
  }
  return `Rate-limited — resuming in ${seconds}s.`;
}

export function RunControls({
  values,
  pairs,
  proxyErrors,
  nameErrors,
  preflightError,
}: {
  values: BulkCreateFormValues;
  pairs: ProfilePair[];
  proxyErrors: ProxyParseError[];
  nameErrors: NameParseError[];
  preflightError: string | null;
}) {
  const { state, runBulkCreate, cancelRun, resetResults } = useDolphin();

  const isActive = state.status === "running" || state.status === "paused";
  const isTerminal =
    state.status === "idle" ||
    state.status === "done" ||
    state.status === "cancelled" ||
    state.status === "failed";
  const canRun =
    isTerminal && pairs.length > 0 && preflightError === null;
  const showReset = isTerminal && state.results.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={state.status} />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {pairs.length} pair{pairs.length === 1 ? "" : "s"} ready
            {nameErrors.length + proxyErrors.length > 0
              ? ` · ${nameErrors.length + proxyErrors.length} parse error${
                  nameErrors.length + proxyErrors.length === 1 ? "" : "s"
                }`
              : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runBulkCreate(pairs, values)}
            disabled={!canRun}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
            {values.useExistingProfiles
              ? `Open+login ${pairs.length} profile${pairs.length === 1 ? "" : "s"}`
              : `Create ${pairs.length} profile${pairs.length === 1 ? "" : "s"}`}
          </button>
          {isActive ? (
            <button
              type="button"
              onClick={cancelRun}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500 bg-transparent px-4 py-2.5 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-50 dark:border-amber-500 dark:text-amber-300 dark:hover:bg-amber-950/30"
            >
              <Square className="h-4 w-4" aria-hidden />
              Cancel
            </button>
          ) : null}
          {showReset ? (
            <button
              type="button"
              onClick={resetResults}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {state.status === "paused" ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {formatPauseBanner(state.pauseRemainingMs, state.pauseReason)}
        </div>
      ) : null}

      {state.status === "failed" && state.errorMessage ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {state.errorMessage}
        </div>
      ) : null}

      {preflightError && isTerminal ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {preflightError}
        </p>
      ) : null}

      {nameErrors.length > 0 ? (
        <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/40">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
            {nameErrors.length} name parse error{nameErrors.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            {nameErrors.slice(0, 10).map((e, i) => (
              <li key={i}>
                Names line {e.line}: {e.reason}
              </li>
            ))}
            {nameErrors.length > 10 ? (
              <li>…and {nameErrors.length - 10} more</li>
            ) : null}
          </ul>
        </details>
      ) : null}

      {proxyErrors.length > 0 ? (
        <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/40">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
            {proxyErrors.length} proxy parse error{proxyErrors.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            {proxyErrors.slice(0, 10).map((e, i) => (
              <li key={i}>
                Proxies line {e.line}: {e.reason}
              </li>
            ))}
            {proxyErrors.length > 10 ? (
              <li>…and {proxyErrors.length - 10} more</li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
