import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";

/** Align with chat renderer so `\(…\)` becomes KaTeX. */
export function normalizeLatexDelimitersForExport(src: string): string {
    return src
        .replace(/\\\[/g, "\n$$\n")
        .replace(/\\\]/g, "\n$$\n")
        .replace(/\\\(/g, "$")
        .replace(/\\\)/g, "$");
}

export async function markdownToStudyKitHtmlFragment(markdown: string): Promise<string> {
    const normalized = normalizeLatexDelimitersForExport(markdown);
    const file = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkRehype, { allowDangerousHtml: false })
        .use(rehypeKatex, { strict: false, throwOnError: false, errorColor: "#cc0000" })
        .use(rehypeStringify)
        .process(normalized);
    return String(file);
}

function decodeHtmlEntities(s: string): string {
    return s
        .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number.parseInt(n, 10)))
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function escapeHtmlTextContent(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

const PRE_CODE_MERMAID =
    /<pre>\s*<code[^>]*class="[^"]*language-mermaid[^"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
const PRE_CODE_TREE =
    /<pre>\s*<code[^>]*class="[^"]*language-tree[^"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
const PRE_CODE_MINDMAP_JSON =
    /<pre>\s*<code[^>]*class="[^"]*language-mindmap-json[^"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;

/**
 * Turn fenced `mermaid` / `tree` code blocks into export-friendly markup (Mermaid runs in the browser when the file is opened).
 */
export function postprocessStudyKitExportBodyHtml(html: string): { html: string; hasMermaid: boolean } {
    let hasMermaid = false;
    let out = html.replace(PRE_CODE_MERMAID, (_, inner: string) => {
        hasMermaid = true;
        const chart = decodeHtmlEntities(inner).trim();
        return `<div class="mermaid-wrap">${chart ? `<div class="mermaid">${escapeHtmlTextContent(chart)}</div>` : ""}</div>`;
    });
    out = out.replace(PRE_CODE_MINDMAP_JSON, () => {
        return `<figure class="export-mm-placeholder"><p class="export-mm-placeholder-p">Mind map: open this sheet in the app to view the interactive diagram. Raw map data is not included in the HTML export.</p></figure>`;
    });
    out = out.replace(PRE_CODE_TREE, () => {
        return "";
    });
    return { html: out, hasMermaid };
}

const MERMAID_ESM = "https://cdn.jsdelivr.net/npm/mermaid@11.13.0/dist/mermaid.esm.min.mjs";

const MERMAID_BOOTSTRAP = `
<script type="module">
import mermaid from "${MERMAID_ESM}";
mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
});
await mermaid.run({ querySelector: ".mermaid" });
</script>
`.trim();

const KATEX_CDN = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";

/** Light, print-friendly styles approximating `exam-notes-markdown` / study sheet UI. */
export const STUDY_KIT_EXPORT_STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  color: #334155;
  background: #f6f7f9;
}
.wrap {
  max-width: 52rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
}
.sheet {
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 1px 0 rgba(0,0,0,0.03);
  padding: 1.25rem 1.25rem 2rem;
}
@media (min-width: 640px) {
  .sheet { padding: 1.5rem 1.75rem 2.25rem; }
}
.sheet h1 {
  margin: 0 0 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
}
.sheet h2 {
  margin: 2.5rem 0 0;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid #94a3b8;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #0f172a;
}
.sheet h2:first-of-type { margin-top: 0.5rem; }
.sheet h3 {
  margin: 1.25rem 0 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}
