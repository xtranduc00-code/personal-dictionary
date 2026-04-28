import { NextRequest, NextResponse } from "next/server";
import {
  isAllowedGuardianArticleUrl,
  normalizeGuardianArticleUrl,
} from "@/lib/guardian-article-url";
import { sanitizeGuardianArticleHtml } from "@/lib/sanitize-html-app";
import {
  logArticleExtract,
  measureArticleHtml,
} from "@/lib/article-html-validator";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function jsonErr(status: number, error: string, code: string) {
  return NextResponse.json(
    { error, code },
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Guardian-Read-Error": code,
      },
    },
  );
}

type GuardianApiContent = {
  id: string;
  webTitle: string;
  webUrl: string;
  fields?: {
    headline?: string;
    byline?: string;
    body?: string;
    standfirst?: string;
  };
};

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!raw) return jsonErr(400, "Missing url parameter.", "missing_url");

  let articleUrl: URL;
  try {
    articleUrl = new URL(raw);
  } catch {
    return jsonErr(400, "Invalid URL.", "invalid_url");
  }

  if (!isAllowedGuardianArticleUrl(articleUrl)) {
    return jsonErr(403, "Only theguardian.com article URLs are allowed.", "url_not_allowed");
  }

  articleUrl = normalizeGuardianArticleUrl(articleUrl);

  const apiKey = process.env.GUARDIAN_API_KEY?.trim();
  if (!apiKey) {
    return jsonErr(503, "Guardian API key is not configured on this server.", "no_api_key");
  }

  /* Guardian Content API: strip leading slash to get the piece ID */
  const pieceId = articleUrl.pathname.replace(/^\//, "");
  const apiUrl = new URL(`https://content.guardianapis.com/${pieceId}`);
  apiUrl.searchParams.set("show-fields", "headline,byline,body,standfirst");
  apiUrl.searchParams.set("api-key", apiKey);

  let apiRes: Response;
  try {
    apiRes = await fetch(apiUrl.toString(), {
      headers: {
        "User-Agent": "KenWorkspace/1.0 (personal productivity app)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.includes("timeout") || msg.includes("abort") || msg.toLowerCase().includes("timedout");
    if (isTimeout) {
      return jsonErr(408, "Guardian API request timed out. Try again.", "timeout");
    }
    return jsonErr(422, "Could not reach the Guardian API.", "upstream_fetch_failed");
  }

  if (!apiRes.ok) {
    if (apiRes.status === 404) {
      return jsonErr(422, "Article not found (404).", "not_found");
    }
    if (apiRes.status === 403) {
      return jsonErr(422, "Guardian API access denied. Check the API key.", "api_forbidden");
    }
    return jsonErr(422, `Guardian API returned HTTP ${apiRes.status}.`, "api_error");
  }

  let data: { response?: { status?: string; content?: GuardianApiContent } };
  try {
    data = (await apiRes.json()) as typeof data;
  } catch {
    return jsonErr(422, "Guardian API returned unexpected data.", "api_parse_error");
  }

  const content = data.response?.content;
  if (!content) {
    return jsonErr(422, "Article not found or not available via Guardian API.", "no_content");
  }

  const rawBody = content.fields?.body;
  if (!rawBody) {
    return jsonErr(
      422,
      "This article's full body is not available via the Guardian API. Open it on the Guardian site instead.",
      "no_body",
    );
  }

  const title =
    content.fields?.headline?.trim() ||
    content.webTitle?.trim() ||
    "Article";

  const htmlSanitized = sanitizeGuardianArticleHtml(rawBody);
  if (!htmlSanitized.trim() || htmlSanitized.length < 40) {
    return jsonErr(422, "Article content was empty after processing.", "sanitized_empty");
  }

  // Cross-source semantic validator — same shape of log as the HBR pipeline.
  // Surfaces "only-paragraphs" articles in production logs so the team can
  // spot Guardian Content API regressions or sanitizer over-stripping.
  logArticleExtract({
    source: "guardian",
    url: articleUrl.toString(),
    metrics: measureArticleHtml(htmlSanitized),
  });

  return new NextResponse(
    JSON.stringify({
      title,
      html: htmlSanitized,
      url: articleUrl.toString(),
      byline: content.fields?.byline?.trim() ?? null,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    },
  );
}
