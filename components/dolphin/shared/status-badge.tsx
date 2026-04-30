import type { RunStatus } from "@/lib/dolphin/context";

const STATUS_CONFIG: Record<RunStatus, { label: string; className: string }> = {
  idle: {
    label: "Idle",
    className:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  running: {
    label: "Running",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  paused: {
    label: "Paused",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  done: {
    label: "Done",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
  failed: {
    label: "Failed",
    className:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
};

export function StatusBadge({ status }: { status: RunStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
