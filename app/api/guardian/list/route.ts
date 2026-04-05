import { NextResponse } from "next/server";
import { isWomensFootballHeadline } from "@/lib/bbc-football-rss-shared";
import type { GuardianListItem } from "@/lib/guardian-content-types";

type GuardianApiResult = {
  id?: string;
  webTitle?: string;
  webUrl?: string;
  webPublicationDate?: string;
  fields?: {
    thumbnail?: string;
    trailText?: string;
  };
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * GET ?section=world|sport — Guardian Content API search (developer key).
 * `sport` → Guardian `football` section + filter out women’s-football stories (men’s EPL/UCL/WC/transfers focus).
 * https://open-platform.theguardian.com/documentation/
 */
export async function GET(req: Request) {
  const key = process.env.GUARDIAN_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "GUARDIAN_API_KEY is not set", items: [] as GuardianListItem[] },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const sectionRaw = searchParams.get("section")?.trim().toLowerCase();
  const clientSport = sectionRaw === "sport";
  /** Guardian section id: sport tab uses `football`, not whole `sport` (avoids cricket/rugby/etc.). */
  const guardianSection = clientSport ? "football" : "world";

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const requestedPageSize = Math.min(
    50,
    Math.max(1, Number(searchParams.get("pageSize")) || 30),
  );
  /** Fetch extra when filtering women’s football so the client still gets ~requestedPageSize rows when possible. */
  const apiPageSize = clientSport
    ? Math.min(50, Math.max(requestedPageSize * 2, 36))
    : requestedPageSize;

  const u = new URL("https://content.guardianapis.com/search");
  u.searchParams.set("api-key", key);
  u.searchParams.set("section", guardianSection);
  u.searchParams.set("order-by", "newest");
  u.searchParams.set("page-size", String(apiPageSize));
  u.searchParams.set("page", String(page));
  u.searchParams.set("show-fields", "thumbnail,trailText");

  try {
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[guardian/list]", res.status, text.slice(0, 400));
      return NextResponse.json(
        { error: "Guardian API request failed", items: [] as GuardianListItem[] },
        { status: 502 },
      );
    }
    const json = (await res.json()) as {
      response?: { results?: GuardianApiResult[] };
    };
    const raw = json.response?.results ?? [];
    let items: GuardianListItem[] = raw
      .filter((r) => r.webUrl && r.webTitle)
      .map((r) => ({
        id: r.id ?? r.webUrl!,
        webTitle: r.webTitle!,
        webUrl: r.webUrl!,
        webPublicationDate: r.webPublicationDate ?? "",
        thumbnailUrl: r.fields?.thumbnail?.trim() || null,
        trailText: r.fields?.trailText
          ? stripHtml(r.fields.trailText)
          : null,
      }));

    if (clientSport) {
      items = items.filter(
        (item) =>
          !isWomensFootballHeadline({
            id: item.id,
            title: item.webTitle,
            link: item.webUrl,
            publishedAt: item.webPublicationDate,
            summary: item.trailText ?? "",
            thumbnailUrl: item.thumbnailUrl,
          }),
      );
      items = items.slice(0, requestedPageSize);
    }

    return NextResponse.json({
      items,
      section: sectionRaw === "sport" ? "sport" : "world",
    });
  } catch (e) {
    console.error("[guardian/list]", e);
    return NextResponse.json(
      { error: "Guardian list failed", items: [] as GuardianListItem[] },
      { status: 500 },
    );
  }
}
