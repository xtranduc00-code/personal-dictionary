/** Client-safe RSS headline row (no jsdom / Node-only deps). */
export type FootballRssHeadline = {
  /** Stable key for React */
  id: string;
  title: string;
  link: string;
  publishedAt: string;
  summary: string;
  /** From `media:thumbnail` when present */
  thumbnailUrl: string | null;
};

export const BBC_SPORT_FOOTBALL_RSS_URL =
  "https://feeds.bbci.co.uk/sport/football/rss.xml";

/** Larger ichef size for list cards (RSS defaults to 240px). */
export function upgradeBbcRssThumbnailUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  return u.replace(/\/ace\/standard\/\d+\//i, "/ace/standard/976/");
}

/** Title / summary / URL substring matches (BBC often omits “women’s” in headlines). */
export const WOMENS_FOOTBALL_EXCLUDE_KEYWORDS = [
  "women's",
  "women",
  "woman",
  "female",
  "wsl",
  "lionesses",
  "nữ",
] as const;

/**
 * Heuristic: women’s football vs men’s. Combine title + summary + URL; optional
 * category/tags when you have them (RSS does not).
 */
export function isWomensFootballHeadline(
  row: FootballRssHeadline,
  extra?: { category?: string; tags?: string },
): boolean {
  const u = row.link.toLowerCase();
  if (/\/womens(?:\/|-|$)/.test(u)) return true;
  if (u.includes("womens") || u.includes("women-football")) return true;

  const combined = [
    row.title,
    row.summary,
    extra?.category ?? "",
    extra?.tags ?? "",
    row.link,
  ]
    .join(" ")
    .toLowerCase();

  if (WOMENS_FOOTBALL_EXCLUDE_KEYWORDS.some((k) => combined.includes(k))) {
    return true;
  }

  const blob = combined.replace(/\s+/g, " ");
  if (/women'?s champions league/.test(blob)) return true;
  if (/women'?s super league/.test(blob)) return true;
  if (/women'?s fa cup/.test(blob)) return true;
  if (/women'?s (euro|euros|international)/.test(blob)) return true;
  if (/women'?s world cup/.test(blob)) return true;
  if (/fifa women'?s/.test(blob)) return true;
  if (/barclays women/.test(blob)) return true;
  if (/\bmatildas\b/.test(blob)) return true;
  if (/\bwsl\s*2\b/.test(blob)) return true;
  if (/wsl\s*2\s+side\b/.test(blob)) return true;
  if (/women'?s champions\b/.test(blob)) return true;
  if (/\bwomens champions league\b/.test(blob)) return true;
  if (/women'?s league cup\b/.test(blob)) return true;
  if (/women'?s\s+cl\b/.test(blob)) return true;
  if (/\bwwsl\b|\bnwsl\b/.test(blob)) return true;

  return false;
}

export function filterWomensFootballHeadlines(
  items: FootballRssHeadline[],
  hideWomens: boolean,
): FootballRssHeadline[] {
  if (!hideWomens) return items;
  return items.filter((r) => !isWomensFootballHeadline(r));
}
