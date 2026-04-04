import { JSDOM } from "jsdom";

/**
 * Post-process Readability HTML: strip BBC image boilerplate (source lines, empty
 * caption labels) and normalize caption text so the reader shows one clean block.
 */
export function polishBbcReaderHtml(fragmentHtml: string): string {
  const dom = new JSDOM(`<div id="bbc-reader-root">${fragmentHtml}</div>`);
  const root = dom.window.document.getElementById("bbc-reader-root");
  if (!root) return fragmentHtml;

  const paras = [...root.querySelectorAll("p")];
  for (const p of paras) {
    if (!p.parentElement || !root.contains(p)) continue;
    const raw = (p.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!raw) continue;

    /* Drop credit lines entirely (SNS, BBC Sport, Getty, etc.) */
    if (/^Image source,?\s+/i.test(raw)) {
      p.remove();
      continue;
    }
    if (/^(photograph|photo credit)\s*:/i.test(raw)) {
      p.remove();
      continue;
    }

    const cap = raw.match(/^Image caption,?\s*(.*)$/i);
    if (cap) {
      const rest = cap[1].trim();
      if (!rest) {
        p.remove();
      } else {
        p.textContent = rest;
        p.classList.add("bbc-reader-img-caption-text");
      }
      continue;
    }
  }

  for (const table of [...root.querySelectorAll("table")]) {
    if (table.closest(".bbc-reader-table-wrap")) continue;
    const wrap = dom.window.document.createElement("div");
    wrap.className = "bbc-reader-table-wrap";
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
  }

  return root.innerHTML;
}
