import type { Metadata } from "next";
import { Suspense } from "react";
import { DailyNewsHub } from "@/components/engoo/daily-news-hub";
import { HomeSkeleton } from "@/components/engoo/engoo-daily-news-home";
import { fetchGuardianListItems } from "@/lib/guardian-list-fetch";
import { fetchEngooDefaultItems } from "@/lib/engoo-list-fetch";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import type { EngooListApiResponse } from "@/lib/engoo-types";

export const metadata: Metadata = {
  title: "Daily News",
  description:
    "Engoo-style Daily News and Guardian headlines — read structured lessons and start an AI tutor call with full context.",
};

export default async function NewsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string; gtab?: string; category?: string }>;
}) {
  const params = await searchParams;
  const isGuardian = params.src === "guardian";
  const guardianTab: "news" | "sport" =
    params.gtab === "sport" ? "sport" : "news";
  const guardianSection = guardianTab === "sport" ? "sport" : "world";

  // Pre-fetch whichever source the URL is pointing to — fire-and-forget failures
  // so a slow upstream never blocks the page from rendering.
  let guardianInitial: GuardianListItem[] | null = null;
  let engooInitial: EngooListApiResponse | null = null;

  if (isGuardian) {
    guardianInitial = await fetchGuardianListItems(guardianSection, 30).catch(
      () => null,
    );
  } else {
    engooInitial = await fetchEngooDefaultItems(18).catch(() => null);
  }

  return (
    <Suspense fallback={<HomeSkeleton layout={isGuardian ? "category" : "featured"} />}>
      <DailyNewsHub
        guardianInitial={guardianInitial}
        engooInitial={engooInitial}
      />
    </Suspense>
  );
}
