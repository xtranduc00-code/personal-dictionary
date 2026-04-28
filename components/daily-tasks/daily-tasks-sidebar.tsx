"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown, Circle, CheckCircle2, Flame, Loader2,
  ListChecks, Sparkles, X,
} from "lucide-react";
import { useDailyTasks, type StreakStatus as StreakStatusType } from "./daily-tasks-context";
import { useAuth } from "@/lib/auth-context";
import { COUNTER_TASKS } from "./daily-tasks-auto-detect";

/**
 * Hover tooltip for the streak badge. Rendered through a portal into
 * document.body so it escapes the sidebar's `overflow-hidden` (used for the
 * collapse animation, lines 939/943/945 of site-nav.tsx) — without the portal
 * the tooltip's right/left edges get clipped by the sidebar boundary.
 *
 * Position is computed from the badge's bounding rect: tooltip's right edge
 * aligns with badge's right edge, sitting just below it.
 */
function StreakHoverTooltip({
  anchorRef,
  visible,
  status,
  isVi,
  statusLabel,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
  status: StreakStatusType;
  isVi: boolean;
  statusLabel: string;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!visible || !anchorRef.current || typeof window === "undefined") return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }, [visible, anchorRef]);

  if (!visible || !pos || typeof document === "undefined") return null;

  const isAtRisk = status.status === "at_risk";
  const isBroken = status.status === "broken";

  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] w-56 rounded-lg border border-zinc-200 bg-white p-3 text-[12px] leading-tight text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      style={{ top: pos.top, right: pos.right }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {isVi ? "Chuỗi" : "Streak"}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span>{isVi ? "Hiện tại" : "Current"}</span>
        <span className="font-semibold tabular-nums">
          {status.currentStreak} {isVi ? "ngày" : "days"}
        </span>
      </div>
      <div className="flex justify-between">
        <span>{isVi ? "Dài nhất" : "Longest"}</span>
        <span className="font-semibold tabular-nums">
          {status.longestStreak} {isVi ? "ngày" : "days"}
        </span>
      </div>
      <div className="flex justify-between">
        <span>{isVi ? "Miss tuần này" : "This week"}</span>
        <span className="font-semibold tabular-nums">{status.missCountThisWeek}/1</span>
      </div>
      <div
        className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          isAtRisk
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            : isBroken
              ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
              : status.currentStreak > 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        }`}
      >
        {statusLabel}
      </div>
      <div className="mt-1.5 text-[11px] text-zinc-400">
        {isVi
          ? "1 miss/7 ngày được tha. 2 miss liên tiếp → gãy."
          : "1 miss/7 days forgiven. 2 in a row breaks."}
      </div>
    </div>,
    document.body,
  );
}

export function DailyTasksSidebar({
  isOpen,
  onToggle,
  locale = "en",
  onLinkClick,
}: {
  isOpen: boolean;
  onToggle: () => void;
  locale?: string;
  onLinkClick?: () => void;
}) {
  const { user } = useAuth();
  const {
    templates, tasks, streak, streakStatus, loading, counters,
    markTask, unmarkTask, dismissRecoveryPrompt,
  } = useDailyTasks();
  const isVi = locale === "vi";
  const streakBadgeRef = useRef<HTMLSpanElement>(null);
  const [streakHovered, setStreakHovered] = useState(false);

  if (!user) return null;

  const doneCount = tasks.filter((t) => t.completedAt).length;
  const total = templates.length;
  const progressPct = total > 0 ? (doneCount / total) * 100 : 0;
  const allDone = doneCount === total && total > 0;
  const isAtRisk = streakStatus.status === "at_risk";
  const isBroken = streakStatus.status === "broken";

  const statusLabel = (() => {
    switch (streakStatus.status) {
      case "active": return isVi ? "Đang on track" : "On track";
      case "at_risk": return isVi ? "Sắp gãy chuỗi" : "At risk";
      case "broken": return isVi ? "Mới gãy" : "Broken";
      case "never_started": return isVi ? "Chưa bắt đầu" : "New";
    }
  })();

  /* ── Row style tokens (matching other nav sections) ── */
  const rowBase = "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200";
  const rowIdle = "border-l-2 border-transparent pl-8 font-medium text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500/25 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
  const rowDone = "border-l-2 border-transparent pl-8 font-medium text-zinc-400 hover:border-zinc-200 hover:bg-zinc-50/90 hover:text-zinc-500 dark:text-zinc-500 dark:hover:border-zinc-500/25 dark:hover:bg-zinc-800 dark:hover:text-zinc-400";

  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      {/* ── Section header — matches NavSectionHeader pattern ── */}
      <div className={[
        "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-300",
        allDone
          ? "bg-gradient-to-r from-emerald-50/80 via-emerald-50/60 to-transparent text-emerald-700 ring-1 ring-emerald-200/60 dark:from-emerald-900/30 dark:via-emerald-900/15 dark:to-transparent dark:text-emerald-300 dark:ring-emerald-700/40"
          : "text-zinc-500 hover:bg-zinc-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      ].join(" ")}>
        <button
          type="button"
          onClick={onToggle}
          className="flex shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/35 dark:focus-visible:ring-zinc-500/30"
        >
          <span className={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            allDone
              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-400/40 dark:bg-emerald-600 dark:shadow-emerald-900/40"
              : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
          ].join(" ")}>
            {allDone ? <Sparkles className="h-5 w-5" /> : <ListChecks className="h-5 w-5" />}
          </span>
        </button>

        <span className={`min-w-0 flex-1 select-none text-left text-base font-medium ${allDone ? "font-semibold" : ""}`}>
          {allDone
            ? (isVi ? "Đã hết nhiệm vụ!" : "All done today!")
            : (isVi ? "Nhiệm vụ hôm nay" : "Daily Tasks")}
        </span>

        {/* Progress + streak badges. Hover the badge → tooltip rendered via
            portal (escapes sidebar's overflow-hidden). No click — the sidebar
            header below already toggles task list expansion. */}
        <div className="flex items-center gap-1.5">
          <span
            ref={streakBadgeRef}
            onMouseEnter={() => setStreakHovered(true)}
            onMouseLeave={() => setStreakHovered(false)}
            className={[
              "flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold tabular-nums transition-all cursor-default",
              streak >= 30
                ? "bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 text-white shadow-md shadow-orange-400/50 dark:shadow-rose-900/50"
                : streak >= 7
                  ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-sm shadow-orange-300/50 dark:shadow-rose-900/40"
                  : streak >= 3
                    ? "bg-orange-100 text-orange-600 ring-1 ring-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-800/60"
                    : streak >= 1
                      ? "bg-orange-50 text-orange-500 dark:bg-orange-900/25 dark:text-orange-400"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
              streak >= 7 ? "animate-pulse" : "",
            ].join(" ")}
          >
            <Flame
              className={`h-4 w-4 ${streak === 0 ? "" : streak >= 7 ? "drop-shadow-[0_0_4px_rgba(255,140,0,0.7)]" : ""}`}
              fill={streak >= 3 ? "currentColor" : "none"}
            />
            <span>{streak}</span>
            {isAtRisk && <span className="text-amber-500" aria-hidden>⚠</span>}
          </span>
          <StreakHoverTooltip
            anchorRef={streakBadgeRef}
            visible={streakHovered}
            status={streakStatus}
            isVi={isVi}
            statusLabel={statusLabel}
          />
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            allDone
              ? "bg-emerald-500 text-white dark:bg-emerald-600"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}>
            {doneCount}/{total}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-lg p-0.5 text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* ── Progress bar ── */}
      {isOpen && total > 0 && (
        <div className="mx-4 mb-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allDone
                ? "bg-emerald-500"
                : progressPct >= 70
                  ? "bg-emerald-500"
                  : progressPct >= 30
                    ? "bg-amber-400 dark:bg-amber-500"
                    : progressPct > 0
                      ? "bg-orange-400 dark:bg-orange-500"
                      : "bg-zinc-300 dark:bg-zinc-600"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* ── Skip-recovery banner — shown when user missed yesterday and hasn't dismissed today ── */}
      {isOpen && streakStatus.needsSkipRecoveryPrompt && (
        <div className="mx-3 mb-2 mt-1 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-sm dark:border-amber-800/40 dark:bg-amber-900/20">
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-amber-600 dark:text-amber-400">👋</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-amber-900 dark:text-amber-200">
                {isVi ? "Hôm qua bạn miss task." : "Welcome back!"}
              </div>
              <div className="text-[12px] text-amber-800/80 dark:text-amber-200/80">
                {isVi
                  ? `Đã hoàn thành ${streakStatus.yesterdayCompletion.completedTasks}/${streakStatus.yesterdayCompletion.totalTasks} task. Chuỗi vẫn an toàn.`
                  : `Yesterday: ${streakStatus.yesterdayCompletion.completedTasks}/${streakStatus.yesterdayCompletion.totalTasks} tasks. Your streak is safe.`}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                <button
                  type="button"
                  onClick={() => dismissRecoveryPrompt("skip")}
                  className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700"
                >
                  {isVi ? "Tiếp tục hôm nay" : "Continue today"}
                </button>
                <button
                  type="button"
                  onClick={() => dismissRecoveryPrompt("dont_ask_again")}
                  className="text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                >
                  {isVi ? "Đừng hỏi nữa" : "Don't ask again"}
                </button>
              </div>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissRecoveryPrompt("skip")}
              className="shrink-0 rounded p-0.5 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-800/40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Task list ── */}
      {isOpen && (
        <div className="space-y-0.5 pl-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          ) : total === 0 ? (
            <p className="px-8 py-3 text-sm text-zinc-400 dark:text-zinc-500">
              {isVi ? "Chưa có nhiệm vụ" : "No tasks"}
            </p>
          ) : (
            templates.map((tmpl) => {
              const task = tasks.find((t) => t.taskKey === tmpl.id);
              const done = !!task?.completedAt;
              const counterCfg = COUNTER_TASKS[tmpl.id];
              const counterValue = counterCfg ? Math.min(counters[counterCfg.counterKey] ?? 0, counterCfg.threshold) : null;

              return (
                <div key={tmpl.id} className={`${rowBase} ${done ? rowDone : rowIdle}`}>
                  <button
                    type="button"
                    onClick={() => (done ? unmarkTask(tmpl.id) : markTask(tmpl.id))}
                    className={`shrink-0 rounded-md p-0.5 transition ${
                      done
                        ? "text-emerald-500 hover:text-emerald-600"
                        : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </button>

                  <Link
                    href={tmpl.href || "/"}
                    onClick={onLinkClick}
                    className={`min-w-0 flex-1 truncate transition ${
                      done ? "line-through decoration-zinc-300 dark:decoration-zinc-600" : ""
                    }`}
                  >
                    {tmpl.label}
                  </Link>

                  {counterCfg && !done && (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {counterValue}/{counterCfg.threshold}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
