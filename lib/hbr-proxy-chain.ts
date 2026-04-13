/**
 * Proxy chain for paywalled HBR articles. Each entry tries a different public
 * "read this article" proxy, in order, with an 8s timeout. The caller is
 * responsible for running Readability over the returned HTML and deciding
 * whether the extracted text is long enough to count as a real success
 * (rule of thumb: >= 2000 chars). archive.ph and friends frequently miss new
 * articles, so we want several escape hatches before falling back to direct
 * fetch (which HBR's cookie-meter caps at ~2 articles).
 */

const BROWSER_HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.google.com/",
};

export type HbrProxySource =
    | "wayback"
    | "12ft"
    | "archive.today"
    | "google-amp";

export type HbrProxyAttempt = {
    source: HbrProxySource;
    url: string;
};

function googleAmpUrl(original: string): string | null {
    try {
        const u = new URL(original);
        // Strip leading "/" so it joins cleanly.
        const path = u.pathname.replace(/^\/+/, "");
        return `https://hbr-org.cdn.ampproject.org/v/s/hbr.org/${path}`;
    } catch {
        return null;
    }
}

/**
 * Ordered list of proxy URLs to try for an HBR article. Wayback Machine
 * leads because it has by far the best snapshot coverage of fresh articles
 * (live-test: returns a real ~150 KB body where the others 404). The user-
 * specified 12ft/archive.today/AMP candidates remain as additional fallbacks.
 */
export function buildHbrProxyChain(original: string): HbrProxyAttempt[] {
    const out: HbrProxyAttempt[] = [];
    out.push({
        source: "wayback",
        url: `https://web.archive.org/web/2*/${original}`,
    });
    out.push({
        source: "12ft",
        url: `https://12ft.io/proxy?q=${encodeURIComponent(original)}`,
    });
    out.push({
        source: "archive.today",
        url: `https://archive.today/newest/${original}`,
    });
    const amp = googleAmpUrl(original);
    if (amp) out.push({ source: "google-amp", url: amp });
    return out;
}

/** GET an HTML page with an 8s timeout. Returns null on any non-success. */
export async function fetchProxyHtml(
    url: string,
    timeoutMs = 8_000,
): Promise<string | null> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
        const res = await fetch(url, {
            redirect: "follow",
            signal: controller.signal,
            cache: "no-store",
            headers: BROWSER_HEADERS,
        });
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("text/html") && !ct.includes("xml")) return null;
        const body = await res.text();
        if (!body || body.length < 1000) return null;
        return body;
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
}
