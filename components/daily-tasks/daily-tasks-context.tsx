"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, authFetch } from "@/lib/auth-context";

export type TaskTemplate = {
  id: string;
  label: string;
  href: string;
};

export type DailyTask = { taskKey: string; completedAt: string | null };

type DailyTasksState = {
  templates: TaskTemplate[];
  tasks: DailyTask[];
  streak: number;
  loading: boolean;
  markTask: (key: string, autoDetected?: boolean) => Promise<void>;
  unmarkTask: (key: string) => Promise<void>;
  refresh: () => Promise<void>;
  saveTemplates: (templates: TaskTemplate[]) => Promise<void>;
};

const Ctx = createContext<DailyTasksState>({
  templates: [],
  tasks: [],
  streak: 0,
  loading: true,
  markTask: async () => {},
  unmarkTask: async () => {},
  refresh: async () => {},
  saveTemplates: async () => {},
});

export function useDailyTasks() {
  return useContext(Ctx);
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DailyTasksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const dateRef = useRef(localDate());
  const templatesRef = useRef<TaskTemplate[]>([]);

  // Fetch templates from API
  const fetchTemplates = useCallback(async () => {
    if (!user) { setTemplates([]); templatesRef.current = []; return []; }
    try {
      const res = await authFetch("/api/daily-tasks/templates");
      if (res.ok) {
        const data = await res.json() as TaskTemplate[];
        setTemplates(data);
        templatesRef.current = data;
        return data;
      }
    } catch { /* ignore */ }
    return [];
  }, [user]);

  // Fetch today's completions
  const fetchTasks = useCallback(async (tmpls?: TaskTemplate[]) => {
    const t = tmpls ?? templatesRef.current;
    if (!user || t.length === 0) { setTasks([]); setStreak(0); setLoading(false); return; }
    try {
      const date = localDate();
      dateRef.current = date;
      const keys = t.map((x) => x.id).join(",");
      const res = await authFetch(`/api/daily-tasks?date=${date}&keys=${encodeURIComponent(keys)}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
        setStreak(data.streak);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  // Load on mount
  useEffect(() => {
    if (!user) { setTemplates([]); setTasks([]); setLoading(false); return; }
    (async () => {
      const tmpls = await fetchTemplates();
      await fetchTasks(tmpls);
    })();
  }, [user, fetchTemplates, fetchTasks]);

  // Midnight reset
  useEffect(() => {
    const check = () => { if (localDate() !== dateRef.current) fetchTasks(); };
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [fetchTasks]);

  // Auto-detection events
  useEffect(() => {
    const handler = (e: Event) => {
      const { taskKey, completedAt } = (e as CustomEvent).detail ?? {};
      if (!taskKey) return;
      setTasks((prev) =>
        prev.map((t) => (t.taskKey === taskKey && !t.completedAt ? { ...t, completedAt } : t))
      );
    };
    window.addEventListener("daily-task-auto-detected", handler);
    return () => window.removeEventListener("daily-task-auto-detected", handler);
  }, []);

  const markTask = useCallback(async (key: string, autoDetected = false) => {
    setTasks((prev) => prev.map((t) => (t.taskKey === key ? { ...t, completedAt: new Date().toISOString() } : t)));
    try {
      const res = await authFetch("/api/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey: key, completed: true, autoDetected, date: dateRef.current }),
      });
      if (res.ok) { const d = await res.json(); setStreak(d.streak); }
    } catch { /* ignore */ }
  }, []);

  const unmarkTask = useCallback(async (key: string) => {
    setTasks((prev) => prev.map((t) => (t.taskKey === key ? { ...t, completedAt: null } : t)));
    try {
      const res = await authFetch("/api/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey: key, completed: false, date: dateRef.current }),
      });
      if (res.ok) { const d = await res.json(); setStreak(d.streak); }
    } catch { /* ignore */ }
  }, []);

  const saveTemplates = useCallback(async (newTemplates: TaskTemplate[]) => {
    setTemplates(newTemplates);
    templatesRef.current = newTemplates;
    // Sync tasks list for new template set
    setTasks((prev) => {
      const ids = new Set(newTemplates.map((t) => t.id));
      const existing = prev.filter((t) => ids.has(t.taskKey));
      const newKeys = newTemplates.filter((t) => !prev.some((p) => p.taskKey === t.id));
      return [...existing, ...newKeys.map((t) => ({ taskKey: t.id, completedAt: null }))];
    });
    try {
      await authFetch("/api/daily-tasks/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTemplates),
      });
    } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => ({
    templates, tasks, streak, loading, markTask, unmarkTask, refresh: fetchTasks, saveTemplates,
  }), [templates, tasks, streak, loading, markTask, unmarkTask, fetchTasks, saveTemplates]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}
