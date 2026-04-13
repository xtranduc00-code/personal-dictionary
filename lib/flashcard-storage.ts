"use client";
import { authFetch } from "@/lib/auth-context";
export type FlashcardSet = {
    id: string;
    name: string;
    createdAt: string;
    pinned?: boolean;
};
export type Flashcard = {
    id: string;
    setId: string;
    word: string;
    definition: string;
    example: string;
    createdAt: string;
};
const API = "/api/flashcards";
async function getJson<T>(res: Response): Promise<T> {
    const data = await res.json();
    if (!res.ok)
        throw new Error((data as {
            error?: string;
        })?.error ?? "Request failed");
    return data as T;
}
export async function getFlashcardSets(): Promise<FlashcardSet[]> {
    const res = await authFetch(API + "/sets");
    const data = await getJson<Array<{
        id: string;
        name: string;
        created_at: string;
        pinned?: boolean;
    }>>(res);
    return data.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, pinned: r.pinned ?? false }));
}
export async function getFlashcardsBySet(setId: string): Promise<Flashcard[]> {
    const res = await authFetch(`${API}/sets/${setId}/cards`);
    const data = await getJson<Array<{
        id: string;
        set_id: string;
        word: string;
        definition: string;
        example: string;
        created_at: string;
    }>>(res);
    return data.map((r) => ({
        id: r.id,
        setId: r.set_id,
        word: r.word,
        definition: r.definition ?? "",
        example: r.example ?? "",
        createdAt: r.created_at,
    }));
}
export async function createFlashcardSet(name: string): Promise<FlashcardSet> {
    const res = await authFetch(API + "/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "New set" }),
    });
    const r = await getJson<{
        id: string;
        name: string;
        created_at: string;
        pinned?: boolean;
    }>(res);
    return { id: r.id, name: r.name, createdAt: r.created_at, pinned: r.pinned ?? false };
}
export async function updateFlashcardSet(setId: string, name: string): Promise<FlashcardSet | null> {
    const res = await authFetch(`${API}/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || name }),
    });
    if (res.status === 404)
        return null;
    const r = await getJson<{
        id: string;
        name: string;
        created_at: string;
        pinned?: boolean;
    }>(res);
    return { id: r.id, name: r.name, createdAt: r.created_at, pinned: r.pinned ?? false };
}
export async function setFlashcardPinned(setId: string, pinned: boolean): Promise<FlashcardSet | null> {
    const res = await authFetch(`${API}/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
    });
    if (res.status === 404)
        return null;
    const r = await getJson<{
        id: string;
        name: string;
        created_at: string;
        pinned?: boolean;
    }>(res);
    return { id: r.id, name: r.name, createdAt: r.created_at, pinned: r.pinned ?? false };
}
export async function deleteFlashcardSet(setId: string): Promise<void> {
    const res = await authFetch(`${API}/sets/${setId}`, { method: "DELETE" });
    await getJson(res);
}
export async function addFlashcard(setId: string, word: string, definition: string, example: string = ""): Promise<Flashcard> {
    const res = await authFetch(`${API}/sets/${setId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: word.trim(), definition: definition.trim(), example: example.trim() }),
    });
    const r = await getJson<{
        id: string;
        set_id: string;
        word: string;
        definition: string;
        example: string;
        created_at: string;
    }>(res);
    import("@/components/daily-tasks/daily-tasks-auto-detect")
        .then(({ incrementVocabCounter }) => incrementVocabCounter())
        .catch(() => {});
    return {
        id: r.id,
        setId: r.set_id,
        word: r.word,
        definition: r.definition ?? "",
        example: r.example ?? "",
        createdAt: r.created_at,
    };
}
export async function deleteFlashcard(id: string): Promise<void> {
    const res = await authFetch(`${API}/cards/${id}`, { method: "DELETE" });
    await getJson(res);
}
export async function updateFlashcard(id: string, word: string, definition: string, example: string = ""): Promise<Flashcard | null> {
    const res = await authFetch(`${API}/cards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: word.trim(), definition: definition.trim(), example: example.trim() }),
    });
    if (res.status === 404)
        return null;
    const r = await getJson<{
        id: string;
        set_id: string;
        word: string;
        definition: string;
        example: string;
        created_at: string;
    }>(res);
    return {
        id: r.id,
        setId: r.set_id,
        word: r.word,
        definition: r.definition ?? "",
        example: r.example ?? "",
        createdAt: r.created_at,
    };
}
