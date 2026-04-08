"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ChessWorkspace = dynamic(
  () => import("./chess-workspace").then((m) => m.ChessWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    ),
  },
);

export default function ChessPage() {
  return <ChessWorkspace />;
}
