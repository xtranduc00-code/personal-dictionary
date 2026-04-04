import { Readability } from "@mozilla/readability";
import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import {
  absolutizeArticleHtml,
  mergeReadabilityWithBbcMainFallback,
  supplementBbcArticleMedia,
} from "@/lib/bbc-article-media";
import {
  isAllowedBbcArticleUrl,
  normalizeBbcArticleUrl,
} from "@/lib/bbc-article-url";
import { polishBbcReaderHtml } from "@/lib/bbc-reader-html";
import { sanitizeBbcArticleHtml } from "@/lib/sanitize-html-app";

export const runtime = "nodejs";
export const maxDuration = 45;

const UA =
  "Mozilla/5.0 (compatible; KenWorkspace/1.0; private in-app article reader)";

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

    if (!isAllowedBbcArticleUrl(articleUrl)) {
      return NextResponse.json(
        { error: "Only BBC article URLs are allowed." },
        { status: 403 },
      );
    }

    articleUrl = normalizeBbcArticleUrl(articleUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const res = await fetch(articleUrl.toString(), {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });

      if (!res.ok) {
        const hint =
          res.status === 404
            ? "BBC returned 404 — check the article link (ID must match exactly, usually lowercase)."
            : `BBC returned HTTP ${res.status}.`;
        return NextResponse.json({ error: hint }, { status: 422 });
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
          {
            error:
              "Could not parse article structure. Try opening the story on BBC.",
          },
          { status: 422 },
        );
      }

      if (!parsed?.content) {
        const looks404 =
          /404|not found/i.test(
            dom.window.document.querySelector("title")?.textContent ?? "",
          );
        return NextResponse.json(
          {
            error: looks404
              ? "This page is not a valid BBC article (404 or wrong URL)."
              : "Could not extract article body. Open the original link on BBC instead.",
          },
          { status: 422 },
        );
      }

      const title =
        parsed.title?.trim() ||
        dom.window.document.querySelector("title")?.textContent?.trim() ||
        "Article";

      const articleHtml = mergeReadabilityWithBbcMainFallback(
        parsed.content,
        dom.window.document,
      );
      const merged = supplementBbcArticleMedia(
        articleHtml,
        dom.window.document,
        articleUrl.toString(),
      );
      const absolutized = absolutizeArticleHtml(merged, articleUrl.toString());
      const htmlSanitized = sanitizeBbcArticleHtml(absolutized);
      const htmlOut = polishBbcReaderHtml(htmlSanitized);

      if (!htmlOut.trim() || htmlOut.length < 40) {
        return NextResponse.json(
          { error: "Extracted content was empty." },
          { status: 422 },
        );
      }

      return NextResponse.json(
        {
          title,
          html: htmlOut,
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
        { error: "Could not load or parse this BBC page." },
        { status: 422 },
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.error("[bbc-read] unexpected", e);
    return NextResponse.json(
      {
        error:
          "Server error while preparing the article. Try again or open BBC in a new tab.",
      },
      { status: 500 },
    );
  }
}
