import type { RssItem } from "@/app/api/rss/route";

/**
 * Persistent KV cache for HBR section results.
 *
 * In production on Netlify we use Netlify Blobs so the cache survives cold
 * starts (the in-process Map cache does not — every fresh Lambda is empty,
 * which is the root cause of HBR tab-switch timeouts on the free tier).
 *
 * Outside of Netlify (local `npm run dev`, other hosts) we transparently fall
 * back to a per-process Map so callers don't have to branch.
 */

export type HbrCacheEnvelope = {
    items: RssItem[];
    expiresAt: number;
    fallback?: "none" | "mit-tech-review";
};

const TTL_MS = 30 * 60 * 1000;
const STORE_NAME = "hbr-cache";

function cacheKey(section: string): string {
    return `hbr-cache-${section}`;
}

const memoryFallback = new Map<string, HbrCacheEnvelope>();

type BlobStoreLike = {
    get: (key: string, opts?: { type?: "json" | "text" | "arrayBuffer" }) => Promise<unknown>;
    setJSON: (key: string, value: unknown) => Promise<unknown>;
};

let blobStore: BlobStoreLike | null | undefined;
let blobStoreLoadAttempted = false;

async function getBlobStore(): Promise<BlobStoreLike | null> {
    if (blobStoreLoadAttempted) return blobStore ?? null;
    blobStoreLoadAttempted = true;
    try {
        const mod = (await import("@netlify/blobs")) as unknown as {
            getStore: (name: string) => BlobStoreLike;
        };
        blobStore = mod.getStore(STORE_NAME);
        return blobStore;
    } catch {
        // Outside of Netlify (or @netlify/blobs not installed) — use the Map.
        blobStore = null;
        return null;
    }
}

export async function hbrCacheGet(section: string): Promise<HbrCacheEnvelope | null> {
    const key = cacheKey(section);

    const store = await getBlobStore();
    if (store) {
        try {
            const raw = (await store.get(key, { type: "json" })) as
                | HbrCacheEnvelope
                | null;
            if (raw && typeof raw === "object" && Array.isArray(raw.items)) {
                if (Date.now() < raw.expiresAt) return raw;
            }
        } catch {
            /* fall through to memory */
        }
    }

    const mem = memoryFallback.get(key);
    if (mem && Date.now() < mem.expiresAt) return mem;
    return null;
}

export async function hbrCacheSet(
    section: string,
    items: RssItem[],
    fallback: HbrCacheEnvelope["fallback"] = "none",
    ttlMs: number = TTL_MS,
): Promise<void> {
    const key = cacheKey(section);
    const envelope: HbrCacheEnvelope = {
        items,
        expiresAt: Date.now() + ttlMs,
        fallback,
    };

    memoryFallback.set(key, envelope);

    const store = await getBlobStore();
    if (!store) return;
    try {
        await store.setJSON(key, envelope);
    } catch {
        /* ignore — memory copy already saved */
    }
}
