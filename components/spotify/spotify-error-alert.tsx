"use client";

import { AlertCircle } from "lucide-react";

export function SpotifyErrorAlert({ message }: { message: string }) {
  if (!message.trim()) return null;
  return (
    <div
      className="flex gap-3 rounded-xl border border-red-200/90 bg-red-50/95 px-3.5 py-3 text-left shadow-sm dark:border-red-900/50 dark:bg-red-950/35"
      role="alert"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
        aria-hidden
      />
      <p className="text-sm leading-relaxed text-red-900 dark:text-red-100">
        {message}
      </p>
    </div>
  );
}
