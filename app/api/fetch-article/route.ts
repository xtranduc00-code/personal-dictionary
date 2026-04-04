import { Readability } from "@mozilla/readability";
import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().url().max(2048),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    const json: unknown = await req.json();
    const r = bodySchema.safeParse(json);
    if (!r.success) {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
    }
    parsed = r.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { url } = parsed;

  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) {
      return NextResponse.json({ error: "Only http(s) URLs are allowed." }, {
        status: 400,
      });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KenWorkspace/1.0; educational article extraction)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Could not load the page (HTTP ${res.status}). Try copying the article text and pasting it below.`,
        },
        { status: 422 },
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("xml")) {
      return NextResponse.json(
        {
          error:
            "That URL does not look like a web article. Try pasting the text manually.",
        },
        { status: 422 },
      );
    }

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    const text =
      article?.textContent?.trim() ??
      (typeof article?.content === "string"
        ? new JSDOM(article.content).window.document.body.textContent?.trim() ??
          ""
        : "");

    if (!text || text.length < 80) {
      return NextResponse.json(
        {
          error:
            "Could not extract readable article text. The site may block bots or use a special layout — paste the article text manually.",
        },
        { status: 422 },
      );
    }

    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const title =
      article?.title?.trim() ||
      dom.window.document.querySelector("title")?.textContent?.trim() ||
      hostname;

    return NextResponse.json({
      title,
      content: text,
      source: hostname,
      url,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg === "AbortError") {
      return NextResponse.json(
        {
          error:
            "The request timed out. Try again, or paste the article text manually.",
        },
        { status: 408 },
      );
    }
    return NextResponse.json(
      {
        error:
          "Could not fetch or parse the page. Many sites block automated access — paste the article text manually.",
      },
      { status: 422 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
