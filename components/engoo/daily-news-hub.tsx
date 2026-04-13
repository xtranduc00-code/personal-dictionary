"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EngooDailyNewsHomeInner, HomeSkeleton } from "@/components/engoo/engoo-daily-news-home";
import { HBRDailyNewsPanel } from "@/components/engoo/hbr-daily-news-panel";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import type { EngooListApiResponse } from "@/lib/engoo-types";
import type { RssItem } from "@/app/api/rss/route";

type DailyNewsHubProps = {
  guardianSportInitial?: GuardianListItem[] | null;
  engooInitial?: EngooListApiResponse | null;
  hbrInitial?: RssItem[] | null;
};

function DailyNewsHubInner({
  guardianSportInitial,
  engooInitial,
  hbrInitial,
}: DailyNewsHubProps) {
  const searchParams = useSearchParams();
  const isHBR = searchParams.get("src") === "hbr";

  return (
    <div className="w-full">
      {isHBR ? (
        <HBRDailyNewsPanel initialItems={hbrInitial} />
      ) : (
        <EngooDailyNewsHomeInner
          initialData={engooInitial}
          initialSportItems={guardianSportInitial}
        />
      )}
    </div>
  );
}

export function DailyNewsHub(props: DailyNewsHubProps) {
  return (
    <Suspense fallback={<HomeSkeleton layout="featured" />}>
      <DailyNewsHubInner {...props} />
    </Suspense>
  );
}
