"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, authFetch } from "@/lib/auth-context";

export type TaskTemplate = {
  id: string;
  label: string;
  href: string;
  sortOrder: number;
  targetCount: number | null;
  isDefault: boolean;
};

export type DailyTask = { taskKey: string; completedAt: string | null };

export type StreakStatus = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  missCountThisWeek: number;
  minRequiredTasks: number;
  status: "active" | "at_risk" | "broken" | "never_started";
  yesterdayMissed: boolean;
  needsSkipRecoveryPrompt: boolean;
  yesterdayCompletion: {
    completedTasks: number;
    totalTasks: number;
    complete: boolean;
  };
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
  today: new Date().toISOString().slice(0, 10),
};

type DailyTasksState = {
  templates: TaskTemplate[];
  tasks: DailyTask[];
  streak: number;
  streakStatus: StreakStatus;
  loading: boolean;
  counters: Record<string, number>;
  markTask: (key: string, autoDetected?: boolean) => Promise<void>;
  unmarkTask: (key: string) => Promise<void>;
  refresh: () => Promise<void>;
  dismissRecoveryPrompt: (action: "skip" | "make_up" | "dont_ask_again") => Promise<void>;
  // CRUD
  updateTemplate: (id: string, patch: { label?: string; targetCount?: number | null; sortOrder?: number }) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  addManualTemplate: (label: string, targetCount?: number | null) => Promise<void>;
  reorderTemplates: (orderedIds: string[]) => Promise<void>;
  resetTemplates: () => Promise<void>;
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
  dismissRecoveryPrompt: async () => {},
  updateTemplate: async () => {},
  deleteTemplate: async () => {},
  addManualTemplate: async () => {},
  reorderTemplates: async () => {},
  resetTemplates: async () => {},
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
    const now = new Date().toISOString();
    setTasks((prev) => {
      const has = prev.some((t) => t.taskKey === key);
      return has
        ? prev.map((t) => (t.taskKey === key ? { ...t, completedAt: now } : t))
        : [...prev, { taskKey: key, completedAt: now }];
    });
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
    setTasks((prev) => {
      const has = prev.some((t) => t.taskKey === key);
      return has
        ? prev.map((t) => (t.taskKey === key ? { ...t, completedAt: null } : t))
        : [...prev, { taskKey: key, completedAt: null }];
    });
    try {
      const res = await authFetch("/api/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey: key, completed: false, date: dateRef.current }),
      });
      if (res.ok) applyStreakResponse(await res.json());
    } catch { /* ignore */ }
  }, [applyStreakResponse]);

  const dismissRecoveryPrompt = useCallback(
    async (action: "skip" | "make_up" | "dont_ask_again") => {
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

  // ── CRUD ────────────────────────────────────────────────────────────────

  const updateTemplate = useCallback(
    async (id: string, patch: { label?: string; targetCount?: number | null; sortOrder?: number }) => {
      // Optimistic
      setTemplates((prev) => {
        const next = prev.map((t) => {
          if (t.id !== id) return t;
          return {
            ...t,
            ...(patch.label !== undefined ? { label: patch.label } : {}),
            ...("targetCount" in patch ? { targetCount: patch.targetCount ?? null } : {}),
            ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
          };
        });
        templatesRef.current = next;
        return next;
      });
      try {
        await authFetch(`/api/daily-tasks/templates/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...patch, clientDate: dateRef.current }),
        });
        // If targetCount changed, server may have re-ticked or un-ticked today's
        // task — re-fetch so the sidebar reflects the new completion state.
        if ("targetCount" in patch) {
          await fetchTasks(templatesRef.current);
        }
      } catch { /* ignore */ }
    },
    [fetchTasks],
  );

  const deleteTemplate = useCallback(async (id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      templatesRef.current = next;
      return next;
    });
    setTasks((prev) => prev.filter((t) => t.taskKey !== id));
    try {
      await authFetch(`/api/daily-tasks/templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      // Refresh streak — total tasks just dropped, may flip status.
      await fetchTasks(templatesRef.current);
    } catch { /* ignore */ }
  }, [fetchTasks]);

  const addManualTemplate = useCallback(
    async (label: string, targetCount: number | null = null) => {
      try {
        const res = await authFetch("/api/daily-tasks/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, targetCount }),
        });
        if (!res.ok) return;
        const created = (await res.json()) as TaskTemplate;
        setTemplates((prev) => {
          const next = [...prev, created];
          templatesRef.current = next;
          return next;
        });
        // Add the empty completion row so optimistic ticks find it.
        setTasks((prev) => [...prev, { taskKey: created.id, completedAt: null }]);
        await fetchTasks(templatesRef.current);
      } catch { /* ignore */ }
    },
    [fetchTasks],
  );

  const reorderTemplates = useCallback(async (orderedIds: string[]) => {
    // Optimistic local reorder
    let reordered: TaskTemplate[] = [];
    setTemplates((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      reordered = orderedIds
        .map((id, i) => {
          const t = map.get(id);
          return t ? { ...t, sortOrder: i } : null;
        })
        .filter((t): t is TaskTemplate => t !== null);
      // Append any templates not in orderedIds (defensive — shouldn't happen)
      for (const t of prev) {
        if (!orderedIds.includes(t.id)) reordered.push({ ...t, sortOrder: reordered.length });
      }
      templatesRef.current = reordered;
      return reordered;
    });
    // Persist each affected row's sort_order. Fire in parallel; don't block UI.
    try {
      await Promise.all(
        reordered.map((t) =>
          authFetch(`/api/daily-tasks/templates/${encodeURIComponent(t.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: t.sortOrder }),
          }),
        ),
      );
    } catch { /* ignore */ }
  }, []);

  const resetTemplates = useCallback(async () => {
    try {
      const res = await authFetch("/api/daily-tasks/templates/reset", {
        method: "POST",
      });
      if (!res.ok) return;
      const tmpls = await fetchTemplates();
      await fetchTasks(tmpls);
    } catch { /* ignore */ }
  }, [fetchTemplates, fetchTasks]);

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
    dismissRecoveryPrompt,
    updateTemplate,
    deleteTemplate,
    addManualTemplate,
    reorderTemplates,
    resetTemplates,
  }), [
    templates, tasks, streakStatus, loading, counters,
    markTask, unmarkTask, fetchTasks,
    dismissRecoveryPrompt,
    updateTemplate, deleteTemplate, addManualTemplate, reorderTemplates, resetTemplates,
  ]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}
