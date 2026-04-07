export const R2_BUCKET = "ielts";
export const R2_MOVIES_PREFIX = "movies/";
export const R2_SUBTITLES_PREFIX = "subtitles/";
export const R2_CHAT_FILES_PREFIX = "chat-files/";

// Reuse the existing R2 public domain already used for listening assets.
// Prefer env overrides when present (no new env vars required).
export function getR2PublicBaseUrl(): string {
    const fromEnv =
        process.env.NEXT_PUBLIC_AUDIO_BASE_URL?.trim()
        || process.env.R2_PUBLIC_BASE_URL?.trim()
        || "";
    if (fromEnv) {
        return fromEnv.replace(/\/$/, "");
    }
    return "https://pub-07cb27fc21e14030b9a45e98dc04b6ee.r2.dev";
}

export function buildR2PublicUrl(key: string): string {
    const base = getR2PublicBaseUrl();
    const clean = key.replace(/^\/+/, "");
    return `${base}/${clean}`;
}

export function isR2PublicMoviesUrl(raw: string): boolean {
    try {
        const u = new URL(raw);
        if (!u.hostname.endsWith(".r2.dev")) {
            return false;
        }
        return u.pathname.startsWith(`/${R2_MOVIES_PREFIX}`);
    }
    catch {
        return false;
    }
}

export function isR2PublicSubtitlesUrl(raw: string): boolean {
    try {
        const u = new URL(raw);
        if (!u.hostname.endsWith(".r2.dev")) {
            return false;
        }
        return u.pathname.startsWith(`/${R2_SUBTITLES_PREFIX}`);
    }
    catch {
        return false;
    }
}

export function r2KeyFromPublicUrl(raw: string): string | null {
    try {
        const u = new URL(raw);
        const key = u.pathname.replace(/^\/+/, "");
        if (!(key.startsWith(R2_MOVIES_PREFIX) || key.startsWith(R2_SUBTITLES_PREFIX))) {
            return null;
        }
        return key;
    }
    catch {
        return null;
    }
}

