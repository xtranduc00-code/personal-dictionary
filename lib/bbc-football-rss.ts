import * as cheerio from "cheerio";
import { normalizeBbcArticleUrl } from "@/lib/bbc-article-url";
import {
  upgradeBbcRssThumbnailUrl,
  type FootballRssHeadline,
} from "@/lib/bbc-football-rss-shared";

export type { FootballRssHeadline } from "@/lib/bbc-football-rss-shared";
export {
  BBC_SPORT_FOOTBALL_RSS_URL,
  filterWomensFootballHeadlines,
  isWomensFootballHeadline,
  upgradeBbcRssThumbnailUrl,
  WOMENS_FOOTBALL_EXCLUDE_KEYWORDS,
} from "@/lib/bbc-football-rss-shared";

function textFromHtmlish(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const $ = cheerio.load(t, null, false);
    $("script, style").remove();
    const plain = $.root().text();
    return plain.replace(/\s+/g, " ").trim();
  } catch {
    return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/** Parse BBC Sport Football RSS 2.0 (or compatible). Uses cheerio only (no jsdom) for Netlify/Lambda stability. */
export function parseFootballRssXml(xml: string): FootballRssHeadline[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: FootballRssHeadline[] = [];

  $("item").each((_, el) => {
    const item = $(el);
    const title = item.find("title").first().text().trim();
    let link = item.find("link").first().text().trim();
    if (!link) {
      link = item.find("guid").first().text().trim();
    }
    if (!title || !link) return;
    try {
      link = normalizeBbcArticleUrl(new URL(link)).toString();
    } catch {
      /* keep RSS link as-is if malformed */
    }
    const pub = item.find("pubDate").first().text().trim();
    const descRaw = item.find("description").first().text() ?? "";
    const summary = textFromHtmlish(descRaw).slice(0, 280);

    let thumbnailUrl: string | null = null;
    item.find("*").each((__, node) => {
      if (thumbnailUrl) return false;
      const name = (node.tagName || (node as { name?: string }).name || "")
        .toLowerCase();
      if (!name.includes("thumbnail")) return;
      const raw = $(node).attr("url")?.trim() ?? "";
      if (!raw.startsWith("http")) return;
      if (raw.startsWith("https://")) {
        thumbnailUrl = upgradeBbcRssThumbnailUrl(raw);
      } else {
        thumbnailUrl = upgradeBbcRssThumbnailUrl(
          raw.replace(/^http:\/\//i, "https://"),
        );
      }
      return false;
    });

    out.push({
      id: link,
      title,
      link,
      publishedAt: pub,
      summary,
      thumbnailUrl,
    });
  });

  const seenLinks = new Set<string>();
  return out.filter((row) => {
    if (seenLinks.has(row.link)) return false;
    seenLinks.add(row.link);
    return true;
  });
}
