"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EngooDailyNewsHomeInner, HomeSkeleton } from "@/components/engoo/engoo-daily-news-home";
import { GuardianDailyNewsPanel } from "@/components/engoo/guardian-daily-news-panel";
import { HBRDailyNewsPanel } from "@/components/engoo/hbr-daily-news-panel";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import type { EngooListApiResponse } from "@/lib/engoo-types";
import type { RssItem } from "@/app/api/rss/route";

type DailyNewsHubProps = {
  guardianNewsInitial?: GuardianListItem[] | null;
  guardianSportInitial?: GuardianListItem[] | null;
  engooInitial?: EngooListApiResponse | null;
  hbrInitial?: RssItem[] | null;
};

function DailyNewsHubInner({ guardianNewsInitial, guardianSportInitial, engooInitial, hbrInitial }: DailyNewsHubProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const srcParam = searchParams.get("src");
  const source: "engoo" | "guardian" | "hbr" =
    srcParam === "guardian" ? "guardian" : srcParam === "hbr" ? "hbr" : "engoo";

  useEffect(() => {
    if (searchParams.get("spotify") !== "1") return;
    router.replace("/spotify");
  }, [router, searchParams]);

  return (
    <div className="w-full">
      {source === "engoo" ? (
        <EngooDailyNewsHomeInner initialData={engooInitial} />
      ) : source === "guardian" ? (
        <GuardianDailyNewsPanel
          initialNewsItems={guardianNewsInitial}
          initialSportItems={guardianSportInitial}
        />
      ) : (
        <HBRDailyNewsPanel initialItems={hbrInitial} />
      )}
    </div>
  );
}

export function DailyNewsHub({ guardianNewsInitial, guardianSportInitial, engooInitial, hbrInitial }: DailyNewsHubProps) {
  return (
    <Suspense fallback={<HomeSkeleton layout="featured" />}>
      <DailyNewsHubInner
        guardianNewsInitial={guardianNewsInitial}
        guardianSportInitial={guardianSportInitial}
        engooInitial={engooInitial}
        hbrInitial={hbrInitial}
      />
    </Suspense>
  );
}
