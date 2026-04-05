import { Readability } from "@mozilla/readability";
import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { absolutizeArticleHtml } from "@/lib/bbc-article-media";
import {
  isAllowedGuardianArticleUrl,
  normalizeGuardianArticleUrl,
} from "@/lib/guardian-article-url";
import { sanitizeGuardianArticleHtml } from "@/lib/sanitize-html-app";

export const runtime = "nodejs";
export const maxDuration = 45;
/** Avoid WAF / bot blocks on cloud IPs (custom “compatible; …” UAs often get 403 or empty bodies). */
export const dynamic = "force-dynamic";

const GUARDIAN_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  Referer: "https://www.theguardian.com/",
  "Cache-Control": "no-cache",
};

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
    if (!raw) {
      return NextResponse.json({ error: "Missing url parameter." }, {
        status: 400,
      });
    }

    let articleUrl: URL;
    try {
      articleUrl = new URL(raw);
    } catch {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
    }

    if (!isAllowedGuardianArticleUrl(articleUrl)) {
      return NextResponse.json(
        { error: "Only theguardian.com article URLs are allowed." },
        { status: 403 },
      );
    }

    articleUrl = normalizeGuardianArticleUrl(articleUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const res = await fetch(articleUrl.toString(), {
        redirect: "follow",
        signal: controller.signal,
        headers: GUARDIAN_FETCH_HEADERS,
      });

      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              res.status === 404
                ? "Page not found (404)."
                : `Could not load page (HTTP ${res.status}).`,
          },
          { status: 422 },
        );
      }

      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        return NextResponse.json(
          { error: "URL is not an HTML article." },
          { status: 422 },
        );
      }

      const html = await res.text();
      if (html.length > 2_500_000) {
        return NextResponse.json(
          { error: "Page too large to process." },
          { status: 422 },
        );
      }

      const dom = new JSDOM(html, { url: articleUrl.toString() });
      let parsed: ReturnType<Readability["parse"]>;
      try {
        const reader = new Readability(dom.window.document);
        parsed = reader.parse();
      } catch {
        return NextResponse.json(
          { error: "Could not parse article structure." },
          { status: 422 },
        );
      }

      if (!parsed?.content) {
        return NextResponse.json(
          {
            error:
              "Could not extract article body. Try opening the story on the Guardian site.",
          },
          { status: 422 },
        );
      }

      const title =
        parsed.title?.trim() ||
        dom.window.document.querySelector("title")?.textContent?.trim() ||
        "Article";

      const absolutized = absolutizeArticleHtml(
        parsed.content,
        articleUrl.toString(),
      );
      const htmlSanitized = sanitizeGuardianArticleHtml(absolutized);

      if (!htmlSanitized.trim() || htmlSanitized.length < 40) {
        return NextResponse.json(
          { error: "Extracted content was empty." },
          { status: 422 },
        );
      }

      return NextResponse.json(
        {
          title,
          html: htmlSanitized,
          url: articleUrl.toString(),
          byline: parsed.byline?.trim() ?? null,
        },
        {
          headers: {
            "Cache-Control":
              "private, max-age=300, stale-while-revalidate=600",
          },
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("abort") || msg === "AbortError") {
        return NextResponse.json({ error: "Request timed out." }, {
          status: 408,
        });
      }
      return NextResponse.json(
        { error: "Could not load or parse this Guardian page." },
        { status: 422 },
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.error("[guardian-read] unexpected", e);
    return NextResponse.json(
      {
        error:
          "Server error while preparing the article. Try again or open the Guardian in a new tab.",
      },
      { status: 500 },
    );
  }
}
