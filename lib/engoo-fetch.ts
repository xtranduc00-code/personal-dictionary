import {
  ENGOO_API_BASE,
  ENGOO_DEFAULT_CATEGORY_ID,
  ENGOO_DEFAULT_ORG,
} from "@/lib/engoo-api-config";
import type { EngooListCard, EngooListApiResponse } from "@/lib/engoo-types";
import { engooLevelLabelFromNumber } from "@/lib/engoo-level-label";
import { parseEngooLessonEnvelope } from "@/lib/engoo-parse-lesson";
import type { EngooArticlePayload } from "@/lib/engoo-types";
import { resolveEngooListCardCategory } from "@/lib/engoo-resolve-card-category";

type RefMap = Record<string, Record<string, unknown>>;

const UA =
  "Mozilla/5.0 (compatible; KenWorkspace/1.0; English learning companion)";

/** NEW badge: `first_published_at` within the last `days` calendar days. */
function isPublishedWithinLastDays(iso: string, days: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < days * 24 * 60 * 60 * 1000;
}

export async function fetchEngooLessonHeadersPage(options: {
  categoryId: string;
  cursor: string | null;
  pageSize: number;
}): Promise<{ raw: unknown[]; nextCursor: string | null; references: RefMap }> {
  const params = new URLSearchParams({
    category: options.categoryId,
    direction: "desc",
    order: "first_published_at",
    page_size: String(options.pageSize),
    published_latest: "true",
    type: "Published",
  });
  if (options.cursor) {
    params.set("older_than", options.cursor);
  }

  const url = `${ENGOO_API_BASE}/lesson_headers?${params}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`Engoo lesson_headers HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: unknown[];
    references?: RefMap;
  };
  const raw = Array.isArray(json.data) ? json.data : [];
  const references = json.references ?? {};
  const last = raw[raw.length - 1] as
    | { first_published_at?: string }
    | undefined;
  const nextCursor =
    raw.length > 0 && last?.first_published_at
      ? last.first_published_at
      : null;
  return { raw, nextCursor, references };
}

export function mapLessonHeaderRows(
  rows: unknown[],
  categoryLabel: string,
  references: RefMap = {},
): EngooListCard[] {
  const out: EngooListCard[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const h = row as Record<string, unknown>;
    const masterId = typeof h.master_id === "string" ? h.master_id : "";
    const headerId = typeof h.id === "string" ? h.id : "";
    if (!masterId || !headerId) continue;
    const titleText = h.title_text as Record<string, unknown> | undefined;
    const title =
      typeof titleText?.text === "string" ? titleText.text : "Untitled";
    const image = h.image as { url?: string } | undefined;
    const rawLevel = h.content_level;
    const level =
      typeof rawLevel === "number" && Number.isFinite(rawLevel)
        ? rawLevel
        : null;
    const firstPublishedAt =
      typeof h.first_published_at === "string" ? h.first_published_at : "";
    out.push({
      masterId,
      headerId,
      title,
      thumbnailUrl: image?.url ?? "",
      level,
      levelLabel:
        level !== null ? engooLevelLabelFromNumber(level) : "",
      category: resolveEngooListCardCategory(h, references, categoryLabel),
      featured: Boolean(h.featured),
      firstPublishedAt,
      isNew:
        firstPublishedAt.length > 0 &&
        isPublishedWithinLastDays(firstPublishedAt, 3),
    });
  }
  return out;
}

export function buildEngooListResponse(options: {
  rows: unknown[];
  nextCursor: string | null;
  categoryLabel: string;
  references?: RefMap;
  minLevel: number;
  maxLevel: number;
  /** When set, keep only cards whose resolved topic pill equals this label. */
  topicLabel?: string | null;
}): EngooListApiResponse {
  let items = mapLessonHeaderRows(
    options.rows,
    options.categoryLabel,
    options.references ?? {},
  );
  items = items.filter((c) => {
    if (c.level === null) return true;
    return (
      c.level >= options.minLevel && c.level <= options.maxLevel
    );
  });
  const topic = options.topicLabel?.trim();
  if (topic) {
    items = items.filter((c) => c.category === topic);
  }
  items.sort((a, b) => {
    const feat =
      (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    if (feat !== 0) return feat;
    return (
      Date.parse(b.firstPublishedAt || "") -
      Date.parse(a.firstPublishedAt || "")
    );
  });
  return { items, nextCursor: options.nextCursor };
}

export async function fetchEngooLessonCurrent(
  masterId: string,
  orgId: string,
): Promise<EngooArticlePayload> {
  const url = `${ENGOO_API_BASE}/lessons/${encodeURIComponent(masterId)}/current?context_organization=${encodeURIComponent(orgId)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`Engoo lesson HTTP ${res.status}`);
  }
  const envelope = (await res.json()) as Parameters<
    typeof parseEngooLessonEnvelope
  >[0];
  const categoryLabel =
    process.env.ENGOO_LESSON_CATEGORY_LABEL ?? "Daily News";
  return parseEngooLessonEnvelope(envelope, masterId, categoryLabel);
}

export { ENGOO_DEFAULT_CATEGORY_ID, ENGOO_DEFAULT_ORG };
