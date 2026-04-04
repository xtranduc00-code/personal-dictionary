import { NextRequest, NextResponse } from "next/server";
import {
  buildEngooListResponse,
  fetchEngooLessonHeadersPage,
} from "@/lib/engoo-fetch";
import { ENGOO_DEFAULT_CATEGORY_LABEL } from "@/lib/engoo-api-config";
import {
  ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL,
  parseEngooListCategoryQueryParam,
} from "@/lib/engoo-daily-news-categories";
import { getCachedEngooList, setCachedEngooList } from "@/lib/engoo-cache";
import type { EngooListApiResponse } from "@/lib/engoo-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const TOPIC_FETCH_BATCH = 36;
const TOPIC_FETCH_MAX_ROUNDS = 8;

function parseIntParam(v: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const minLevel = parseIntParam(sp.get("minLevel"), 1, 1, 10);
  const maxLevel = parseIntParam(sp.get("maxLevel"), 10, 1, 10);
  const lo = Math.min(minLevel, maxLevel);
  const hi = Math.max(minLevel, maxLevel);
  const rawCategory = sp.get("category")?.trim() || null;
  const { apiCategoryId, topicSlug } = parseEngooListCategoryQueryParam(
    rawCategory,
  );
  const topicLabel =
    topicSlug && topicSlug in ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL
      ? ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL[
          topicSlug as keyof typeof ENGOO_DAILY_NEWS_TOPIC_SLUG_TO_LABEL
        ]
      : null;
  const categoryLabel = ENGOO_DEFAULT_CATEGORY_LABEL;
  const pageSize = parseIntParam(sp.get("page_size"), 9, 1, 30);
  const cursor = sp.get("cursor")?.trim() || null;

  const cacheKey = `list:${apiCategoryId}:t:${topicSlug ?? "all"}:${cursor ?? "first"}:${pageSize}:${lo}:${hi}`;
  const hit = getCachedEngooList<EngooListApiResponse>(cacheKey);
  if (hit) {
    return NextResponse.json(hit, {
      headers: { "x-engoo-cache": "hit" },
    });
  }

  try {
    let body: EngooListApiResponse;

    if (topicLabel) {
      const accumulated: unknown[] = [];
      const references: Record<string, Record<string, unknown>> = {};
      let engooCursor = cursor;
      let lastNext: string | null = null;
      let filled: EngooListApiResponse | undefined;

      for (let round = 0; round < TOPIC_FETCH_MAX_ROUNDS; round++) {
        const { raw, nextCursor, references: refBatch } =
          await fetchEngooLessonHeadersPage({
            categoryId: apiCategoryId,
            cursor: engooCursor,
            pageSize: TOPIC_FETCH_BATCH,
          });
        lastNext = nextCursor;
        Object.assign(references, refBatch);
        if (raw.length === 0) break;
        accumulated.push(...raw);
        const candidate = buildEngooListResponse({
          rows: accumulated,
          nextCursor: lastNext,
          categoryLabel,
          references,
          minLevel: lo,
          maxLevel: hi,
          topicLabel,
        });
        if (candidate.items.length >= pageSize || !nextCursor) {
          filled = {
            items: candidate.items.slice(0, pageSize),
            nextCursor: lastNext,
          };
          break;
        }
        engooCursor = nextCursor;
      }

      if (!filled) {
        const final = buildEngooListResponse({
          rows: accumulated,
          nextCursor: lastNext,
          categoryLabel,
          references,
          minLevel: lo,
          maxLevel: hi,
          topicLabel,
        });
        filled = {
          items: final.items.slice(0, pageSize),
          nextCursor: lastNext,
        };
      }
      body = filled;
    } else {
      const { raw, nextCursor, references } = await fetchEngooLessonHeadersPage({
        categoryId: apiCategoryId,
        cursor,
        pageSize,
      });
      body = buildEngooListResponse({
        rows: raw,
        nextCursor,
        categoryLabel,
        references,
        minLevel: lo,
        maxLevel: hi,
      });
    }

    setCachedEngooList(cacheKey, body);
    return NextResponse.json(body, {
      headers: { "x-engoo-cache": "miss" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Engoo list fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
