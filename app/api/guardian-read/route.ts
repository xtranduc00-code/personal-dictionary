import { Readability } from "@mozilla/readability";
import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { absolutizeArticleHtml } from "@/lib/bbc-article-media";
import {
  isAllowedGuardianArticleUrl,
  normalizeGuardianArticleUrl,
} from "@/lib/guardian-article-url";
import {
  guardianReadEnvSnapshot,
  logGuardianReadFailure,
  logGuardianReadRequest,
  logGuardianReadUpstream,
} from "@/lib/guardian-read-server-log";
import { sanitizeGuardianArticleHtml } from "@/lib/sanitize-html-app";

export const runtime = "nodejs";
export const maxDuration = 45;
/** Avoid WAF / bot blocks on cloud IPs (custom “compatible; …” UAs often get 403 or empty bodies). */
export const dynamic = "force-dynamic";

/** Stay under typical serverless response limits (~6MB) with UTF-8 overhead. */
const MAX_JSON_RESPONSE_CHARS = 4_500_000;

const GUARDIAN_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  Referer: "https://www.theguardian.com/",
  "Cache-Control": "no-cache",
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Guardian-Read-Error":
        typeof body.code === "string" ? body.code : `http_${status}`,
    },
  });
}

export async function GET(req: NextRequest) {
  const env = guardianReadEnvSnapshot();

  try {
    const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
    if (!raw) {
      return jsonResponse(400, {
        error: "Missing url parameter.",
        code: "missing_url",
      });
    }

    let articleUrl: URL;
    try {
      articleUrl = new URL(raw);
    } catch {
      return jsonResponse(400, { error: "Invalid URL.", code: "invalid_url" });
    }

    if (!isAllowedGuardianArticleUrl(articleUrl)) {
      return jsonResponse(403, {
        error: "Only theguardian.com article URLs are allowed.",
        code: "url_not_allowed",
      });
    }

    articleUrl = normalizeGuardianArticleUrl(articleUrl);

    logGuardianReadRequest({
      host: articleUrl.hostname,
      pathPreview: articleUrl.pathname.slice(0, 120),
      env,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const res = await fetch(articleUrl.toString(), {
        redirect: "follow",
        signal: controller.signal,
        headers: GUARDIAN_FETCH_HEADERS,
      });

      const ct = res.headers.get("content-type");
      let html: string;
      try {
        html = await res.text();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logGuardianReadFailure({
          phase: "read_upstream_body",
          message: msg,
          stack: e instanceof Error ? e.stack : undefined,
        });
        return jsonResponse(422, {
          error: "Could not read the Guardian page response.",
          code: "upstream_body_read_failed",
        });
      }

      logGuardianReadUpstream({
        status: res.status,
        contentType: ct,
        ok: res.ok,
        bodyChars: html.length,
      });

      if (!res.ok) {
        const preview = html.replace(/\s+/g, " ").trim().slice(0, 240);
        logGuardianReadFailure({
          phase: "upstream_http_error",
          message: `HTTP ${res.status}`,
          bodyPreview: preview,
        });
        return jsonResponse(422, {
          error:
            res.status === 404
              ? "Page not found (404)."
              : `Could not load page (HTTP ${res.status}).`,
          code: "upstream_http_error",
          upstreamStatus: res.status,
        });
      }

      if (!ct?.includes("text/html") && !ct?.includes("application/xhtml")) {
        return jsonResponse(422, {
          error: "URL is not an HTML article.",
          code: "not_html",
        });
      }

      if (html.length > 2_500_000) {
        return jsonResponse(422, {
          error: "Page too large to process.",
          code: "html_too_large",
        });
      }

      let dom: JSDOM;
      try {
        dom = new JSDOM(html, { url: articleUrl.toString() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logGuardianReadFailure({
          phase: "jsdom_construct",
          message: msg,
          stack: e instanceof Error ? e.stack : undefined,
        });
        return jsonResponse(422, {
          error: "Could not parse the Guardian page structure.",
          code: "jsdom_failed",
        });
      }

      let parsed: ReturnType<Readability["parse"]>;
      try {
        const reader = new Readability(dom.window.document);
        parsed = reader.parse();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logGuardianReadFailure({
          phase: "readability",
          message: msg,
          stack: e instanceof Error ? e.stack : undefined,
        });
        return jsonResponse(422, {
          error: "Could not parse article structure.",
          code: "readability_failed",
        });
      }

      if (!parsed?.content) {
        return jsonResponse(422, {
          error:
            "Could not extract article body. Try opening the story on the Guardian site.",
          code: "no_article_content",
        });
      }

      const title =
        parsed.title?.trim() ||
        dom.window.document.querySelector("title")?.textContent?.trim() ||
        "Article";

      let absolutized: string;
      try {
        absolutized = absolutizeArticleHtml(
          parsed.content,
          articleUrl.toString(),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logGuardianReadFailure({
          phase: "absolutize",
          message: msg,
          stack: e instanceof Error ? e.stack : undefined,
        });
        absolutized = parsed.content;
      }

      const htmlSanitized = sanitizeGuardianArticleHtml(absolutized);

      if (!htmlSanitized.trim() || htmlSanitized.length < 40) {
        return jsonResponse(422, {
          error: "Extracted content was empty.",
          code: "sanitized_empty",
        });
      }

      const payload = {
        title,
        html: htmlSanitized,
        url: articleUrl.toString(),
        byline: parsed.byline?.trim() ?? null,
      };

      let bodyStr: string;
      try {
        bodyStr = JSON.stringify(payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logGuardianReadFailure({
          phase: "json_stringify",
          message: msg,
          stack: e instanceof Error ? e.stack : undefined,
        });
        return jsonResponse(422, {
          error: "Could not serialize article for the reader.",
          code: "stringify_failed",
        });
      }

      if (bodyStr.length > MAX_JSON_RESPONSE_CHARS) {
        logGuardianReadFailure({
          phase: "payload_size",
          message: `response chars ${bodyStr.length}`,
        });
        return jsonResponse(422, {
          error:
            "This article is too large to display in the in-app reader. Open it on the Guardian website instead.",
          code: "payload_too_large",
        });
      }

      return new NextResponse(bodyStr, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("abort") || msg === "AbortError") {
        logGuardianReadFailure({ phase: "timeout", message: msg });
        return jsonResponse(408, {
          error: "Request timed out.",
          code: "timeout",
        });
      }
      logGuardianReadFailure({
        phase: "fetch_or_process",
        message: msg,
        stack: e instanceof Error ? e.stack : undefined,
      });
      return jsonResponse(422, {
        error: "Could not load or parse this Guardian page.",
        code: "process_failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logGuardianReadFailure({
      phase: "fatal",
      message: msg,
      stack: e instanceof Error ? e.stack : undefined,
    });
    return jsonResponse(500, {
      error:
        "Server error while preparing the article. Try again or open the Guardian in a new tab.",
      code: "internal_error",
    });
  }
}
