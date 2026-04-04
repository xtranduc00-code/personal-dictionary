/**
 * BBC RSS and share links append tracking query params (e.g. at_medium, at_campaign).
 * Those can break reader extraction or differ from the canonical article URL.
 */
export function normalizeBbcArticleUrl(url: URL): URL {
  const u = new URL(url.href);
  const keysToDelete: string[] = [];
  u.searchParams.forEach((_, key) => {
    if (key.startsWith("at_") || key === "ocid") keysToDelete.push(key);
  });
  for (const k of keysToDelete) u.searchParams.delete(k);
  if (u.searchParams.toString() === "") u.search = "";
  return u;
}

/** Restrict article fetch to BBC hosts (SSRF-safe allowlist). */
export function isAllowedBbcArticleUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const allowed =
    host === "www.bbc.com" ||
    host === "bbc.com" ||
    host.endsWith(".bbc.com") ||
    host === "www.bbc.co.uk" ||
    host === "bbc.co.uk" ||
    host.endsWith(".bbc.co.uk");
  if (!allowed) return false;
  // RSS / API hosts — not article HTML
  if (host.startsWith("feeds.")) return false;
  return true;
}
