"use client";

import { useRef } from "react";

export function ChessMoveAnnounceChip({ text }: { text: string | null }) {
  const lastTextRef = useRef("");
  if (text) lastTextRef.current = text;
  const display = text ?? lastTextRef.current;
  const visible = Boolean(text);

  return (
    <div className="mt-2 flex justify-center px-1" role="status" aria-live={visible ? "polite" : "off"}>
      <span
        aria-hidden={!visible}
        className={`max-w-[min(100%,20rem)] rounded-full border border-zinc-200 bg-zinc-900 px-3 py-1.5 text-center text-xs font-medium leading-snug text-white shadow-md dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900 ${
          visible ? "" : "invisible pointer-events-none"
        }`}
      >
        {display || "\u00a0"}
      </span>
    </div>
  );
}
