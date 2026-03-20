import net from "node:net";

const MAX_URL_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_REDIRECTS = 5;

function normalizeHost(hostname: string): string {
    return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

/** Block SSRF: loopback, private, link-local, metadata-style hosts. */
export function isBlockedUrlHost(hostname: string): boolean {
    const h = normalizeHost(hostname);
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local"))
        return true;
    if (h === "metadata.google.internal" || h.includes("metadata.google.internal"))
        return true;
    const ipVer = net.isIP(h);
    if (ipVer === 4) {
        if (h.startsWith("127.") || h === "0.0.0.0")
            return true;
        if (h.startsWith("10."))
            return true;
        if (h.startsWith("192.168."))
            return true;
        if (h.startsWith("169.254."))
            return true;
        if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h))
            return true;
        return false;
    }
    if (ipVer === 6) {
        if (h === "::1")
            return true;
        if (h.startsWith("fe80:"))
            return true;
        if (h.startsWith("fc") || h.startsWith("fd"))
            return true;
        return false;
    }
    return false;
}

export type FetchedUrlDocument = {
    buffer: Buffer;
    fileName: string;
    contentType: string;
};

/**
 * GET a public document URL with manual redirect validation per hop.
 * Does not follow redirects to private hosts.
 */
export async function fetchDocumentFromUrl(urlString: string): Promise<FetchedUrlDocument> {
    const trimmed = urlString.trim();
    if (!trimmed)
        throw new Error("URL_EMPTY");
    let url: URL;
    try {
        url = new URL(trimmed);
    }
    catch {
        throw new Error("URL_INVALID");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error("URL_PROTOCOL");
    if (isBlockedUrlHost(url.hostname))
        throw new Error("URL_HOST_BLOCKED");

    let current = url.toString();
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
        let res: Response;
        try {
            res = await fetch(current, {
                method: "GET",
                redirect: "manual",
                signal: ac.signal,
                headers: {
                    Accept: "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain;q=0.9,*/*;q=0.1",
                    "User-Agent": "KenWorkspace-StudyKit/1.0",
                },
            });
        }
        catch {
            clearTimeout(timer);
            throw new Error("URL_FETCH_FAILED");
        }
        clearTimeout(timer);

        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            if (!loc || hop === MAX_REDIRECTS)
                throw new Error("URL_REDIRECT");
            const next = new URL(loc, current);
            if (next.protocol !== "http:" && next.protocol !== "https:")
                throw new Error("URL_PROTOCOL");
            if (isBlockedUrlHost(next.hostname))
                throw new Error("URL_HOST_BLOCKED");
            current = next.toString();
            continue;
        }

        if (!res.ok)
            throw new Error("URL_HTTP");

        const lenHdr = res.headers.get("content-length");
        if (lenHdr) {
            const n = parseInt(lenHdr, 10);
            if (!Number.isNaN(n) && n > MAX_URL_BYTES)
                throw new Error("URL_TOO_LARGE");
        }

        let buffer: Buffer;
        try {
            const ab = await res.arrayBuffer();
            if (ab.byteLength > MAX_URL_BYTES)
                throw new Error("URL_TOO_LARGE");
            buffer = Buffer.from(ab);
        }
        catch (e: unknown) {
            if (e instanceof Error && e.message === "URL_TOO_LARGE")
                throw e;
            throw new Error("URL_FETCH_FAILED");
        }

        const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        const pathParts = new URL(current).pathname.split("/").filter(Boolean);
        const pathLast = pathParts[pathParts.length - 1] ?? "document";
        let fileName = "document";
        try {
            fileName = decodeURIComponent(pathLast) || "document";
        }
        catch {
            fileName = pathLast || "document";
        }
        return { buffer, fileName, contentType: ct };
    }
    throw new Error("URL_REDIRECT");
}
