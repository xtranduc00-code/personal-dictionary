"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronDown, Circle, CheckCircle2, Flame, Loader2,
  ListChecks, Sparkles, Snowflake, X,
} from "lucide-react";
import { useDailyTasks } from "./daily-tasks-context";
import { useAuth } from "@/lib/auth-context";
import { COUNTER_TASKS } from "./daily-tasks-auto-detect";

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
    markTask, unmarkTask, applySickDay, dismissRecoveryPrompt,
  } = useDailyTasks();
  const isVi = locale === "vi";
  const [streakMenuOpen, setStreakMenuOpen] = useState(false);

  if (!user) return null;

  const doneCount = tasks.filter((t) => t.completedAt).length;
  const total = templates.length;
  const progressPct = total > 0 ? (doneCount / total) * 100 : 0;
  const allDone = doneCount === total && total > 0;
  const isFrozen = streakStatus.status === "frozen";
  const isAtRisk = streakStatus.status === "at_risk";
  const sickQuotaLeft = streakStatus.freezesRemaining.sickDaysThisMonth;

  const streakTooltip = isVi
    ? `Chuỗi hiện tại: ${streak} ngày` +
      `\nDài nhất: ${streakStatus.longestStreak} ngày` +
      `\nTuần này: ${streakStatus.missCountThisWeek}/1 miss đã dùng` +
      `\nTrạng thái: ${streakStatus.status}`
    : `Current streak: ${streak} days` +
      `\nLongest: ${streakStatus.longestStreak} days` +
      `\nThis week: ${streakStatus.missCountThisWeek}/1 miss used` +
      `\nStatus: ${streakStatus.status}`;

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

        {/* Progress + streak badges */}
        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            title={streakTooltip}
            onClick={(e) => { e.stopPropagation(); setStreakMenuOpen((s) => !s); }}
            className={[
              "flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold tabular-nums transition-all",
              isFrozen
                ? "bg-sky-100 text-sky-600 ring-1 ring-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:ring-sky-800/60"
                : streak >= 30
                  ? "bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 text-white shadow-md shadow-orange-400/50 dark:shadow-rose-900/50"
                  : streak >= 7
                    ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-sm shadow-orange-300/50 dark:shadow-rose-900/40"
                    : streak >= 3
                      ? "bg-orange-100 text-orange-600 ring-1 ring-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-800/60"
                      : streak >= 1
                        ? "bg-orange-50 text-orange-500 dark:bg-orange-900/25 dark:text-orange-400"
                        : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
              streak >= 7 && !isFrozen ? "animate-pulse" : "",
            ].join(" ")}
          >
            {isFrozen ? (
              <Snowflake className="h-4 w-4" />
            ) : (
              <Flame className={`h-4 w-4 ${streak === 0 ? "" : streak >= 7 ? "drop-shadow-[0_0_4px_rgba(255,140,0,0.7)]" : ""}`} fill={streak >= 3 ? "currentColor" : "none"} />
            )}
            <span>{streak}</span>
            {isAtRisk && <span className="text-amber-500" aria-hidden>⚠</span>}
          </button>
          {streakMenuOpen && (
            <div
              className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-zinc-200 bg-white py-1.5 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {isVi ? "Chuỗi" : "Streak"}
                </div>
                <div className="mt-1 text-zinc-700 dark:text-zinc-300 whitespace-pre-line text-[12px]">
                  {streakTooltip}
                </div>
              </div>
              <button
                type="button"
                disabled={isFrozen || sickQuotaLeft === 0}
                onClick={() => { setStreakMenuOpen(false); applySickDay(); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:disabled:text-zinc-600"
              >
                <span>{isVi ? "Hôm nay tôi ốm" : "I'm sick today"}</span>
                <span className="text-[11px] text-zinc-400">{sickQuotaLeft}/1</span>
              </button>
              <div className="px-3 py-1.5 text-[11px] text-zinc-400">
                {isVi
                  ? `Du lịch còn ${streakStatus.freezesRemaining.travelDaysThisYear} ngày năm nay`
                  : `${streakStatus.freezesRemaining.travelDaysThisYear} travel days left this year`}
              </div>
            </div>
          )}
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
