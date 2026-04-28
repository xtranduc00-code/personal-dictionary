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

/** Map of counter-backed task ids to their counter key. The threshold lives
 *  on the template row (`target_count` in the DB) and is owned by the server
 *  now — clients no longer pass it. */
export const COUNTER_TASKS: Record<string, { counterKey: string }> = {
  vocab_10: { counterKey: "vocab" },
  chess_puzzles_10: { counterKey: "chess" },
};

async function incrementDailyCounter(counterKey: string, taskKey: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await authFetch("/api/daily-tasks/counters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterKey, taskKey, date: localDate() }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { value: number; completed: boolean };
    window.dispatchEvent(
      new CustomEvent("daily-counter-updated", { detail: { counterKey, value: data.value } }),
    );
    if (data.completed) {
      const key = `${localDate()}:${taskKey}`;
      marked.add(key);
      window.dispatchEvent(
        new CustomEvent("daily-task-auto-detected", { detail: { taskKey, completedAt: new Date().toISOString() } }),
      );
    }
  } catch {
    /* ignore */
  }
}

/** Count +1 vocab entry today. Threshold is owned by the template's target_count. */
export function incrementVocabCounter(): void {
  void incrementDailyCounter("vocab", "vocab_10");
}

/** Count +1 chess puzzle solved today. Threshold from template's target_count. */
export function incrementChessPuzzleCounter(): void {
  void incrementDailyCounter("chess", "chess_puzzles_10");
}
