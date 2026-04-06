"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EngooDailyNewsHomeInner, HomeSkeleton } from "@/components/engoo/engoo-daily-news-home";
import { GuardianDailyNewsPanel } from "@/components/engoo/guardian-daily-news-panel";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import type { EngooListApiResponse } from "@/lib/engoo-types";

type DailyNewsHubProps = {
  guardianNewsInitial?: GuardianListItem[] | null;
  guardianSportInitial?: GuardianListItem[] | null;
  engooInitial?: EngooListApiResponse | null;
};

function DailyNewsHubInner({ guardianNewsInitial, guardianSportInitial, engooInitial }: DailyNewsHubProps) {
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
        <EngooDailyNewsHomeInner initialData={engooInitial} />
      ) : (
        <GuardianDailyNewsPanel
          initialNewsItems={guardianNewsInitial}
          initialSportItems={guardianSportInitial}
        />
      )}
    </div>
  );
}

export function DailyNewsHub({ guardianNewsInitial, guardianSportInitial, engooInitial }: DailyNewsHubProps) {
  return (
    <Suspense fallback={<HomeSkeleton layout="featured" />}>
      <DailyNewsHubInner
        guardianNewsInitial={guardianNewsInitial}
        guardianSportInitial={guardianSportInitial}
        engooInitial={engooInitial}
      />
    </Suspense>
  );
}
