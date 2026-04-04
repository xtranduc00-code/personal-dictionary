import { NextRequest, NextResponse } from "next/server";
import { ENGOO_DEFAULT_ORG } from "@/lib/engoo-api-config";
import { fetchEngooLessonCurrent } from "@/lib/engoo-fetch";
import { getCachedEngooLesson, setCachedEngooLesson } from "@/lib/engoo-cache";

export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const masterId = req.nextUrl.searchParams.get("masterId")?.trim() ?? "";
  if (!masterId || !UUID_RE.test(masterId)) {
    return NextResponse.json(
      { error: "Missing or invalid masterId (UUID)." },
      { status: 400 },
    );
  }

  const org = ENGOO_DEFAULT_ORG;
  const cacheKey = `lesson:${org}:${masterId}`;
  const hit = getCachedEngooLesson<Awaited<ReturnType<typeof fetchEngooLessonCurrent>>>(
    cacheKey,
  );
  if (hit) {
    return NextResponse.json(hit, {
      headers: { "x-engoo-cache": "hit" },
    });
  }

  try {
    const payload = await fetchEngooLessonCurrent(masterId, org);
    setCachedEngooLesson(cacheKey, payload);
    return NextResponse.json(payload, {
      headers: { "x-engoo-cache": "miss" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Engoo lesson fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
