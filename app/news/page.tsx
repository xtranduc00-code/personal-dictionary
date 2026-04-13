import type { Metadata } from "next";
import { Suspense } from "react";
import { DailyNewsHub } from "@/components/engoo/daily-news-hub";
import { HomeSkeleton } from "@/components/engoo/engoo-daily-news-home";
import { fetchGuardianListItems } from "@/lib/guardian-list-fetch";
import { fetchEngooDefaultItems } from "@/lib/engoo-list-fetch";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import type { EngooListApiResponse } from "@/lib/engoo-types";
import type { RssItem } from "@/app/api/rss/route";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Daily News",
  description:
    "Engoo-style Daily News plus Guardian and Harvard Business Review headlines — read structured lessons and start an AI tutor call with full context.",
};

async function fetchHbrInitial(): Promise<RssItem[] | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    if (!host) return null;
    const res = await fetch(`${proto}://${host}/api/rss?source=hbr`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: RssItem[] };
    return json.items ?? null;
  } catch {
    return null;
  }
}

export default async function NewsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string; category?: string }>;
}) {
  const params = await searchParams;
  const isHBR = params.src === "hbr";
  const isSport = params.category === "sport";

  let guardianSportInitial: GuardianListItem[] | null = null;
  let engooInitial: EngooListApiResponse | null = null;
  let hbrInitial: RssItem[] | null = null;

  if (isHBR) {
    hbrInitial = await fetchHbrInitial();
  } else if (isSport) {
    guardianSportInitial = await fetchGuardianListItems("sport", 50).catch(
      () => null,
    );
  } else {
    engooInitial = await fetchEngooDefaultItems(30).catch(() => null);
  }

  return (
    <Suspense
      fallback={
        <HomeSkeleton layout={isHBR || isSport ? "category" : "featured"} />
      }
    >
      <DailyNewsHub
        guardianSportInitial={guardianSportInitial}
        engooInitial={engooInitial}
        hbrInitial={hbrInitial}
      />
    </Suspense>
  );
}
