/**
 * Allowlist for fetching Guardian-related images when packing EPUB (SSRF-safe).
 */
export function isAllowedGuardianEpubImageUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase();
  const allowedExact = new Set([
    "www.theguardian.com",
    "theguardian.com",
    "assets.guim.co.uk",
    "media.guim.co.uk",
    "i.guim.co.uk",
    "static.guim.co.uk",
    "uploads.guim.co.uk",
    "interactive.guim.co.uk",
  ]);
  if (allowedExact.has(h)) return true;
  if (h.endsWith(".guim.co.uk")) return true;
  return false;
}
