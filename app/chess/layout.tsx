import type { ReactNode } from "react";

/** Avoid static generation / long build work for the chess section. */
export const dynamic = "force-dynamic";

export default function ChessLayout({ children }: { children: ReactNode }) {
  return children;
}
