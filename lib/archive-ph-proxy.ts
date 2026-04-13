/**
 * archive.ph proxy for paywalled articles.
 *
 * Workflow:
 *   1. Try `https://archive.ph/newest/<url>` — if a snapshot exists, use it.
 *   2. If no snapshot yet, POST to `/submit/?url=<url>` to request one,
 *      wait briefly, then re-GET `/newest/`.
 *   3. Whole sequence is bounded by `totalTimeoutMs` (default 15s). Caller
 *      should treat any throw as "use the direct-fetch fallback".
 *
 * archive.ph snapshots strip publisher scripts (no `__NEXT_DATA__`) so the
 * caller is expected to run Readability over the returned HTML.
 */

const BROWSER_HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.google.com/",
};

function timeBudget(totalMs: number) {
    const start = Date.now();
    return {
        remaining(): number {
            return Math.max(0, totalMs - (Date.now() - start));
        },
        spent(): number {
            return Date.now() - start;
        },
    };
}

async function fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
            redirect: "follow",
            cache: "no-store",
        });
    } finally {
        clearTimeout(t);
    }
}

async function tryFetchSnapshot(
    url: string,
    timeoutMs: number,
): Promise<{ html: string; finalUrl: string } | null> {
    if (timeoutMs <= 0) return null;
    const snapshotUrl = `https://archive.ph/newest/${url}`;
    let res: Response;
    try {
        res = await fetchWithTimeout(
            snapshotUrl,
            { headers: BROWSER_HEADERS },
            timeoutMs,
        );
    } catch {
        return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    const html = await res.text();
    if (!html || html.length < 1000) return null;
    return { html, finalUrl: res.url || snapshotUrl };
}

async function submitForArchiving(
    url: string,
    timeoutMs: number,
): Promise<void> {
    if (timeoutMs <= 0) return;
    const body = new URLSearchParams({ url }).toString();
    try {
        await fetchWithTimeout(
            `https://archive.ph/submit/?url=${encodeURIComponent(url)}`,
            {
                method: "POST",
                headers: {
                    ...BROWSER_HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body,
            },
            timeoutMs,
        );
    } catch {
        /* ignore — we'll just retry the snapshot fetch below */
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort fetch of an article through archive.ph. Returns null if no
 * snapshot can be obtained inside the time budget.
 */
export async function fetchHtmlViaArchivePh(
    url: string,
    totalTimeoutMs = 15_000,
): Promise<{ html: string; finalUrl: string } | null> {
    const budget = timeBudget(totalTimeoutMs);

    // 1) Try existing snapshot first.
    const initial = await tryFetchSnapshot(
        url,
        Math.min(7_000, budget.remaining()),
    );
    if (initial) return initial;

    // 2) No snapshot yet — submit and wait.
    if (budget.remaining() < 4_000) return null;
    await submitForArchiving(url, Math.min(4_000, budget.remaining()));

    // 3) archive.ph typically needs ~5s to materialize a fresh snapshot;
    //    poll up to twice within whatever budget is left.
    for (let attempt = 0; attempt < 2; attempt++) {
        const remaining = budget.remaining();
        if (remaining < 3_000) break;
        await delay(Math.min(4_000, remaining - 2_500));
        const snap = await tryFetchSnapshot(
            url,
            Math.min(5_000, budget.remaining()),
        );
        if (snap) return snap;
    }

    return null;
}
