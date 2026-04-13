/**
 * Shared Guardian list-fetch logic — used by both the API route handler and
 * the server-side pre-fetch in `app/news/page.tsx` (streaming SSR).
 */
import { isWomensFootballHeadline } from "@/lib/bbc-football-rss-shared";
import type { GuardianListItem } from "@/lib/guardian-content-types";

type GuardianApiResult = {
  id?: string;
  webTitle?: string;
  webUrl?: string;
  webPublicationDate?: string;
  fields?: { thumbnail?: string; trailText?: string };
};

type GuardianSearchEnvelope = {
  response?: {
    status?: string;
    message?: string;
    results?: GuardianApiResult[];
  };
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Fetch from the Guardian Content API and return normalized items.
 * Throws on network / upstream errors — callers should `.catch(() => [])`.
 */
export async function fetchGuardianListItems(
  section: "world" | "sport",
  pageSize = 30,
): Promise<GuardianListItem[]> {
  const key = process.env.GUARDIAN_API_KEY?.trim();
  if (!key) throw new Error("GUARDIAN_API_KEY not set");

  const guardianSection = section === "sport" ? "football" : "world";
  const apiPageSize =
    section === "sport" ? Math.min(200, Math.max(pageSize * 2, 36)) : pageSize;

  const u = new URL("https://content.guardianapis.com/search");
  u.searchParams.set("api-key", key);
  u.searchParams.set("section", guardianSection);
  u.searchParams.set("order-by", "newest");
  u.searchParams.set("page-size", String(apiPageSize));
  u.searchParams.set("page", "1");
  u.searchParams.set("show-fields", "thumbnail,trailText");

  const res = await fetch(u.toString(), {
    headers: { Accept: "application/json" },
    // Allow Next.js fetch cache (revalidate every 2 min) so parallel
    // server-component renders don't double-hit the Guardian API.
    next: { revalidate: 120 },
  });

  if (!res.ok) throw new Error(`Guardian API ${res.status}`);

  const rawText = await res.text();
  const json = JSON.parse(rawText) as GuardianSearchEnvelope;
  const envelope = json.response;
  if (envelope?.status === "error") throw new Error(envelope.message ?? "Guardian API error");

  const raw = envelope?.results ?? [];
  let items: GuardianListItem[] = raw
    .filter((r) => r.webUrl && r.webTitle)
    .map((r) => ({
      id: r.id ?? r.webUrl!,
      webTitle: r.webTitle!,
      webUrl: r.webUrl!,
      webPublicationDate: r.webPublicationDate ?? "",
      thumbnailUrl:
        typeof r.fields?.thumbnail === "string"
          ? r.fields.thumbnail.trim() || null
          : null,
      trailText:
        typeof r.fields?.trailText === "string" ? stripHtml(r.fields.trailText) : null,
    }));

  if (section === "sport") {
    items = items
      .filter(
        (item) =>
          !isWomensFootballHeadline({
            id: item.id,
            title: item.webTitle,
            link: item.webUrl,
            publishedAt: item.webPublicationDate,
            summary: item.trailText ?? "",
            thumbnailUrl: item.thumbnailUrl,
          }),
      )
      .slice(0, pageSize);
  }

  return items;
}
