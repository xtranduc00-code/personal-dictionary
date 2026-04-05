/**
 * Strip heavy subtrees before JSDOM — cuts CPU/memory on Guardian pages (many scripts, CMP, etc.).
 * Article markup lives outside these tags; Readability still receives a valid-enough document.
 *
 * Guardian-specific heavy nodes removed:
 *  - <script> / <style> / <noscript>  — JS bundles, inline data blobs, CSS
 *  - <svg> — decorative icons / logos embedded inline
 *  - <picture> / <source> — srcset attribute blobs are large; <img> src preserved
 *  - <!-- comments --> — Guardian embeds large JSON/config in HTML comments
 *  - data-* attribute values — often contain minified JSON that inflates DOM size
 *  - Guardian's consent/CMP overlay markup (id="sp_message_container*" or class="sp-message-*)
 */
export function stripHeavyHtmlNoiseForParse(html: string): string {
  return html
    // Code / runtime blobs
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    // Inline SVGs (icons/logos) — large, not needed for text extraction
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    // <picture> wrappers & <source> elements — srcset strings are large; img tags kept
    .replace(/<picture\b[\s\S]*?<\/picture>/gi, "")
    .replace(/<source\b[^>]*>/gi, "")
    // HTML comments (Guardian hides large JSON config in them)
    .replace(/<!--[\s\S]*?-->/g, "")
    // Guardian consent/CMP overlay containers
    .replace(/<div\b[^>]*(?:id|class)="[^"]*sp[-_]message[^"]*"[\s\S]*?<\/div>/gi, "")
    // Strip data-* attribute VALUES (keep attribute name so DOM structure survives)
    // Large inline JSON is often stored in data-props, data-component, etc.
    .replace(/(\bdata-[\w-]+=)"[^"]{200,}"/gi, '$1""')
    .replace(/(\bdata-[\w-]+=)'[^']{200,}'/gi, "$1''");
}
