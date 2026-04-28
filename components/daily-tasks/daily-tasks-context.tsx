"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, authFetch } from "@/lib/auth-context";

export type TaskTemplate = {
  id: string;
  label: string;
  href: string;
};

export type DailyTask = { taskKey: string; completedAt: string | null };

export type StreakStatus = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  missCountThisWeek: number;
  minRequiredTasks: number;
  status: "active" | "at_risk" | "frozen" | "broken" | "never_started";
  yesterdayMissed: boolean;
  needsSkipRecoveryPrompt: boolean;
  yesterdayCompletion: {
    completedTasks: number;
    totalTasks: number;
    complete: boolean;
  };
  freezesRemaining: { sickDaysThisMonth: number; travelDaysThisYear: number };
  today: string;
};

const EMPTY_STREAK: StreakStatus = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
  missCountThisWeek: 0,
  minRequiredTasks: 5,
  status: "never_started",
  yesterdayMissed: false,
  needsSkipRecoveryPrompt: false,
  yesterdayCompletion: { completedTasks: 0, totalTasks: 5, complete: false },
  freezesRemaining: { sickDaysThisMonth: 1, travelDaysThisYear: 21 },
  today: new Date().toISOString().slice(0, 10),
};

type DailyTasksState = {
  templates: TaskTemplate[];
  tasks: DailyTask[];
  /** Numeric current streak — kept for backward compat with sidebar. */
  streak: number;
  /** Full streak payload (status, longest, freezes, recovery prompt). */
  streakStatus: StreakStatus;
  loading: boolean;
  counters: Record<string, number>;
  markTask: (key: string, autoDetected?: boolean) => Promise<void>;
  unmarkTask: (key: string) => Promise<void>;
  refresh: () => Promise<void>;
  saveTemplates: (templates: TaskTemplate[]) => Promise<void>;
  applySickDay: () => Promise<void>;
  dismissRecoveryPrompt: (action: "skip" | "make_up" | "dont_ask_again") => Promise<void>;
};

const Ctx = createContext<DailyTasksState>({
  templates: [],
  tasks: [],
  streak: 0,
  streakStatus: EMPTY_STREAK,
  loading: true,
  counters: {},
  markTask: async () => {},
  unmarkTask: async () => {},
  refresh: async () => {},
  saveTemplates: async () => {},
  applySickDay: async () => {},
  dismissRecoveryPrompt: async () => {},
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
  const [streakStatus, setStreakStatus] = useState<StreakStatus>(EMPTY_STREAK);
  const [loading, setLoading] = useState(true);
  const [counters, setCounters] = useState<Record<string, number>>({});
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

  // Fetch today's completions + full streak status
  const fetchTasks = useCallback(async (tmpls?: TaskTemplate[]) => {
    const t = tmpls ?? templatesRef.current;
    if (!user || t.length === 0) { setTasks([]); setStreakStatus(EMPTY_STREAK); setLoading(false); return; }
    try {
      const date = localDate();
      dateRef.current = date;
      const keys = t.map((x) => x.id).join(",");
      const res = await authFetch(`/api/daily-tasks?date=${date}&keys=${encodeURIComponent(keys)}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
        // Backward-compat: API used to return streak as number; now an object.
        if (data.streak && typeof data.streak === "object") {
          setStreakStatus(data.streak as StreakStatus);
        } else if (typeof data.streak === "number") {
          setStreakStatus({ ...EMPTY_STREAK, currentStreak: data.streak });
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  // Fetch today's counters (server-backed, cross-device)
  const fetchCounters = useCallback(async () => {
    if (!user) { setCounters({}); return; }
    try {
      const date = localDate();
      const res = await authFetch(`/api/daily-tasks/counters?date=${date}`);
      if (res.ok) {
        const data = await res.json() as { counters: Record<string, number> };
        setCounters(data.counters ?? {});
      }
    } catch { /* ignore */ }
  }, [user]);

  // Load on mount
  useEffect(() => {
    if (!user) { setTemplates([]); setTasks([]); setCounters({}); setLoading(false); return; }
    (async () => {
      const tmpls = await fetchTemplates();
      await Promise.all([fetchTasks(tmpls), fetchCounters()]);
    })();
  }, [user, fetchTemplates, fetchTasks, fetchCounters]);

  // Midnight reset
  useEffect(() => {
    const check = () => {
      if (localDate() !== dateRef.current) {
        fetchTasks();
        fetchCounters();
      }
    };
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [fetchTasks, fetchCounters]);

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

  // Counter updates from auto-detect (after server increments)
  useEffect(() => {
    const handler = (e: Event) => {
      const { counterKey, value } = (e as CustomEvent).detail ?? {};
      if (typeof counterKey !== "string" || typeof value !== "number") return;
      setCounters((prev) => ({ ...prev, [counterKey]: value }));
    };
    window.addEventListener("daily-counter-updated", handler);
    return () => window.removeEventListener("daily-counter-updated", handler);
  }, []);

  const applyStreakResponse = useCallback((d: { streak?: unknown }) => {
    if (d.streak && typeof d.streak === "object") {
      setStreakStatus(d.streak as StreakStatus);
    } else if (typeof d.streak === "number") {
      setStreakStatus((prev) => ({ ...prev, currentStreak: d.streak as number }));
    }
  }, []);

  const markTask = useCallback(async (key: string, autoDetected = false) => {
    setTasks((prev) => prev.map((t) => (t.taskKey === key ? { ...t, completedAt: new Date().toISOString() } : t)));
    try {
      const res = await authFetch("/api/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey: key, completed: true, autoDetected, date: dateRef.current }),
      });
      if (res.ok) applyStreakResponse(await res.json());
    } catch { /* ignore */ }
  }, [applyStreakResponse]);

  const unmarkTask = useCallback(async (key: string) => {
    setTasks((prev) => prev.map((t) => (t.taskKey === key ? { ...t, completedAt: null } : t)));
    try {
      const res = await authFetch("/api/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey: key, completed: false, date: dateRef.current }),
      });
      if (res.ok) applyStreakResponse(await res.json());
    } catch { /* ignore */ }
  }, [applyStreakResponse]);

  const applySickDay = useCallback(async () => {
    const date = localDate();
    try {
      const res = await authFetch("/api/streak/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeze_type: "sick_day", start_date: date }),
      });
      if (res.ok) applyStreakResponse(await res.json());
    } catch { /* ignore */ }
  }, [applyStreakResponse]);

  const dismissRecoveryPrompt = useCallback(
    async (action: "skip" | "make_up" | "dont_ask_again") => {
      // Optimistically hide the banner; server is source of truth on next refresh.
      setStreakStatus((prev) => ({ ...prev, needsSkipRecoveryPrompt: false }));
      try {
        const res = await authFetch("/api/streak/skip-recovery/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.ok) applyStreakResponse(await res.json());
      } catch { /* ignore */ }
    },
    [applyStreakResponse],
  );

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
    templates,
    tasks,
    streak: streakStatus.currentStreak,
    streakStatus,
    loading,
    counters,
    markTask,
    unmarkTask,
    refresh: fetchTasks,
    saveTemplates,
    applySickDay,
    dismissRecoveryPrompt,
  }), [
    templates, tasks, streakStatus, loading, counters,
    markTask, unmarkTask, fetchTasks, saveTemplates,
    applySickDay, dismissRecoveryPrompt,
  ]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}
