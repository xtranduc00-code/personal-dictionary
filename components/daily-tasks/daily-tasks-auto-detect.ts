import { authFetch } from "@/lib/auth-context";

const marked = new Set<string>();

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fire-and-forget: mark a daily task as completed via API. Deduplicates within the session. */
export function markDailyTask(taskKey: string): void {
  const key = `${localDate()}:${taskKey}`;
  if (marked.has(key)) return;
  marked.add(key);

  // Optimistically notify the context immediately (no waiting for API)
  window.dispatchEvent(
    new CustomEvent("daily-task-auto-detected", { detail: { taskKey, completedAt: new Date().toISOString() } })
  );

  authFetch("/api/daily-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskKey, completed: true, autoDetected: true, date: localDate() }),
  }).catch(() => {
    marked.delete(key);
  });
}
