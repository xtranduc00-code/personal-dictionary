"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, Circle, CheckCircle2, Flame, Loader2,
  Settings2, Plus, Trash2, Check, X, ListChecks,
} from "lucide-react";
import { useDailyTasks, type TaskTemplate } from "./daily-tasks-context";
import { useAuth } from "@/lib/auth-context";

/** All app features available as daily task options */
const FEATURE_OPTIONS: { label: string; labelVi: string; href: string }[] = [
  { label: "Read Engoo", labelVi: "Đọc Engoo", href: "/news" },
  { label: "Read Guardian", labelVi: "Đọc Guardian", href: "/news?src=guardian" },
  { label: "10 Flashcards", labelVi: "10 Flashcards", href: "/flashcards" },
  { label: "IELTS Listening", labelVi: "IELTS Listening", href: "/listening" },
  { label: "IELTS Reading", labelVi: "IELTS Reading", href: "/ielts-reading" },
  { label: "IELTS Writing", labelVi: "IELTS Writing", href: "/ielts-writing" },
  { label: "IELTS Speaking", labelVi: "IELTS Speaking", href: "/ielts-speaking" },
  { label: "Chess Puzzles", labelVi: "Chess Puzzles", href: "/chess" },
  { label: "Study Kit", labelVi: "Study Kit", href: "/study-kit" },
  { label: "Watch Together", labelVi: "Xem cùng nhau", href: "/watch" },
  { label: "YouTube Videos", labelVi: "YouTube Videos", href: "/videos" },
  { label: "Dictionary", labelVi: "Từ điển", href: "/dictionary" },
  { label: "Translate", labelVi: "Dịch", href: "/translate" },
  { label: "Notes", labelVi: "Ghi chú", href: "/notes" },
  { label: "Diary", labelVi: "Nhật ký", href: "/notes/diary" },
  { label: "Calendar", labelVi: "Lịch", href: "/calendar" },
];

/** Derive a stable task ID from a feature href */
function hrefToId(href: string): string {
  return href.replace(/^\//, "").replace(/[/?=&]/g, "_") || "home";
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
  const { templates, tasks, streak, loading, markTask, unmarkTask, saveTemplates } = useDailyTasks();
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<TaskTemplate[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const isVi = locale === "vi";

  if (!user) return null;

  const doneCount = tasks.filter((t) => t.completedAt).length;
  const total = templates.length;
  const progressPct = total > 0 ? (doneCount / total) * 100 : 0;
  const allDone = doneCount === total && total > 0;

  function startEditing() {
    setEditDraft(templates.map((t) => ({ ...t })));
    setEditing(true);
    setShowAdd(false);
  }

  function doSave() {
    saveTemplates(editDraft);
    setEditing(false);
  }

  function doCancel() {
    setEditing(false);
    setEditDraft([]);
    setShowAdd(false);
  }

  function removeDraft(id: string) {
    setEditDraft((prev) => prev.filter((t) => t.id !== id));
  }

  function addFeature(feat: { label: string; labelVi: string; href: string }) {
    const id = hrefToId(feat.href);
    if (editDraft.some((t) => t.id === id)) return;
    setEditDraft((prev) => [...prev, { id, label: isVi ? feat.labelVi : feat.label, href: feat.href }]);
    setShowAdd(false);
  }

  const availableFeatures = FEATURE_OPTIONS.filter(
    (f) => !editDraft.some((t) => t.id === hrefToId(f.href))
  );

  /* ── Row style tokens (matching other nav sections) ── */
  const rowBase = "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200";
  const rowIdle = "border-l-2 border-transparent pl-8 font-medium text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500/25 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
  const rowDone = "border-l-2 border-transparent pl-8 font-medium text-zinc-400 hover:border-zinc-200 hover:bg-zinc-50/90 hover:text-zinc-500 dark:text-zinc-500 dark:hover:border-zinc-500/25 dark:hover:bg-zinc-800 dark:hover:text-zinc-400";

  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      {/* ── Section header — matches NavSectionHeader pattern ── */}
      <div className={[
        "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
        "text-zinc-500 hover:bg-zinc-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      ].join(" ")}>
        <button
          type="button"
          onClick={onToggle}
          className="flex shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/35 dark:focus-visible:ring-zinc-500/30"
        >
          <span className={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
          ].join(" ")}>
            <ListChecks className="h-5 w-5" />
          </span>
        </button>

        <span className="min-w-0 flex-1 select-none text-left text-base font-medium">
          {isVi ? "Nhiệm vụ hôm nay" : "Daily Tasks"}
        </span>

        {/* Progress + streak badges */}
        {!editing && (
          <div className="flex items-center gap-1.5">
            {streak > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] font-bold text-orange-500">
                <Flame className="h-3.5 w-3.5" />
                {streak}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
              allDone
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}>
              {doneCount}/{total}
            </span>
          </div>
        )}

        {/* Edit / Save / Cancel buttons */}
        {isOpen && !editing && (
          <button
            type="button"
            onClick={startEditing}
            title={isVi ? "Chỉnh sửa" : "Edit tasks"}
            className="shrink-0 rounded-lg p-1.5 text-zinc-300 transition hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        )}
        {isOpen && editing && (
          <div className="flex shrink-0 gap-0.5">
            <button type="button" onClick={doSave} title="Save" className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
              <Check className="h-4 w-4" />
            </button>
            <button type="button" onClick={doCancel} title="Cancel" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-lg p-0.5 text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* ── Progress bar ── */}
      {isOpen && !editing && total > 0 && (
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

      {/* ── Edit mode ── */}
      {isOpen && editing && (
        <div className="space-y-0.5 pl-2">
          {editDraft.map((t) => (
            <div key={t.id} className={`${rowBase} border-l-2 border-transparent pl-8 justify-between`}>
              <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{t.label}</span>
              <button
                type="button"
                onClick={() => removeDraft(t.id)}
                className="shrink-0 rounded-lg p-1 text-zinc-300 transition hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {showAdd ? (
            <div className="mx-4 max-h-48 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {availableFeatures.length === 0 ? (
                <p className="px-3 py-2 text-sm text-zinc-400">{isVi ? "Đã thêm hết" : "All added"}</p>
              ) : (
                availableFeatures.map((f) => (
                  <button
                    key={f.href}
                    type="button"
                    onClick={() => addFeature(f)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    {isVi ? f.labelVi : f.label}
                  </button>
                ))
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className={`${rowBase} border-l-2 border-transparent pl-8 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300`}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>{isVi ? "Thêm nhiệm vụ" : "Add task"}</span>
            </button>
          )}
        </div>
      )}

      {/* ── Normal mode — task list ── */}
      {isOpen && !editing && (
        <div className="space-y-0.5 pl-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          ) : total === 0 ? (
            <p className="px-8 py-3 text-sm text-zinc-400 dark:text-zinc-500">
              {isVi ? "Bấm ⚙ để thêm nhiệm vụ" : "Tap ⚙ to add tasks"}
            </p>
          ) : (
            templates.map((tmpl) => {
              const task = tasks.find((t) => t.taskKey === tmpl.id);
              const done = !!task?.completedAt;

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
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
