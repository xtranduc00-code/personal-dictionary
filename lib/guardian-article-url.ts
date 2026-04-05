/**
 * Restrict server-side article fetch to Guardian article hosts (SSRF allowlist).
 * AMP pages are normalized to www for a single HTML shape.
 */
export function normalizeGuardianArticleUrl(url: URL): URL {
  const u = new URL(url.href);
  const host = u.hostname.toLowerCase();
  if (host === "amp.theguardian.com") {
    u.hostname = "www.theguardian.com";
  }
  const trackingKeys = [
    "INTCMP",
    "CMP",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "fbclid",
  ];
  for (const k of trackingKeys) u.searchParams.delete(k);
  if (u.searchParams.toString() === "") u.search = "";
  return u;
}

export function isAllowedGuardianArticleUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "www.theguardian.com" ||
    host === "theguardian.com" ||
    host === "amp.theguardian.com"
  );
}
