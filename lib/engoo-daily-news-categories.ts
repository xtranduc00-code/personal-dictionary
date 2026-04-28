import { ENGOO_DEFAULT_CATEGORY_ID } from "@/lib/engoo-api-config";
import type { GuardianListSection } from "@/lib/guardian-list-fetch";

/**
 * Daily News sub-tabs on engoo.com use URL segments like
 * `/category/business-politics/g422El24T2-...` — those trailing segments are not
 * `lesson_headers` category UUIDs. The API only accepts the parent Daily News
 * category UUID; we filter tabs client-side by inferred topic labels.
 */
export const ENGOO_DAILY_NEWS_PARENT_CATEGORY_ID = ENGOO_DEFAULT_CATEGORY_ID;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENGOO_DAILY_NEWS_CATEGORIES = [
  { slug: "all", label: "All" },
  { slug: "business-politics", label: "Business & Politics" },
  { slug: "science-technology", label: "Science & Technology" },
  { slug: "health-lifestyle", label: "Health & Lifestyle" },
  { slug: "culture-society", label: "Culture & Society" },
  { slug: "travel-experiences", label: "Travel & Experiences" },
  // "sport" is an out-of-band tab: its articles come from the Guardian Sport
  // feed, not Engoo's lesson_headers. The Engoo list API treats this slug as
  // "all" + never matches a topic, so filtering stays a client-side branch
  // inside `EngooDailyNewsHomeInner`.
  { slug: "sport", label: "Sport" },
] as const;

export type EngooDailyNewsCategoryDef = (typeof ENGOO_DAILY_NEWS_CATEGORIES)[number];

/**
 * Tab slug → pill label produced by `resolveEngooListCardCategory` for filtering.
 * Excludes "all" (no filter) and "sport" (Guardian Sport feed, handled out-of-band).
 */
export const ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL: Record<
  Exclude<EngooDailyNewsCategoryDef["slug"], "all" | "sport">,
  string
> = {
  "business-politics": "Business & Politics",
  "science-technology": "Science & Technology",
  "health-lifestyle": "Health & Lifestyle",
  "culture-society": "Culture & Society",
  "travel-experiences": "Travel & Experiences",
};

export function getEngooDailyNewsCategoryBySlug(
  slug: string | null | undefined,
): EngooDailyNewsCategoryDef {
  const s = (slug ?? "").trim().toLowerCase();
  if (!s) return ENGOO_DAILY_NEWS_CATEGORIES[0];
  const found = ENGOO_DAILY_NEWS_CATEGORIES.find((c) => c.slug === s);
  return found ?? ENGOO_DAILY_NEWS_CATEGORIES[0];
}

/**
 * `category` query for `/api/engoo/list`: UUID → Engoo API as-is; known slug →
 * parent Daily News UUID + topic filter; `all` / empty → parent only.
 */
/**
 * Daily News tab slug → Guardian Content API section ID for the Kindle EPUB
 * download. Tab-rendered list items are Engoo lessons (not articles), so the
 * EPUB content intentionally diverges from what's on screen — pull fresh from
 * Guardian on click.
 *
 * Single-section per tab on purpose: simpler than merging+deduping multiple
 * sections, and a personal Kindle reader doesn't need the breadth.
 */
export const KINDLE_EPUB_TAB_GUARDIAN_SECTION: Record<
  EngooDailyNewsCategoryDef["slug"],
  GuardianListSection
> = {
  all: "world",
  "business-politics": "business",
  "science-technology": "technology",
  "health-lifestyle": "lifeandstyle",
  "culture-society": "culture",
  "travel-experiences": "travel",
  sport: "sport",
};

export function parseEngooListCategoryQueryParam(
  raw: string | null | undefined,
): { apiCategoryId: string; topicSlug: string | null } {
  const v = (raw ?? "").trim();
  if (!v || v.toLowerCase() === "all") {
    return { apiCategoryId: ENGOO_DAILY_NEWS_PARENT_CATEGORY_ID, topicSlug: null };
  }
  if (UUID_RE.test(v)) {
    return { apiCategoryId: v, topicSlug: null };
  }
  const s = v.toLowerCase();
  const found = ENGOO_DAILY_NEWS_CATEGORIES.find((c) => c.slug === s);
  if (found && found.slug !== "all") {
    return {
      apiCategoryId: ENGOO_DAILY_NEWS_PARENT_CATEGORY_ID,
      topicSlug: found.slug,
    };
  }
  return { apiCategoryId: ENGOO_DAILY_NEWS_PARENT_CATEGORY_ID, topicSlug: null };
}
