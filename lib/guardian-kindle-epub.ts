import JSZip from "jszip";
import type { GuardianListItem } from "@/lib/guardian-content-types";
import { htmlFragmentToArticleParagraphs } from "@/lib/guardian-engoo-tutor-payload";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Kindle / Calibre–safe (see bbc_digest.py): no :root, var(), or min().
 * Merges digest-style typography with explicit reader rules (body line-height, p margins, headings, blockquote, img).
 */
const GUARDIAN_EPUB_KINDLE_CSS = `
html { background: #faf7f1; }
body {
  font-family: Georgia, "Palatino Linotype", Palatino, "Book Antiqua", serif;
  font-size: 1.125rem;
  text-align: left;
  line-height: 1.35;
  max-width: 38em;
  margin: 0 auto;
  padding: 1.25rem 1rem 2.5rem;
  background: #faf7f1;
  color: #262626;
  hyphens: auto;
  -webkit-hyphens: auto;
  overflow-wrap: break-word;
  text-rendering: optimizeLegibility;
}
p {
  margin-top: 0;
  margin-bottom: 0.6em;
}
h1, h2, h3 {
  text-align: left;
  line-height: 1.28;
  font-weight: normal;
  page-break-after: avoid;
  page-break-inside: avoid;
}
h1 { font-size: 1.5rem; margin: 0 0 0.75em; }
h2 { font-size: 1.22rem; margin: 1.25em 0 0.5em; }
h3 { font-size: 1.08rem; margin: 1em 0 0.45em; }
blockquote {
  margin-left: 1.2em;
  margin-right: 1.2em;
}
img {
  display: block;
  margin-left: auto;
  margin-right: auto;
  max-width: 100%;
  height: auto;
}
figure { margin: 1rem 0; }
figcaption { font-size: 0.92rem; margin-top: 0.35em; color: #63615c; }
.meta { color: #63615c; font-size: 0.92rem; line-height: 1.5; }
ol.toc-list { padding-left: 1.4rem; margin: 0.5em 0 1em; }
ol.toc-list li { margin-bottom: 0.45rem; }
`.trim();

const GUARDIAN_EPUB_IMAGE_API = "/api/guardian-epub-image";

/** Max articles packed into one Kindle EPUB (each item = full HTML fetch + chapter). */
export const GUARDIAN_KINDLE_EPUB_MAX_ARTICLES = 15;

/**
 * Strip obvious script/style blobs before DOM parse (parser quirks + escaped markup).
 * Kindle chokes on large inline CSS/JS and interactive cruft.
 */
function scrubHtmlStringForKindleEpub(html: string): string {
  return (
    html
      // Block-level executable / styling noise (body already sanitized server-side; this is defense in depth)
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<template\b[\s\S]*?<\/template>/gi, "")
      // Module / worker hints sometimes appear in article HTML
      .replace(/<link\b[^>]*>/gi, "")
  );
}

/** Tags to drop entirely (no <picture>/<source> here — handled below before img inlining). */
const KINDLE_EPUB_REMOVE_TAGS = [
  "script",
  "noscript",
  "style",
  "link",
  "template",
  "object",
  "embed",
  "audio",
  "canvas",
  "svg",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "label",
  "meta",
  "base",
  "iframe",
  "video",
].join(", ");

function removeKindleForbiddenTags(root: HTMLElement): void {
  root.querySelectorAll(KINDLE_EPUB_REMOVE_TAGS).forEach((el) => el.remove());
}

