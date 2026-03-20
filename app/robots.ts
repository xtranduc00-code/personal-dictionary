import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { blockSearchIndexing } from "@/lib/search-indexing";

export default function robots(): MetadataRoute.Robots {
    const base = getSiteUrl().replace(/\/$/, "");
    if (blockSearchIndexing()) {
        // Allow crawl so Google can see noindex on HTML; omit sitemap so URLs are not advertised.
        return { rules: { userAgent: "*", allow: "/" } };
    }
    return {
        rules: { userAgent: "*", allow: "/" },
        sitemap: `${base}/sitemap.xml`,
    };
}