.sheet p { margin: 0.4rem 0; color: #64748b; font-size: 14px; line-height: 1.6; }
.sheet ul, .sheet ol {
  margin: 0.4rem 0;
  padding-left: 1.25rem;
  color: #64748b;
  font-size: 14px;
}
.sheet ul {
  list-style: disc;
  list-style-position: outside;
  padding-left: 1.25rem;
}
.sheet ol {
  list-style-position: outside;
  padding-left: 1.35rem;
}
.sheet ol > li {
  padding-left: 0.28rem;
}
.sheet li {
  margin: 0.15rem 0;
  line-height: 1.6;
}
.sheet ul > li::marker {
  color: #64748b;
  font-size: 1em;
}
.sheet ol > li::marker {
  color: #64748b;
  font-weight: 600;
}
.sheet u,
.sheet ins {
  text-decoration-thickness: 1px;
  text-underline-offset: 0.1em;
  text-decoration-skip-ink: none;
}
.sheet strong { font-weight: 600; color: #0f172a; }
.sheet blockquote {
  margin: 1rem 0 0;
  padding: 0.65rem 0.85rem;
  border-left: 4px solid #8b5cf6;
  border-radius: 0 0.5rem 0.5rem 0;
  background: #f5f3ff;
  font-style: italic;
  font-weight: 600;
  color: #4c1d95;
}
.sheet code {
  font-size: 12.5px;
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  background: #e2e8f0;
  color: #1e293b;
}
.sheet pre {
  margin: 0.75rem 0;
  padding: 0.65rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 12.5px;
  overflow-x: auto;
  color: #334155;
}
.sheet pre code { background: none; padding: 0; }
.mermaid-wrap { margin: 0.75rem 0; overflow-x: auto; border-radius: 0.5rem; border: 1px solid #e5e7eb; background: #f8fafc; padding: 0.75rem; }
.mermaid-wrap .mermaid { display: flex; justify-content: center; }
.export-mm-placeholder { margin: 0.75rem 0; border-radius: 0.5rem; border: 1px solid #e9d5ff; background: #faf5ff; padding: 0.65rem 0.85rem; }
.export-mm-placeholder-p { margin: 0; font-size: 0.8125rem; line-height: 1.5; color: #5b21b6; }
.sheet .katex { font-size: 1.05em; color: #0f172a; }
.sheet .katex-display { margin: 0.75rem 0; overflow-x: auto; }
.sheet table { border-collapse: collapse; width: 100%; font-size: 13px; margin: 0.75rem 0; }
.sheet th, .sheet td { border: 1px solid #e5e7eb; padding: 0.35rem 0.5rem; text-align: left; }
.sheet th { background: #f8fafc; font-weight: 600; color: #0f172a; }
.meta {
  margin-bottom: 1rem;
  font-size: 12px;
  color: #94a3b8;
}
@media print {
  body { background: #fff; }
  .wrap { padding: 0; max-width: none; }
  .sheet { border: none; box-shadow: none; }
  .sheet h2,
  .sheet h3,
  .sheet p,
  .sheet li,
  .sheet blockquote,
  .sheet pre,
  .sheet table,
  .sheet tr,
  .sheet td,
  .sheet th {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .sheet p,
  .sheet li {
    orphans: 2;
    widows: 2;
  }
  .sheet ul,
  .sheet ol {
    break-inside: auto;
    page-break-inside: auto;
  }
}
`.trim();

export function escapeHtmlAttr(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function buildStudyKitExportDocument(opts: {
    title: string;
    lang: string;
    bodyHtml: string;
    generatedNote?: string;
    /** Append Mermaid ESM bootstrap so diagrams render when the file is opened in a browser (needs network for CDN). */
    includeMermaidRuntime?: boolean;
}): string {
    const title = escapeHtmlAttr(opts.title);
    const note = opts.generatedNote
        ? `<p class="meta">${escapeHtmlAttr(opts.generatedNote)}</p>`
        : "";
    const mermaidScript = opts.includeMermaidRuntime ? `\n${MERMAID_BOOTSTRAP}\n` : "";
    return `<!DOCTYPE html>
<html lang="${escapeHtmlAttr(opts.lang)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<link rel="stylesheet" href="${KATEX_CDN}" crossorigin="anonymous"/>
<style>${STUDY_KIT_EXPORT_STYLES}</style>
</head>
<body>
<div class="wrap">
${note}
<div class="sheet exam-notes-markdown">
${opts.bodyHtml}
</div>
</div>${mermaidScript}
</body>
</html>`;
}
