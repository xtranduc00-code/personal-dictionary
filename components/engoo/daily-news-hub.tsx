"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EngooDailyNewsHomeInner, HomeSkeleton } from "@/components/engoo/engoo-daily-news-home";
import { GuardianDailyNewsPanel } from "@/components/engoo/guardian-daily-news-panel";

function DailyNewsHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source: "engoo" | "guardian" =
    searchParams.get("src") === "guardian" ? "guardian" : "engoo";

  useEffect(() => {
    if (searchParams.get("spotify") !== "1") return;
    router.replace("/spotify");
  }, [router, searchParams]);

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
