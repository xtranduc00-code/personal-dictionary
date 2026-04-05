"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EngooDailyNewsHomeInner, HomeSkeleton } from "@/components/engoo/engoo-daily-news-home";
import { GuardianDailyNewsPanel } from "@/components/engoo/guardian-daily-news-panel";

function DailyNewsHubInner() {
  const searchParams = useSearchParams();
  const source: "engoo" | "guardian" =
    searchParams.get("src") === "guardian" ? "guardian" : "engoo";

  return (
    <div className="w-full">
      {source === "engoo" ? (
        <EngooDailyNewsHomeInner />
      ) : (
        <GuardianDailyNewsPanel />
      )}
    </div>
  );
}

export function DailyNewsHub() {
  return (
    <Suspense fallback={<HomeSkeleton layout="featured" />}>
      <DailyNewsHubInner />
    </Suspense>
  );
}
