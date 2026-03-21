"use client";

import { authFetch } from "@/lib/auth-context";
import { mergeStudyKitSheetsMarkdown } from "@/lib/study-kit-merge-markdown";
import type { StudySavedSheet, StudySavedTopic } from "@/lib/study-kit-saved";
import { findMergeCandidateInSheets } from "@/lib/study-kit-saved";

export type TopicListRow = {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    sheetCount: number;
};

function mapListToTopics(rows: TopicListRow[]): StudySavedTopic[] {
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        sheets: [],
        sheetCount: r.sheetCount,
    }));
}

export async function apiListSavedTopics(): Promise<StudySavedTopic[]> {
    const res = await authFetch("/api/study-kit/saved/topics");
    if (!res.ok)
        return [];
    const data = (await res.json()) as { topics?: TopicListRow[] };
    return mapListToTopics(data.topics ?? []);
}

export async function apiFetchSavedTopic(topicId: string): Promise<StudySavedTopic | null> {
    const res = await authFetch(`/api/study-kit/saved/topics/${encodeURIComponent(topicId)}`);
    if (!res.ok)
        return null;
    const data = (await res.json()) as {
        topic?: {
            id: string;
            name: string;
            createdAt: string;
            updatedAt: string;
            sheets: {
                id: string;
                title: string;
                markdown: string;
                truncated: boolean;
                savedAt: string;
            }[];
        };
    };
    const t = data.topic;
    if (!t)
        return null;
    const sheets: StudySavedSheet[] = t.sheets.map((s) => ({
        id: s.id,
        title: s.title,
        markdown: s.markdown,
        truncated: Boolean(s.truncated),
        savedAt: s.savedAt,
    }));
    return {
        id: t.id,
        name: t.name,
        createdAt: t.createdAt,
        sheets,
        sheetCount: sheets.length,
    };
}

export async function apiCreateSavedTopic(name: string): Promise<StudySavedTopic | null> {
    const res = await authFetch("/api/study-kit/saved/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (!res.ok)
        return null;
    const data = (await res.json()) as { topic?: TopicListRow };
    const row = data.topic;
    if (!row)
        return null;
    return mapListToTopics([row])[0]!;
}

export async function apiRenameSavedTopic(topicId: string, name: string): Promise<boolean> {
    const res = await authFetch(`/api/study-kit/saved/topics/${encodeURIComponent(topicId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    return res.ok;
}

export async function apiDeleteSavedTopic(topicId: string): Promise<boolean> {
    const res = await authFetch(`/api/study-kit/saved/topics/${encodeURIComponent(topicId)}`, {
        method: "DELETE",
    });
    return res.ok;
}

export async function apiAddSheetToTopic(
    topicId: string,
    entry: { title: string; markdown: string; truncated: boolean },
): Promise<StudySavedSheet | null> {
    const res = await authFetch(
        `/api/study-kit/saved/topics/${encodeURIComponent(topicId)}/sheets`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: entry.title,
                markdown: entry.markdown,
                truncated: entry.truncated,
            }),
        },
    );
    if (!res.ok)
        return null;
    const data = (await res.json()) as {
        sheet?: {
            id: string;
            title: string;
            markdown: string;
            truncated: boolean;
            savedAt: string;
        };
    };
    const s = data.sheet;
    if (!s)
        return null;
    return {
        id: s.id,
        title: s.title,
        markdown: s.markdown,
        truncated: Boolean(s.truncated),
        savedAt: s.savedAt,
    };
}

export async function apiUpdateSheet(
    topicId: string,
    sheetId: string,
    updates: { title?: string; markdown?: string; truncated?: boolean },
): Promise<boolean> {
    const res = await authFetch(
        `/api/study-kit/saved/topics/${encodeURIComponent(topicId)}/sheets/${encodeURIComponent(sheetId)}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
        },
    );
    return res.ok;
}

export async function apiDeleteSheet(topicId: string, sheetId: string): Promise<boolean> {
    const res = await authFetch(
        `/api/study-kit/saved/topics/${encodeURIComponent(topicId)}/sheets/${encodeURIComponent(sheetId)}`,
        { method: "DELETE" },
    );
    return res.ok;
}

/** If the account has no subjects yet, upload local `study-kit-saved-v2` data once. */
export async function apiImportLocalTopicsIfEmpty(
    localTopics: StudySavedTopic[],
): Promise<"imported" | "skipped" | "failed"> {
    if (localTopics.length === 0)
        return "skipped";
    const res = await authFetch("/api/study-kit/saved/import-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            topics: localTopics.map((top) => ({
                name: top.name,
                sheets: top.sheets.map((s) => ({
                    title: s.title,
                    markdown: s.markdown,
                    truncated: s.truncated,
                    savedAt: s.savedAt,
                })),
            })),
        }),
    });
    if (res.status === 409)
        return "skipped";
    if (!res.ok)
        return "failed";
    return "imported";
}

export async function apiMergeOrAddSheet(
    topicId: string,
    opts: {
        title: string;
        markdown: string;
        truncated: boolean;
        mergeSameTitle: boolean;
    },
): Promise<"merged" | "added" | "failed"> {
    if (opts.mergeSameTitle) {
        const topic = await apiFetchSavedTopic(topicId);
        if (topic) {
            const existing = findMergeCandidateInSheets(topic.sheets, opts.title);
            if (existing) {
                const merged = mergeStudyKitSheetsMarkdown(existing.markdown, opts.markdown);
                const ok = await apiUpdateSheet(topicId, existing.id, {
                    title: opts.title.trim() || existing.title,
                    markdown: merged,
                    truncated: existing.truncated || opts.truncated,
                });
                return ok ? "merged" : "failed";
            }
        }
    }
    const row = await apiAddSheetToTopic(topicId, {
        title: opts.title,
        markdown: opts.markdown,
        truncated: opts.truncated,
    });
    return row ? "added" : "failed";
}
