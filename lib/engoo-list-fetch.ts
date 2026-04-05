/**
 * Shared Engoo list-fetch logic — used by both the API route handler and
 * the server-side pre-fetch in `app/news/page.tsx` (streaming SSR).
 *
 * Uses the same in-memory cache key format as `app/api/engoo/list/route.ts`
 * so warm hits are served instantly even when called from the Server Component.
 */
import {
  buildEngooListResponse,
  fetchEngooLessonHeadersPage,
} from "@/lib/engoo-fetch";
import { ENGOO_DEFAULT_CATEGORY_LABEL } from "@/lib/engoo-api-config";
import { ENGOO_DAILY_NEWS_PARENT_CATEGORY_ID } from "@/lib/engoo-daily-news-categories";
import { getCachedEngooList, setCachedEngooList } from "@/lib/engoo-cache";
import type { EngooListApiResponse } from "@/lib/engoo-types";

/**
 * Fetch the default "All" Engoo Daily News list (no topic filter, page 1).
 * Throws on network errors — callers should `.catch(() => null)`.
 */
export async function fetchEngooDefaultItems(
  pageSize = 18,
): Promise<EngooListApiResponse> {
  // Must match the cacheKey formula in app/api/engoo/list/route.ts
  const cacheKey = `list:${ENGOO_DAILY_NEWS_PARENT_CATEGORY_ID}:t:all:first:${pageSize}:1:10`;
  const hit = getCachedEngooList<EngooListApiResponse>(cacheKey);
  if (hit) return hit;

  const { raw, nextCursor, references } = await fetchEngooLessonHeadersPage({
    categoryId: ENGOO_DAILY_NEWS_PARENT_CATEGORY_ID,
    cursor: null,
    pageSize,
  });

  const body = buildEngooListResponse({
    rows: raw,
    nextCursor,
    categoryLabel: ENGOO_DEFAULT_CATEGORY_LABEL,
    references,
    minLevel: 1,
    maxLevel: 10,
  });

  setCachedEngooList(cacheKey, body);
  return body;
}
