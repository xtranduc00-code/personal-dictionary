import { JSDOM } from "jsdom";
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

const MRSS_NS = "http://search.yahoo.com/mrss/";

function textFromHtmlish(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const { document } = new JSDOM(`<div>${t}</div>`).window;
    const plain = document.body.textContent ?? "";
    return plain.replace(/\s+/g, " ").trim();
  } catch {
    return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/** Parse BBC Sport Football RSS 2.0 (or compatible) into headline rows. Server-only. */
export function parseFootballRssXml(xml: string): FootballRssHeadline[] {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  const doc = dom.window.document;
  const nodes = doc.querySelectorAll("item");
  const out: FootballRssHeadline[] = [];

  nodes.forEach((el) => {
    const title = el.querySelector("title")?.textContent?.trim() ?? "";
    let link = el.querySelector("link")?.textContent?.trim() ?? "";
    if (!link) {
      const guid = el.querySelector("guid");
      link = guid?.textContent?.trim() ?? "";
    }
    if (!title || !link) return;
    try {
      link = normalizeBbcArticleUrl(new URL(link)).toString();
    } catch {
      /* keep RSS link as-is if malformed */
    }
    const pub = el.querySelector("pubDate")?.textContent?.trim() ?? "";
    const descRaw = el.querySelector("description")?.textContent ?? "";
    const summary = textFromHtmlish(descRaw).slice(0, 280);
    const thumbRaw =
      el.getElementsByTagNameNS(MRSS_NS, "thumbnail")[0]?.getAttribute("url")?.trim() ??
      "";
    let thumbnailUrl: string | null = null;
    if (thumbRaw.startsWith("https://")) {
      thumbnailUrl = upgradeBbcRssThumbnailUrl(thumbRaw);
    } else if (thumbRaw.startsWith("http://")) {
      thumbnailUrl = upgradeBbcRssThumbnailUrl(
        thumbRaw.replace(/^http:\/\//i, "https://"),
      );
    }
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
