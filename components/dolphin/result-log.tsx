"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download } from "lucide-react";
import { useDolphin } from "@/lib/dolphin/context";
import type { CreateResult, LogEntry } from "@/lib/dolphin/types";

const CSV_HEADERS = ["name", "profile_id", "proxy", "status", "error"] as const;
const AUTOSCROLL_THRESHOLD_PX = 32;

function formatLogLine(entry: LogEntry): {
  sign: string;
  toneClass: string;
  text: string;
} {
  if (entry.kind === "create") {
    const proxyStr = entry.proxy
      ? `${entry.proxy.host}:${entry.proxy.port}`
      : "—";
    if (entry.ok) {
      return {
        sign: "✓",
        toneClass: "text-emerald-400",
        text: `${entry.name} created · id: ${entry.profileId} · proxy: ${proxyStr}`,
      };
    }
    return {
      sign: "✗",
      toneClass: "text-rose-400",
      text: `${entry.name} create failed · proxy: ${proxyStr} · ${entry.reason}`,
    };
  }
  if (entry.ok) {
    return {
      sign: "→",
      toneClass: "text-blue-400",
      text: `${entry.name} logged in · ${entry.email}`,
    };
  }
  return {
    sign: "✗",
    toneClass: "text-rose-400",
    text: `${entry.name} login failed · ${entry.reason}`,
  };
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(entries: readonly LogEntry[]): string {
  const creates = entries.filter(
    (e): e is Extract<LogEntry, { kind: "create" }> => e.kind === "create",
  );
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const r of creates) {
    const proxy = r.proxy
      ? `${r.proxy.type}://${r.proxy.host}:${r.proxy.port}`
      : "";
    const row = r.ok
      ? [r.name, r.profileId, proxy, "success", ""]
      : [r.name, "", proxy, "failed", r.reason];
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

function buildPlainLog(entries: readonly LogEntry[]): string {
  return entries
    .map((entry) => {
      const { sign, text } = formatLogLine(entry);
      return `${sign} ${text}`;
    })
    .join("\n");
}

function timestampedFilename(): string {
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");
  return `dolphin-bulk-create-${stamp}.csv`;
}

export function DolphinResultLog() {
  const { state } = useDolphin();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setAutoScroll(distanceFromBottom <= AUTOSCROLL_THRESHOLD_PX);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [state.results.length, autoScroll]);

  const total = state.totalCount;
  const createEntries = state.results.filter((e) => e.kind === "create");
  const loginEntries = state.results.filter((e) => e.kind === "login");
  const done = createEntries.length;
  const success = createEntries.reduce(
    (acc, r) => acc + (r.ok ? 1 : 0),
    0,
  );
  const failed = done - success;
  const loginAttempted = loginEntries.length;
  const loginSuccess = loginEntries.reduce(
    (acc, r) => acc + (r.ok ? 1 : 0),
    0,
  );
  const hasResults = state.results.length > 0;

  const onCopy = async () => {
    if (!hasResults) return;
    try {
      await navigator.clipboard.writeText(buildPlainLog(state.results));
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch {
      setCopyStatus("failed");
      setTimeout(() => setCopyStatus("idle"), 3000);
    }
  };

  const copyLabel =
    copyStatus === "copied"
      ? "Copied"
      : copyStatus === "failed"
        ? "Copy failed"
        : "Copy log";

  const onExportCsv = () => {
    if (!hasResults) return;
    const csv = buildCsv(state.results);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = timestampedFilename();
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {hasResults
            ? `${done}/${total} created · ${success} ok · ${failed} fail${
                loginAttempted > 0
                  ? ` · ${loginSuccess}/${loginAttempted} logged in`
                  : ""
              }`
            : "No log yet."}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={!hasResults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={!hasResults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Bulk create log"
        className="h-72 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300"
      >
        {hasResults ? (
          state.results.map((r, i) => {
            const { sign, toneClass, text } = formatLogLine(r);
            return (
              <div
                key={i}
                className="whitespace-pre-wrap break-words"
              >
                <span className={`${toneClass} mr-2 select-none`}>
                  {sign}
                </span>
                <span>{text}</span>
              </div>
            );
          })
        ) : (
          <div className="italic text-zinc-500">
            Log lines will appear here as profiles are created…
          </div>
        )}
      </div>

      {!autoScroll && hasResults ? (
        <div className="text-right text-[11px] text-zinc-500 dark:text-zinc-400">
          Auto-scroll paused — scroll to bottom to resume.
        </div>
      ) : null}
    </div>
  );
}
