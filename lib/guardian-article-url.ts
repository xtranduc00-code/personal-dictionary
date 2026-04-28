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

/**
 * Reasons an article URL is unsuitable for sideload as a Kindle EPUB chapter.
 * Each maps to a distinct Guardian path segment:
 *  - live: live blog (100+ timestamped entries → DOM bloat + Kindle flip lag)
 *  - audio: podcast page (mostly an audio player, almost no body text)
 *  - video: video page (same — body is a thin caption around an embedded player)
 *  - gallery: photo gallery (image-heavy, low text density, big file size)
 *  - interactive: ng-interactive data viz (DOM/JS-heavy, doesn't render on e-ink)
 *  - picture: single-image page (essentially zero body text)
 */
export type GuardianKindleSkipReason =
  | "live"
  | "audio"
  | "video"
  | "gallery"
  | "interactive"
  | "picture";

const KINDLE_SKIP_PATTERNS: Array<{ re: RegExp; reason: GuardianKindleSkipReason }> = [
  { re: /(^|\/)live\//, reason: "live" },
  { re: /(^|\/)audio\//, reason: "audio" },
  { re: /(^|\/)video\//, reason: "video" },
  { re: /(^|\/)gallery\//, reason: "gallery" },
  { re: /(^|\/)ng-interactive\//, reason: "interactive" },
  { re: /(^|\/)picture\//, reason: "picture" },
];

/** null when the URL is OK to include in an EPUB; otherwise the skip reason. */
export function shouldSkipForKindleEpub(href: string): GuardianKindleSkipReason | null {
  let pathname: string;
  try {
    pathname = new URL(href).pathname;
  } catch {
    return null;
  }
  for (const { re, reason } of KINDLE_SKIP_PATTERNS) {
    if (re.test(pathname)) return reason;
  }
  return null;
}
