import type { ReactNode } from "react";

/** Avoid static generation / long build work for the chess section. */
export const dynamic = "force-dynamic";

/** Fill main column so inner `min-h-0` + `overflow-y-auto` can scroll under the app shell. */
export default function ChessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      {children}
    </div>
  );
}
