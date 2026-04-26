import type { Metadata } from "next";

import AnalysisWorkspace from "./analysis-workspace";

export const metadata: Metadata = {
  title: "Game Analysis · Ken Workspace",
  description: "Paste a PGN and let Stockfish review every move.",
};

export default function ChessAnalysisPage() {
  // h-* (not min-h-*) so the inner flex column has a bounded height. With
  // a min-height the move list can stretch the right aside which then
  // stretches the row via align-stretch, blowing out the board container.
  return (
    <main className="flex h-[calc(100vh-3rem)] flex-col">
      <AnalysisWorkspace />
    </main>
  );
}
