import { JSDOM } from "jsdom";

/** Primary article column — excludes promos, “Elsewhere”, nav, etc. */
function getBbcArticleRoot(doc: globalThis.Document): Element | null {
  return (
    doc.querySelector("main#main-content") ??
    doc.querySelector('main[data-testid="main-content"]') ??
    doc.querySelector("main[role='main']") ??
    doc.querySelector("main") ??
    null
  );
}

/** Stable id inside BBC /live/{uuid}/ image paths */
function ichefLiveId(url: string): string | null {
  const m = url.match(/\/live\/([a-f0-9-]{8,})/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * BBC keeps “More on this story”, club hubs, Ask me anything, etc. inside the same
 * <main> as the article. Skip every node after the first such heading.
 */
function findRelatedRailHeading(root: Element): Element | null {
  for (const h of root.querySelectorAll("h2, h3")) {
    const t = (h.textContent ?? "").replace(/\s+/g, " ").trim();
    if (
      /\b(more on this story|elsewhere on the bbc|elsewhere in sport|related topics|top stories|follow your club)\b/i.test(
        t,
      )
    ) {
      return h;
    }
  }
  return null;
}

/** DOM bitmask: other node follows reference in document order (Node.DOCUMENT_POSITION_FOLLOWING). */
const DOCUMENT_POSITION_FOLLOWING = 4;

function isBeforeRelatedRail(img: Element, boundary: Element | null): boolean {
  if (img.closest("aside")) return false;
  if (!boundary) return true;
  const pos = boundary.compareDocumentPosition(img);
  return (pos & DOCUMENT_POSITION_FOLLOWING) !== DOCUMENT_POSITION_FOLLOWING;
}

export function extractOgImage(doc: globalThis.Document): string | null {
  const og = doc
    .querySelector('meta[property="og:image"]')
    ?.getAttribute("content")
    ?.trim();
  if (og?.startsWith("https://")) return og;
  const tw = doc
    .querySelector('meta[name="twitter:image"], meta[name="twitter:image:src"]')
    ?.getAttribute("content")
    ?.trim();
  if (tw?.startsWith("https://")) return tw;
  return null;
}

/**
 * ichef images inside the article main column only (reading order).
 * Skips site-wide promos / “Ask me anything” / Doctor Foster tiles, etc.
 */
function collectIchefImagesInArticleMain(
  doc: globalThis.Document,
  baseHref: string,
  max: number,
): string[] {
  const root = getBbcArticleRoot(doc);
  if (!root) return [];
  const boundary = findRelatedRailHeading(root);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const img of root.querySelectorAll('img[src*="ichef.bbci.co.uk"]')) {
    if (!isBeforeRelatedRail(img, boundary)) continue;
    const src = img.getAttribute("src")?.trim();
    if (!src) continue;
    let abs: string;
    try {
      abs = new URL(src, baseHref).href;
    } catch {
      continue;
    }
    const key = ichefLiveId(abs) ?? abs;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(abs);
    if (out.length >= max) break;
  }
  return out;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * If Readability HTML has no images, prepend hero + inline figures from the raw page.
 */
/** BBC video embeds (when present in static HTML). */
export function extractBbcEmbedIframes(
  doc: globalThis.Document,
  baseHref: string,
  max = 2,
): string[] {
  const root = getBbcArticleRoot(doc);
  if (!root) return [];
  const boundary = findRelatedRailHeading(root);
  const out: string[] = [];
  for (const frame of root.querySelectorAll("iframe[src]")) {
    if (!isBeforeRelatedRail(frame, boundary)) continue;
    const src = frame.getAttribute("src")?.trim();
    if (!src) continue;
    let abs: string;
    try {
      abs = new URL(src, baseHref).href;
    } catch {
      continue;
    }
    if (
      !/^https:\/\/(www\.)?bbc\.co\.uk\/embed\//i.test(abs) &&
      !/^https:\/\/(www\.)?bbc\.com\/embed\//i.test(abs)
    ) {
      continue;
    }
    out.push(
      `<figure class="bbc-media-embed"><iframe src="${escapeAttr(abs)}" title="BBC video" width="560" height="315" frameborder="0" allowfullscreen loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe></figure>`,
    );
    if (out.length >= max) break;
  }
  return out;
}

/** Strip tags → rough character count (Readability vs fallback comparison). */
export function approximateArticleTextLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

const READABILITY_FALLBACK_MIN = 650;

/**
 * When Mozilla Readability only keeps a short promo block (common on BBC Sport
 * video / match pages), clone the article main column and strip chrome + related
 * rails so the reader gets full body copy.
 */
export function extractBbcMainColumnFallbackHtml(
  doc: globalThis.Document,
): string | null {
  const root = getBbcArticleRoot(doc);
  if (!root) return null;
  const clone = root.cloneNode(true) as Element;
  clone
    .querySelectorAll("script,style,noscript,template")
    .forEach((e) => e.remove());
  clone.querySelectorAll("aside").forEach((e) => e.remove());
  clone
    .querySelectorAll('nav,[role="navigation"]')
    .forEach((e) => e.remove());

  const boundary = findRelatedRailHeading(clone);
  if (boundary?.parentNode) {
    let cur: ChildNode | null = boundary;
    const parent = boundary.parentNode;
    while (cur !== null) {
      const nxt: ChildNode | null = cur.nextSibling;
      parent.removeChild(cur);
      cur = nxt;
    }
  }

  const html = clone.innerHTML.trim();
  if (html.length < 200) return null;
  return html;
}

/** Prefer fallback HTML when it clearly has more article text than Readability. */
export function mergeReadabilityWithBbcMainFallback(
  readabilityHtml: string,
  doc: globalThis.Document,
): string {
  const readLen = approximateArticleTextLength(readabilityHtml);
  const fallback = extractBbcMainColumnFallbackHtml(doc);
  if (!fallback) return readabilityHtml;
  const fbLen = approximateArticleTextLength(fallback);
  if (readLen < READABILITY_FALLBACK_MIN && fbLen >= READABILITY_FALLBACK_MIN) {
    return fallback;
  }
  /* Readability often keeps only a video blurb; main column has the match report. */
  if (readLen < 1200 && fbLen > readLen + 500) {
    return fallback;
  }
  return readabilityHtml;
}

export function supplementBbcArticleMedia(
  articleHtml: string,
  doc: globalThis.Document,
  baseHref: string,
): string {
  let h = supplementBbcArticleImages(articleHtml, doc, baseHref);
  if (!/<iframe[\s>]/i.test(h)) {
    const embeds = extractBbcEmbedIframes(doc, baseHref);
    if (embeds.length) h = embeds.join("") + h;
  }
  return h;
}

export function supplementBbcArticleImages(
  articleHtml: string,
  doc: globalThis.Document,
  baseHref: string,
): string {
  if (/<img[\s>]/i.test(articleHtml)) return articleHtml;

  const og = extractOgImage(doc);
  const fromMain = collectIchefImagesInArticleMain(doc, baseHref, 12);
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (u: string) => {
    const k = ichefLiveId(u) ?? u;
    if (seen.has(k)) return;
    seen.add(k);
    ordered.push(u);
  };

  /** Hero / share image first (matches off-site preview), then in-article images in order. */
  if (og) push(og);
  for (const u of fromMain) push(u);

  if (ordered.length === 0) return articleHtml;

  const figures = ordered
    .slice(0, 10)
    .map(
      (src) =>
        `<figure class="bbc-inline-image"><img src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></figure>`,
    )
    .join("");

  return `${figures}${articleHtml}`;
}

/** Resolve relative URLs in extracted fragment (BBC sometimes uses // or relative src). */
export function absolutizeArticleHtml(html: string, baseHref: string): string {
  try {
    const dom = new JSDOM(`<div id="__root">${html}</div>`, {
      url: baseHref,
      contentType: "text/html",
    });
    const root = dom.window.document.getElementById("__root");
    if (!root) return html;
    for (const el of root.querySelectorAll("[src]")) {
      const s = el.getAttribute("src");
      if (!s || /^https?:\/\//i.test(s) || s.startsWith("data:")) continue;
      try {
        el.setAttribute("src", new URL(s, baseHref).href);
      } catch {
        /* ignore */
      }
    }
    for (const el of root.querySelectorAll("a[href]")) {
      const h = el.getAttribute("href");
      if (!h || h.startsWith("#") || /^https?:\/\//i.test(h)) continue;
      try {
        el.setAttribute("href", new URL(h, baseHref).href);
      } catch {
        /* ignore */
      }
    }
    return root.innerHTML;
  } catch {
    return html;
  }
}