/** Strip attributes that bloat XHTML or trip e-readers (inline JS hooks, huge data-*, Guardian layout classes). */
function stripKindleUnsafeAttributes(root: HTMLElement): void {
  for (const el of root.querySelectorAll("*")) {
    const attrs = Array.from(el.attributes);
    for (const { name, value } of attrs) {
      const n = name.toLowerCase();
      if (n.startsWith("on")) {
        el.removeAttribute(name);
        continue;
      }
      if (n.startsWith("data-")) {
        el.removeAttribute(name);
        continue;
      }
      if (n === "style") {
        el.removeAttribute(name);
        continue;
      }
      if (n === "class" || n === "id") {
        el.removeAttribute(name);
        continue;
      }
      if (n === "href" && /^\s*javascript:/i.test(value)) {
        el.removeAttribute(name);
        continue;
      }
      if ((n === "src" || n === "href") && /\.js(\?|#|$)/i.test(value)) {
        el.removeAttribute(name);
        continue;
      }
      if (n === "type" && /\b(importmap|module)\b/i.test(value)) {
        el.removeAttribute(name);
      }
    }
  }
}

function plainParagraphsToXhtmlFragment(paragraphs: string[]): string {
  const bodyPs = paragraphs
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${escapeXml(p)}</p>`)
    .join("\n    ");
  return bodyPs || `<p>${escapeXml("(No content for this article.)")}</p>`;
}

function extFromContentType(ct: string): string {
  const m = ct.split(";")[0].trim().toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/gif") return "gif";
  if (m === "image/webp") return "webp";
  if (m === "image/svg+xml") return "svg";
  if (m === "image/avif") return "avif";
  return "jpg";
}

function manifestMediaTypeForExt(ext: string): string {
  switch (ext) {
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    default:
      return "image/jpeg";
  }
}

export type GuardianEpubArticle = {
  title: string;
  paragraphs: string[];
  /** Sanitized reader HTML from `/api/guardian-read` (includes figures/images). */
  bodyHtml: string;
  sourceUrl: string;
};

/** Fetch full reader HTML for each list row (bounded concurrency). */
export async function fetchGuardianArticlesForKindleEpub(
  items: GuardianListItem[],
  concurrency = 3,
  maxArticles: number = GUARDIAN_KINDLE_EPUB_MAX_ARTICLES,
): Promise<GuardianEpubArticle[]> {
  const capped = items.slice(0, Math.max(0, maxArticles));
  const mapOne = async (item: GuardianListItem): Promise<GuardianEpubArticle> => {
    try {
      const res = await fetch(
        `/api/guardian-read?url=${encodeURIComponent(item.webUrl)}`,
      );
      const raw = await res.text();
      const ct = res.headers.get("content-type") ?? "";
      let data: {
        error?: string;
        title?: string;
        html?: string;
        url?: string;
      };
      const trimmed = raw.trimStart();
      const ctLooksJson = ct.includes("application/json");
      if (ctLooksJson || trimmed.startsWith("{")) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          const fallback = [item.trailText].filter(Boolean) as string[];
          return {
            title: item.webTitle,
            paragraphs: fallback.length ? fallback : ["(Could not load full text.)"],
            bodyHtml: "",
            sourceUrl: item.webUrl,
          };
        }
      } else {
        const fallback = [item.trailText].filter(Boolean) as string[];
        return {
          title: item.webTitle,
          paragraphs: fallback.length ? fallback : ["(Could not load full text.)"],
          bodyHtml: "",
          sourceUrl: item.webUrl,
        };
      }
      if (!res.ok) {
        const fallback = [item.trailText].filter(Boolean) as string[];
        return {
          title: item.webTitle,
          paragraphs: fallback.length ? fallback : ["(Could not load full text.)"],
          bodyHtml: "",
          sourceUrl: item.webUrl,
        };
      }
      const html = data.html ?? "";
      const paras = htmlFragmentToArticleParagraphs(html);
      const fallback = [item.trailText].filter(Boolean) as string[];
      return {
        title: (data.title || item.webTitle).trim() || item.webTitle,
        paragraphs:
          paras.length > 0
            ? paras
            : fallback.length
              ? fallback
              : ["(No body text.)"],
        bodyHtml: html,
        sourceUrl: data.url || item.webUrl,
      };
    } catch {
      const fallback = [item.trailText].filter(Boolean) as string[];
      return {
        title: item.webTitle,
        paragraphs: fallback.length ? fallback : ["(Could not load full text.)"],
        bodyHtml: "",
        sourceUrl: item.webUrl,
      };
    }
  };

  const out: GuardianEpubArticle[] = [];
  for (let i = 0; i < capped.length; i += concurrency) {
    const chunk = capped.slice(i, i + concurrency);
    const part = await Promise.all(chunk.map(mapOne));
    out.push(...part);
  }
  return out;
}

/**
 * Rewrite &lt;img&gt; to local EPUB paths; fetch bytes via same-origin proxy.
 * Returns an XHTML body fragment (no wrapper element).
 */
async function buildChapterBodyXhtml(
  bodyHtml: string,
  articleBaseUrl: string,
  chapterIndex: number,
  oebps: JSZip,
  manifestImageLines: string[],
  plainParagraphs: string[],
): Promise<string> {
  const trimmed = scrubHtmlStringForKindleEpub(bodyHtml.trim());
  if (!trimmed || typeof document === "undefined") {
    return plainParagraphsToXhtmlFragment(plainParagraphs);
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = trimmed;

  removeKindleForbiddenTags(wrap);
  stripKindleUnsafeAttributes(wrap);

  wrap.querySelectorAll("iframe, video").forEach((el) => el.remove());

  // Strip all hyperlinks but keep visible text — Kindle chokes on large link maps
  wrap.querySelectorAll("a").forEach((a) => {
    const frag = document.createDocumentFragment();
    while (a.firstChild) frag.appendChild(a.firstChild);
    a.replaceWith(frag);
  });

  wrap.querySelectorAll("picture").forEach((pic) => {
    const im = pic.querySelector("img");
    if (im?.getAttribute("src")?.trim()) {
      pic.replaceWith(im.cloneNode(true));
      return;
    }
    const srcEl = pic.querySelector("source[srcset]");
    const ss = srcEl?.getAttribute("srcset");
    if (ss) {
      const first = ss.split(",")[0]?.trim().split(/\s+/)[0];
      if (first?.startsWith("http")) {
        const ni = document.createElement("img");
        ni.setAttribute("src", first);
        const alt = pic.querySelector("img")?.getAttribute("alt");
        if (alt) ni.setAttribute("alt", alt);
        pic.replaceWith(ni);
        return;
      }
    }
    pic.remove();
  });

  removeKindleForbiddenTags(wrap);
  stripKindleUnsafeAttributes(wrap);

  const chapterPad = String(chapterIndex + 1).padStart(3, "0");
  const imgs = Array.from(wrap.querySelectorAll("img"));
  let imgSeq = 0;

  for (const img of imgs) {
    const srcRaw = img.getAttribute("src")?.trim();
    if (!srcRaw) {
      img.remove();
      continue;
    }
    let abs: string;
    try {
      abs = new URL(srcRaw, articleBaseUrl).href;
    } catch {
      img.remove();
      continue;
    }

    try {
      const proxied = `${GUARDIAN_EPUB_IMAGE_API}?url=${encodeURIComponent(abs)}`;
      const res = await fetch(proxied);
      if (!res.ok) {
        img.remove();
        continue;
      }
      const ct = res.headers.get("content-type") ?? "image/jpeg";
      const ext = extFromContentType(ct);
      const mime = manifestMediaTypeForExt(ext);
      const imgPad = String(imgSeq).padStart(2, "0");
      const relPath = `images/c${chapterPad}-${imgPad}.${ext}`;
      const buf = await res.arrayBuffer();
      oebps.file(relPath, buf);
      const mfId = `img-c${chapterPad}-${imgPad}`;
      manifestImageLines.push(
        `    <item id="${mfId}" href="${relPath}" media-type="${mime}"/>`,
      );
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.setAttribute("src", relPath);
      imgSeq += 1;
    } catch {
      img.remove();
    }
  }

  const ser = new XMLSerializer();
  const parts: string[] = [];
  for (const node of Array.from(wrap.childNodes)) {
    try {
      parts.push(ser.serializeToString(node));
    } catch {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent?.trim();
        if (t) parts.push(escapeXml(t));
      }
    }
  }
  const serialized = parts.join("");
  if (serialized.trim()) return serialized;

  return plainParagraphsToXhtmlFragment(plainParagraphs);
}

/**
 * EPUB 3 zip: chapters include embedded images; no “Original article” link.
 */
export async function buildGuardianListEpubBlob(
  articles: GuardianEpubArticle[],
  bookTitle: string,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.folder("META-INF")!.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const oebps = zip.folder("OEBPS")!;
  oebps.file("styles.css", GUARDIAN_EPUB_KINDLE_CSS);

  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const manifestItems: string[] = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="css-main" href="styles.css" media-type="text/css"/>`,
    `    <item id="contents" href="contents.xhtml" media-type="application/xhtml+xml"/>`,
  ];
  const spineRefs: string[] = [
    `    <itemref idref="nav" linear="no"/>`,
    `    <itemref idref="contents"/>`,
  ];
  const tocEntries: string[] = [];

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i]!;
    const num = String(i + 1).padStart(3, "0");
    const fname = `chapter-${num}.xhtml`;
    const id = `ch${num}`;
    manifestItems.push(
      `    <item id="${id}" href="${fname}" media-type="application/xhtml+xml"/>`,
    );
    spineRefs.push(`    <itemref idref="${id}"/>`);
    const safeTitle = escapeXml(art.title);
    tocEntries.push(`      <li><a href="${fname}">${safeTitle}</a></li>`);

    const imageManifestChunk: string[] = [];
    const bodyInner = await buildChapterBodyXhtml(
      art.bodyHtml,
      art.sourceUrl,
      i,
      oebps,
      imageManifestChunk,
      art.paragraphs,
    );
    manifestItems.push(...imageManifestChunk);

    oebps.file(
      fname,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <title>${safeTitle}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${bodyInner}
</body>
</html>`,
    );
  }

  const safeBookTitle = escapeXml(bookTitle);
  const tocOl =
    tocEntries.length > 0
      ? tocEntries.join("\n")
      : `      <li>${escapeXml("(No articles.)")}</li>`;

  oebps.file(
    "contents.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>${safeBookTitle}</h1>
  <p class="meta">Total articles: ${articles.length}</p>
  <h2>Table of Contents</h2>
  <ol class="toc-list">
${tocOl}
  </ol>
</body>
</html>`,
  );

  oebps.file(
    "nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <title>Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol class="toc-list">
${tocEntries.join("\n")}
    </ol>
  </nav>
</body>
</html>`,
  );

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(bookTitle)}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="pub-id">urn:uuid:${uuid}</dc:identifier>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifestItems.join("\n")}
  </manifest>
  <spine>
${spineRefs.join("\n")}
  </spine>
</package>`;

  oebps.file("content.opf", opf);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
}

export function triggerEpubDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
