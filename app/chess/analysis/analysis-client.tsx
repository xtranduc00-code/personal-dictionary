"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const AnalysisWorkspace = dynamic(() => import("./analysis-workspace"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  ),
});

export function AnalysisClient() {
  return <AnalysisWorkspace />;
}

