import { NextResponse } from "next/server";
import { isWomensFootballHeadline } from "@/lib/bbc-football-rss-shared";
import type { GuardianListItem } from "@/lib/guardian-content-types";

/** Node runtime so `process.env.GUARDIAN_API_KEY` matches Netlify server env (not Edge). */
export const runtime = "nodejs";

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
 * GET ?section=world|sport — Guardian Content API search (developer key).
 * `sport` → Guardian `football` section + filter out women’s-football stories (men’s EPL/UCL/WC/transfers focus).
 * https://open-platform.theguardian.com/documentation/
 */
export async function GET(req: Request) {
  /** Code and Netlify UI must both use exactly `GUARDIAN_API_KEY` (no NEXT_PUBLIC_ prefix). */
  const key = process.env.GUARDIAN_API_KEY?.trim();
  if (!key) {
    console.warn("[guardian/list] GUARDIAN_API_KEY missing", {
      guardian_api_key_configured: false,
    });
    return NextResponse.json(
      {
        error: "GUARDIAN_API_KEY is not set",
        code: "missing_api_key",
        items: [] as GuardianListItem[],
      },
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

  const safeLogUrl = new URL(u.toString());
  safeLogUrl.searchParams.set("api-key", "(redacted)");
  /* Env var name in Netlify must match code: GUARDIAN_API_KEY */
  console.info("[guardian/list] request", {
    guardian_api_key_configured: true,
    outbound_url: safeLogUrl.toString(),
    guardian_section: guardianSection,
    page,
    api_page_size: apiPageSize,
  });

  try {
    /**
     * Avoid `next: { revalidate }` here — Netlify’s Next serverless adapter has had
     * issues with Next’s fetch cache options, which can surface as a generic 500.
     */
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const rawText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[guardian/list] upstream", {
        status: res.status,
        contentType: res.headers.get("content-type"),
        bodyPreview: rawText.slice(0, 400),
      });
      return NextResponse.json(
        {
          error: "Guardian API request failed",
          code: "upstream_http_error",
          items: [] as GuardianListItem[],
        },
        { status: 502 },
      );
    }
    let json: GuardianSearchEnvelope;
    try {
      json = JSON.parse(rawText) as GuardianSearchEnvelope;
    } catch (e) {
      console.error("[guardian/list] invalid JSON from Guardian", {
        contentType: res.headers.get("content-type"),
        preview: rawText.slice(0, 400),
        err: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json(
        {
          error: "Guardian API returned an invalid response",
          code: "upstream_invalid_json",
          items: [] as GuardianListItem[],
        },
        { status: 502 },
      );
    }

    const envelope = json.response;
    if (envelope?.status === "error") {
      const apiMsg =
        typeof envelope.message === "string" && envelope.message.trim()
          ? envelope.message.trim()
          : "Guardian API rejected the request (check the API key and quotas).";
      console.error("[guardian/list] guardian api error envelope", {
        messagePreview: apiMsg.slice(0, 300),
      });
      return NextResponse.json(
        {
          error: apiMsg,
          code: "guardian_api_error",
          items: [] as GuardianListItem[],
        },
        { status: 502 },
      );
    }

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
          typeof r.fields?.trailText === "string"
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
    console.error("[guardian/list] exception", {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "Guardian list failed",
        code: "internal_error",
        items: [] as GuardianListItem[],
      },
      { status: 500 },
    );
  }
}
