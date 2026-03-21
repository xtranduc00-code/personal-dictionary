/** Client-only: Study saved folder — subjects (topics) each containing sheets (markdown files). */

export const STUDY_KIT_SAVED_V1_KEY = "study-kit-saved-v1";
export const STUDY_KIT_SAVED_STORAGE_KEY = "study-kit-saved-v2";

export const MAX_STUDY_TOPICS = 40;
export const MAX_SHEETS_PER_TOPIC = 80;
export const MAX_SHEETS_TOTAL = 200;

export type StudySavedSheet = {
    id: string;
    title: string;
    markdown: string;
    truncated: boolean;
    savedAt: string;
};

export type StudySavedTopic = {
    id: string;
    name: string;
    createdAt: string;
    sheets: StudySavedSheet[];
};

type SavedStateV2 = {
    v: 2;
    topics: StudySavedTopic[];
};

function newId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
        return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function emptyState(): SavedStateV2 {
    return { v: 2, topics: [] };
}

function parseV2(raw: string): SavedStateV2 | null {
    try {
        const data = JSON.parse(raw) as unknown;
        if (!data || typeof data !== "object")
            return null;
        const o = data as { v?: number; topics?: unknown };
        if (o.v !== 2 || !Array.isArray(o.topics))
            return null;
        const topics: StudySavedTopic[] = [];
        for (const t of o.topics) {
            if (!t || typeof t !== "object")
                continue;
            const row = t as Record<string, unknown>;
            if (typeof row.id !== "string" || typeof row.name !== "string")
                continue;
            const sheetsIn = Array.isArray(row.sheets) ? row.sheets : [];
            const sheets: StudySavedSheet[] = [];
            for (const s of sheetsIn) {
                if (!s || typeof s !== "object")
                    continue;
                const sh = s as Record<string, unknown>;
                if (
                    typeof sh.id === "string" &&
                    typeof sh.title === "string" &&
                    typeof sh.markdown === "string"
                ) {
                    sheets.push({
                        id: sh.id,
                        title: sh.title,
                        markdown: sh.markdown,
                        truncated: Boolean(sh.truncated),
                        savedAt:
                            typeof sh.savedAt === "string"
                                ? sh.savedAt
                                : new Date().toISOString(),
                    });
                }
            }
            topics.push({
                id: row.id,
                name: row.name,
                createdAt:
                    typeof row.createdAt === "string"
                        ? row.createdAt
                        : new Date().toISOString(),
                sheets,
            });
        }
        return { v: 2, topics };
    }
    catch {
        return null;
    }
}

function migrateV1FlatSheets(): SavedStateV2 | null {
    if (typeof window === "undefined")
        return null;
    const raw = window.localStorage.getItem(STUDY_KIT_SAVED_V1_KEY);
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0)
            return null;
        const sheets: StudySavedSheet[] = [];
        for (const x of parsed) {
            if (!x || typeof x !== "object")
                continue;
            const o = x as Record<string, unknown>;
            if (
                typeof o.id === "string" &&
                typeof o.title === "string" &&
                typeof o.markdown === "string"
            ) {
                sheets.push({
                    id: o.id,
                    title: o.title,
                    markdown: o.markdown,
                    truncated: Boolean(o.truncated),
                    savedAt:
                        typeof o.savedAt === "string"
                            ? o.savedAt
                            : new Date().toISOString(),
                });
            }
        }
        if (sheets.length === 0)
            return null;
        const topic: StudySavedTopic = {
            id: newId(),
            name: "General",
            createdAt: new Date().toISOString(),
            sheets: sheets.slice(0, MAX_SHEETS_PER_TOPIC),
        };
        return { v: 2, topics: [topic] };
    }
    catch {
        return null;
    }
}

function loadStateRaw(): SavedStateV2 {
    if (typeof window === "undefined")
        return emptyState();
    const raw = window.localStorage.getItem(STUDY_KIT_SAVED_STORAGE_KEY);
    if (raw) {
        const v2 = parseV2(raw);
        if (v2)
            return v2;
    }
    const migrated = migrateV1FlatSheets();
    if (migrated) {
        persistState(migrated);
        try {
            window.localStorage.removeItem(STUDY_KIT_SAVED_V1_KEY);
        }
        catch {
            /* ignore */
        }
        return migrated;
    }
    return emptyState();
}

