"use client";

export function ChessMoveAnnounceChip({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-2 flex justify-center px-1" role="status" aria-live="polite">
      <span className="max-w-[min(100%,20rem)] rounded-full border border-zinc-200 bg-zinc-900 px-3 py-1.5 text-center text-xs font-medium leading-snug text-white shadow-md dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900">
        {text}
      </span>
    </div>
  );
}
