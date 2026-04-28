import type { RssItem } from "@/app/api/rss/route";
import type { KindleEpubArticle } from "@/lib/guardian-kindle-epub";

/**
 * Reasons an HBR URL is unsuitable for sideload as a Kindle EPUB chapter.
 * Distinct from Guardian skip reasons (Guardian uses /live/, /audio/, /gallery/...
 * — HBR uses /podcast/, /video/, /webinar/, /sponsored-content/).
 *
 *  - podcast: IdeaCast and other podcasts (audio-first, low text density)
 *  - video: HBR Big Idea videos and similar (player-only)
 *  - webinar: webinar landing pages (registration form, no body)
 *  - sponsored: native-ad slots, branded content
 *
 * Premium-only / paywalled articles aren't detectable from URL alone — those
 * fall back to RssItem.summary as paragraph content via the existing pipeline.
 */
export type HbrKindleSkipReason = "podcast" | "video" | "webinar" | "sponsored";

const HBR_SKIP_PATTERNS: Array<{ re: RegExp; reason: HbrKindleSkipReason }> = [
  { re: /(^|\/)podcast(s)?\//, reason: "podcast" },
  { re: /(^|\/)video(s)?\//, reason: "video" },
  { re: /(^|\/)webinar(s)?\//, reason: "webinar" },
  { re: /(^|\/)sponsored-content\//, reason: "sponsored" },
];

/** null when the URL is OK to include; otherwise the skip reason. */
export function shouldSkipForKindleEpubHbr(href: string): HbrKindleSkipReason | null {
  let pathname: string;
  try {
    pathname = new URL(href).pathname;
  } catch {
    return null;
  }
  for (const { re, reason } of HBR_SKIP_PATTERNS) {
    if (re.test(pathname)) return reason;
  }
  return null;
}

type FetchArticleResponse = {
  title?: string;
  content?: string;
  textContent?: string;
  excerpt?: string | null;
  url?: string;
  error?: string;
};

/**
 * Fetch full reader HTML for each HBR list row via /api/fetch-article (which
 * already handles HBR's datacenter-IP corruption via Wayback fallback). Bounded
 * concurrency mirrors the Guardian fetcher; HBR's Wayback path can be slower
 * (≤ ~10s per article) so don't fan out further than 3.
 */
export async function fetchHbrArticlesForKindleEpub(
  items: RssItem[],
  concurrency = 3,
  maxArticles = 15,
): Promise<KindleEpubArticle[]> {
  const skippedByReason = new Map<HbrKindleSkipReason, RssItem[]>();
  const readable: RssItem[] = [];
  for (const it of items) {
    const reason = shouldSkipForKindleEpubHbr(it.url);
    if (reason) {
      const list = skippedByReason.get(reason) ?? [];
      list.push(it);
      skippedByReason.set(reason, list);
    } else {
      readable.push(it);
    }
  }
  if (skippedByReason.size > 0) {
    let total = 0;
    const breakdown: string[] = [];
    for (const [reason, list] of skippedByReason) {
      total += list.length;
      breakdown.push(`${list.length} ${reason}`);
    }
    console.log(`[epub] skipped ${total} articles: ${breakdown.join(", ")}`);
    for (const [reason, list] of skippedByReason) {
      console.log(
        `  ${reason}:`,
        list.map((it) => it.url),
      );
    }
  }

  const capped = readable.slice(0, Math.max(0, maxArticles));
  const mapOne = async (item: RssItem): Promise<KindleEpubArticle> => {
    const fallbackParagraphs = [item.summary].filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    try {
      const res = await fetch(
        `/api/fetch-article?url=${encodeURIComponent(item.url)}`,
        { credentials: "same-origin" },
      );
      const raw = await res.text();
      let data: FetchArticleResponse;
      try {
        data = JSON.parse(raw) as FetchArticleResponse;
      } catch {
        return {
          title: item.title,
          paragraphs: fallbackParagraphs.length
            ? fallbackParagraphs
            : ["(Could not load full text.)"],
          bodyHtml: "",
          sourceUrl: item.url,
        };
      }
      if (!res.ok || !data.title) {
        return {
          title: item.title,
          paragraphs: fallbackParagraphs.length
            ? fallbackParagraphs
            : ["(Could not load full text.)"],
          bodyHtml: "",
          sourceUrl: item.url,
        };
      }
      const html = data.content ?? "";
      // Plain-text fallback paragraphs: split textContent into double-newline blocks
      // for the case where bodyHtml is empty/short.
      const text = (data.textContent ?? "").trim();
      const paras = text
        ? text
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
      return {
        title: (data.title || item.title).trim() || item.title,
        paragraphs: paras.length
          ? paras
          : fallbackParagraphs.length
            ? fallbackParagraphs
            : ["(No body text.)"],
        bodyHtml: html,
        sourceUrl: data.url ?? item.url,
      };
    } catch {
      return {
        title: item.title,
        paragraphs: fallbackParagraphs.length
          ? fallbackParagraphs
          : ["(Could not load full text.)"],
        bodyHtml: "",
        sourceUrl: item.url,
      };
    }
  };

  const out: KindleEpubArticle[] = [];
  for (let i = 0; i < capped.length; i += concurrency) {
    const chunk = capped.slice(i, i + concurrency);
    const part = await Promise.all(chunk.map(mapOne));
    out.push(...part);
  }
  return out;
}
