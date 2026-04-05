/**
 * Strip heavy subtrees before JSDOM — cuts CPU/memory on Guardian pages (many scripts, CMP, etc.).
 * Article markup lives outside these tags; Readability still receives a valid-enough document.
 */
export function stripHeavyHtmlNoiseForParse(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
}