export function persistState(state: SavedStateV2): void {
    if (typeof window === "undefined")
        return;
    window.localStorage.setItem(STUDY_KIT_SAVED_STORAGE_KEY, JSON.stringify(state));
}

export function loadStudyTopics(): StudySavedTopic[] {
    return loadStateRaw().topics.sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function getStudyTopic(topicId: string): StudySavedTopic | null {
    return loadStateRaw().topics.find((t) => t.id === topicId) ?? null;
}

export function addStudyTopic(name: string): StudySavedTopic | null {
    const state = loadStateRaw();
    const trimmed = name.trim();
    if (!trimmed)
        return null;
    if (state.topics.length >= MAX_STUDY_TOPICS)
        return null;
    const topic: StudySavedTopic = {
        id: newId(),
        name: trimmed,
        createdAt: new Date().toISOString(),
        sheets: [],
    };
    persistState({ v: 2, topics: [topic, ...state.topics] });
    return topic;
}

export function updateStudyTopic(topicId: string, name: string): boolean {
    const state = loadStateRaw();
    const trimmed = name.trim();
    if (!trimmed)
        return false;
    const idx = state.topics.findIndex((t) => t.id === topicId);
    if (idx < 0)
        return false;
    const next = state.topics.map((t) =>
        t.id === topicId ? { ...t, name: trimmed } : t,
    );
    persistState({ v: 2, topics: next });
    return true;
}

export function deleteStudyTopic(topicId: string): void {
    const state = loadStateRaw();
    persistState({
        v: 2,
        topics: state.topics.filter((t) => t.id !== topicId),
    });
}

function totalSheetCount(state: SavedStateV2): number {
    return state.topics.reduce((n, t) => n + t.sheets.length, 0);
}

export function addSheetToTopic(
    topicId: string,
    entry: { title: string; markdown: string; truncated: boolean },
): StudySavedSheet | null {
    const state = loadStateRaw();
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic)
        return null;
    if (totalSheetCount(state) >= MAX_SHEETS_TOTAL)
        return null;
    if (topic.sheets.length >= MAX_SHEETS_PER_TOPIC)
        return null;
    const sheet: StudySavedSheet = {
        id: newId(),
        title: entry.title.trim() || "Study sheet",
        markdown: entry.markdown,
        truncated: entry.truncated,
        savedAt: new Date().toISOString(),
    };
    const nextTopics = state.topics.map((t) =>
        t.id === topicId ? { ...t, sheets: [sheet, ...t.sheets] } : t,
    );
    persistState({ v: 2, topics: nextTopics });
    return sheet;
}

export function updateSheetInTopic(
    topicId: string,
    sheetId: string,
    updates: { title?: string; markdown?: string; truncated?: boolean },
): boolean {
    const state = loadStateRaw();
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic)
        return false;
    const nextSheets = topic.sheets.map((s) => {
        if (s.id !== sheetId)
            return s;
        return {
            ...s,
            title:
                updates.title !== undefined
                    ? updates.title.trim() || s.title
                    : s.title,
            markdown:
                updates.markdown !== undefined ? updates.markdown : s.markdown,
            truncated:
                updates.truncated !== undefined ? updates.truncated : s.truncated,
        };
    });
    if (nextSheets.every((s, i) => s === topic.sheets[i]))
        return false;
    const nextTopics = state.topics.map((t) =>
        t.id === topicId ? { ...t, sheets: nextSheets } : t,
    );
    persistState({ v: 2, topics: nextTopics });
    return true;
}

export function deleteSheetFromTopic(topicId: string, sheetId: string): void {
    const state = loadStateRaw();
    const nextTopics = state.topics.map((t) =>
        t.id === topicId
            ? { ...t, sheets: t.sheets.filter((s) => s.id !== sheetId) }
            : t,
    );
    persistState({ v: 2, topics: nextTopics });
}

export function sheetCountForTopic(topicId: string): number {
    const t = getStudyTopic(topicId);
    return t?.sheets.length ?? 0;
}

export function defaultTitleFromMarkdown(markdown: string): string {
    const line = markdown.split("\n").find((l) => l.trim());
    if (!line)
        return "Study sheet";
    return line.replace(/^#+\s*/, "").trim().slice(0, 100) || "Study sheet";
}
