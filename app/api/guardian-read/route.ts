import { Readability } from "@mozilla/readability";
import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { absolutizeArticleHtml } from "@/lib/bbc-article-media";
import {
  isAllowedGuardianArticleUrl,
  normalizeGuardianArticleUrl,
} from "@/lib/guardian-article-url";
import {
  guardianReadFetchTimeoutMs,
  guardianReadTotalBudgetMs,
} from "@/lib/guardian-read-budget";
import { stripHeavyHtmlNoiseForParse } from "@/lib/guardian-read-preparse";
import {
  guardianReadEnvSnapshot,
  logGuardianReadFailure,
  logGuardianReadRequest,
  logGuardianReadTiming,
  logGuardianReadUpstream,
} from "@/lib/guardian-read-server-log";
import { sanitizeGuardianArticleHtml } from "@/lib/sanitize-html-app";

export const runtime = "nodejs";
/** Pro / paid tiers; hobby may cap lower — see `guardian-read-budget` defaults. */
export const maxDuration = 60;
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

class GuardianReadBudgetError extends Error {
  constructor(readonly phase: string) {
    super(`guardian_read_budget:${phase}`);
    this.name = "GuardianReadBudgetError";
  }
}

async function withBudget<T>(promise: Promise<T>, ms: number, phase: string) {
  if (ms < 500) {
    throw new GuardianReadBudgetError(phase);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GuardianReadBudgetError(phase)), ms);
  });
  try {
    return await Promise.race([promise, timeoutP]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchGuardianPage(url: string): Promise<{
  res: Response;
  html: string;
}> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: GUARDIAN_FETCH_HEADERS,
  });
  const html = await res.text();
  return { res, html };
}

export async function GET(req: NextRequest) {
  const env = guardianReadEnvSnapshot();
  const requestStarted = Date.now();

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

    const budgetMs = guardianReadTotalBudgetMs();
    const fetchCapMs = guardianReadFetchTimeoutMs(budgetMs);
    /** Leave headroom for JSDOM + Readability after HTML is in memory. */
    const PARSE_RESERVE_MS = 3200;
    const networkBudgetMs = Math.max(2500, budgetMs - PARSE_RESERVE_MS);
    const t0 = Date.now();

    try {
      let res: Response;
      let html: string;
      try {
        const net = await withBudget(
          fetchGuardianPage(articleUrl.toString()),
          Math.min(fetchCapMs, networkBudgetMs),
          "network",
        );
        res = net.res;
        html = net.html;
      } catch (e) {
        if (e instanceof GuardianReadBudgetError) {
          logGuardianReadFailure({
            phase: "network_budget",
            message: `${e.phase} exceeded ${Math.min(fetchCapMs, networkBudgetMs)}ms`,
          });
          return jsonResponse(408, {
            error:
              "Loading the Guardian page took too long for this hosting plan. Try again, open the article on the Guardian site, or raise GUARDIAN_READ_TOTAL_MS / function timeout.",
            code: "timeout",
          });
        }
        const msg = e instanceof Error ? e.message : String(e);
        logGuardianReadFailure({
          phase: "fetch_guardian",
          message: msg,
          stack: e instanceof Error ? e.stack : undefined,
        });
        return jsonResponse(422, {
          error: "Could not reach the Guardian page.",
          code: "upstream_fetch_failed",
        });
      }

      const fetchAndBodyMs = Date.now() - t0;
      const ct = res.headers.get("content-type");

      logGuardianReadUpstream({
        status: res.status,
        contentType: ct,
        ok: res.ok,
        bodyChars: html.length,
      });

      if (!res.ok) {
        const preview = html.replace(/\s+/g, " ").trim().slice(0, 300);
        logGuardianReadFailure({
          phase: "upstream_http_error",
          message: `HTTP ${res.status}`,
          bodyPreview: preview,
          contentType: ct,
          elapsedMs: Date.now() - t0,
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

      const parseBudgetMs = budgetMs - (Date.now() - t0) - 200;
      if (parseBudgetMs < 400) {
        logGuardianReadFailure({
          phase: "budget_before_parse",
          message: `elapsed ${Date.now() - t0}ms budget ${budgetMs}ms`,
        });
        return jsonResponse(408, {
          error:
            "Not enough time left to extract the article on this server. Try again or increase GUARDIAN_READ_TOTAL_MS / hosting function timeout.",
          code: "timeout",
        });
      }

      const htmlForDom = stripHeavyHtmlNoiseForParse(html);
      const tParse = Date.now();

      let dom: JSDOM;
      try {
        dom = new JSDOM(htmlForDom, { url: articleUrl.toString() });
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

      if (Date.now() - t0 > budgetMs) {
        logGuardianReadFailure({
          phase: "wallclock_after_jsdom",
          message: `elapsed ${Date.now() - t0}ms > budget ${budgetMs}ms`,
        });
        return jsonResponse(408, {
          error:
            "Extracting the article took too long on this host. Try again or increase GUARDIAN_READ_TOTAL_MS / function timeout.",
          code: "timeout",
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

      const parseMs = Date.now() - tParse;

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

      logGuardianReadTiming({
        totalMs: Date.now() - t0,
        fetchMs: fetchAndBodyMs,
        parseMs,
        budgetMs,
        fetchTimeoutMs: fetchCapMs,
        htmlInChars: html.length,
        htmlStrippedChars: htmlForDom.length,
      });

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
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logGuardianReadFailure({
      phase: "fatal",
      message: msg,
      stack: e instanceof Error ? e.stack : undefined,
      elapsedMs: Date.now() - requestStarted,
    });
    return jsonResponse(500, {
      error:
        "Server error while preparing the article. Try again or open the Guardian in a new tab.",
      code: "internal_error",
    });
  }
}
