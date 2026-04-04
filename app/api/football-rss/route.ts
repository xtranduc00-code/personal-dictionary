import { NextResponse } from "next/server";
import {
  BBC_SPORT_FOOTBALL_RSS_URL,
  parseFootballRssXml,
} from "@/lib/bbc-football-rss";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA = "KenWorkspace/1.0 (private RSS reader; football headlines)";

export async function GET() {
  try {
    const res = await fetch(BBC_SPORT_FOOTBALL_RSS_URL, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": UA,
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `RSS HTTP ${res.status}` },
        { status: 502 },
      );
    }
    const xml = await res.text();
    const items = parseFootballRssXml(xml);
    return NextResponse.json(
      {
        items,
        sourceName: "BBC Sport",
        feedUrl: BBC_SPORT_FOOTBALL_RSS_URL,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=600, stale-while-revalidate=1200",
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "RSS fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
