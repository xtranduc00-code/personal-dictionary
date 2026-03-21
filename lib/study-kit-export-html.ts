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
.sheet li { margin: 0.15rem 0; }
.sheet li::marker { color: #cbd5e1; }
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
}): string {
    const title = escapeHtmlAttr(opts.title);
    const note = opts.generatedNote
        ? `<p class="meta">${escapeHtmlAttr(opts.generatedNote)}</p>`
        : "";
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
</div>
</body>
</html>`;
}
