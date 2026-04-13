import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * Minimal HTML pass-through. The browser uses this to fetch archive.ph
 * snapshots when CORS would otherwise block the direct call. The route
 * does no parsing — just forwards the raw HTML so client-side Readability
 * can run and stay outside Netlify's 10s sync function cap.
 *
 * Restricted to archive.* / web.archive.org / 12ft.io to avoid being used
 * as a generic open proxy.
 */
const ALLOWED_HOSTS = new Set([
    "archive.ph",
    "archive.today",
    "archive.li",
    "archive.is",
    "archive.fo",
    "archive.md",
    "web.archive.org",
    "12ft.io",
]);

const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Netlify-CDN-Cache-Control": "no-store",
    Vary: "*",
};

const BROWSER_HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.google.com/",
};

function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: { ...corsHeaders(), ...NO_CACHE_HEADERS },
    });
}

export async function GET(req: NextRequest) {
    const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
    if (!raw) {
        return NextResponse.json(
            { error: "Missing ?url" },
            { status: 400, headers: { ...corsHeaders(), ...NO_CACHE_HEADERS } },
        );
    }

    let target: URL;
    try {
        target = new URL(raw);
    } catch {
        return NextResponse.json(
            { error: "Invalid URL" },
            { status: 400, headers: { ...corsHeaders(), ...NO_CACHE_HEADERS } },
        );
    }

    if (!["http:", "https:"].includes(target.protocol)) {
        return NextResponse.json(
            { error: "Only http(s) URLs are allowed." },
            { status: 400, headers: { ...corsHeaders(), ...NO_CACHE_HEADERS } },
        );
    }

    if (!ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
        return NextResponse.json(
            { error: `Host not allowed: ${target.hostname}` },
            { status: 403, headers: { ...corsHeaders(), ...NO_CACHE_HEADERS } },
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
        const res = await fetch(target.toString(), {
            redirect: "follow",
            signal: controller.signal,
            cache: "no-store",
            headers: BROWSER_HEADERS,
        });
        const html = await res.text();
        return new Response(html, {
            status: res.status,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                ...corsHeaders(),
                ...NO_CACHE_HEADERS,
            },
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const aborted = msg.includes("abort") || msg === "AbortError";
        return NextResponse.json(
            { error: aborted ? "Upstream timed out" : `Proxy fetch failed: ${msg}` },
            {
                status: aborted ? 504 : 502,
                headers: { ...corsHeaders(), ...NO_CACHE_HEADERS },
            },
        );
    } finally {
        clearTimeout(timeout);
    }
}
