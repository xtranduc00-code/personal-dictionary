"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, ChevronRight, Circle, CheckCircle2, Flame, Loader2,
  Settings2, Plus, Trash2, Check, X,
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

function genId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

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
    // Don't add duplicates
    if (editDraft.some((t) => t.id === id)) return;
    setEditDraft((prev) => [...prev, { id, label: isVi ? feat.labelVi : feat.label, href: feat.href }]);
    setShowAdd(false);
  }

  // Features not yet in the draft
  const availableFeatures = FEATURE_OPTIONS.filter(
    (f) => !editDraft.some((t) => t.id === hrefToId(f.href))
  );

  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      {/* Header */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          className="group flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="flex-1 text-left">{isVi ? "Nhiệm vụ hôm nay" : "Daily Tasks"}</span>
          {!editing && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              allDone
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}>
              {doneCount}/{total}
            </span>
          )}
          {streak > 0 && !editing && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-500">
              <Flame className="h-3 w-3" />
              {streak}
            </span>
          )}
        </button>
        {isOpen && !editing && (
          <button
            type="button"
            onClick={startEditing}
            title={isVi ? "Chỉnh sửa" : "Edit tasks"}
            className="mr-1 shrink-0 rounded-lg p-1.5 text-zinc-300 transition hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        )}
        {isOpen && editing && (
          <div className="mr-1 flex shrink-0 gap-0.5">
            <button type="button" onClick={doSave} title="Save" className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={doCancel} title="Cancel" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Edit mode ── */}
      {isOpen && editing && (
        <div className="space-y-0.5 pl-1">
          {editDraft.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <span className="flex-1 truncate text-[13px] text-zinc-700 dark:text-zinc-300">{t.label}</span>
              <button
                type="button"
                onClick={() => removeDraft(t.id)}
                className="shrink-0 rounded p-0.5 text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Add from dropdown */}
          {showAdd ? (
            <div className="mx-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {availableFeatures.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-400">{isVi ? "Đã thêm hết" : "All added"}</p>
              ) : (
                availableFeatures.map((f) => (
                  <button
                    key={f.href}
                    type="button"
                    onClick={() => addFeature(f)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Plus className="h-3 w-3 shrink-0 text-zinc-400" />
                    {isVi ? f.labelVi : f.label}
                  </button>
                ))
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <Plus className="h-3.5 w-3.5" />
              {isVi ? "Thêm nhiệm vụ" : "Add task"}
            </button>
          )}
        </div>
      )}

      {/* ── Normal mode ── */}
      {isOpen && !editing && (
        <div className="space-y-0.5 pl-1">
          {total > 0 && (
            <div className="mx-2 mb-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  allDone ? "bg-emerald-500" : "bg-zinc-900 dark:bg-zinc-100"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          ) : total === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500">
              {isVi ? "Bấm ⚙ để thêm nhiệm vụ" : "Tap ⚙ to add tasks"}
            </p>
          ) : (
            templates.map((tmpl) => {
              const task = tasks.find((t) => t.taskKey === tmpl.id);
              const done = !!task?.completedAt;

              return (
                <div key={tmpl.id} className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => (done ? unmarkTask(tmpl.id) : markTask(tmpl.id))}
                    className={`shrink-0 rounded-md p-1 transition ${
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
                    className={`flex flex-1 items-center truncate rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                      done
                        ? "text-zinc-400 line-through decoration-zinc-300 dark:text-zinc-500 dark:decoration-zinc-600"
                        : "text-zinc-700 dark:text-zinc-300"
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
