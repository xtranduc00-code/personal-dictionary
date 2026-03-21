import type { StudyKitChatMsg } from "@/lib/study-kit-chat-types";

const MAX_THREAD_KEYS = 32;
const MAX_MSGS_PER_THREAD = 80;
const MAX_MSG_CONTENT = 16_000;

type SanitizedMsg = { id: string; role: "user" | "assistant"; content: string };

export function sanitizeMessageArray(raw: unknown): SanitizedMsg[] {
    if (!Array.isArray(raw))
        return [];
    const out: SanitizedMsg[] = [];
    for (const m of raw.slice(0, MAX_MSGS_PER_THREAD)) {
        if (!m || typeof m !== "object")
            continue;
        const o = m as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id : "";
        const role = o.role === "user" || o.role === "assistant" ? o.role : "";
        const content = typeof o.content === "string" ? o.content.slice(0, MAX_MSG_CONTENT) : "";
        if (id && role && content)
            out.push({ id, role, content });
    }
    return out;
}

const THREAD_KEY_OK = /^[a-zA-Z0-9_-]{1,64}$/;

/** Normalize DB `messages` jsonb → per-section chat threads (client shape). */
export function unpackSessionMessages(raw: unknown): Record<string, StudyKitChatMsg[]> {
    if (Array.isArray(raw)) {
        const leg = sanitizeMessageArray(raw);
        return leg.length > 0 ? { whole: leg } : {};
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        if (o.v === 2 && o.threads && typeof o.threads === "object" && !Array.isArray(o.threads))
            return sanitizeSectionThreadsRecord(o.threads);
    }
    return {};
}

export function sanitizeSectionThreadsRecord(raw: unknown): Record<string, StudyKitChatMsg[]> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return {};
    const out: Record<string, StudyKitChatMsg[]> = {};
    const keys = Object.keys(raw as Record<string, unknown>).filter((k) => THREAD_KEY_OK.test(k));
    for (const k of keys.slice(0, MAX_THREAD_KEYS)) {
        const arr = (raw as Record<string, unknown>)[k];
        out[k] = sanitizeMessageArray(arr);
    }
    return out;
}

/** Pack for storing in `messages` jsonb column. */
export function packSessionMessages(threads: Record<string, StudyKitChatMsg[]>): { v: 2; threads: Record<string, StudyKitChatMsg[]> } {
    return { v: 2, threads: sanitizeSectionThreadsRecord(threads) };
}

/** Migrate legacy flat `messages` array into packed `{ v:2, threads:{ whole } }`. */
export function packLegacyFlatMessages(raw: unknown): { v: 2; threads: Record<string, StudyKitChatMsg[]> } {
    const whole = sanitizeMessageArray(raw);
    return packSessionMessages(whole.length > 0 ? { whole } : {});
}
