/** Canonical public origin (no trailing slash). SEO: Open Graph, sitemap, robots. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }
  return "https://kenworkspace.com";
}
