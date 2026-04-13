const API = "/api/ielts";
export type SpeakingPart = "1" | "2" | "3";
export type Topic = {
    id: string;
    name: string;
    createdAt: string;
};
export type SpeakingQuestion = {
    id: string;
    topicId: string;
    text: string;
    part: SpeakingPart;
    createdAt: string;
};
export type SpeakingQuestionWithTopic = SpeakingQuestion & {
    topicName: string;
};
export type VocabItem = {
    word: string;
    explanation?: string;
    example?: string;
    examples?: string[];
    sentences?: string[];
};
export type PracticeAttempt = {
    answer: string;
    score?: number;
    feedback?: string;
    improvedAnswer?: string;
    practicedAt: string;
};
export type QuestionPracticeData = {
    draft: string;
    history: PracticeAttempt[];
};
async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as {
            error?: string;
        }).error || res.statusText);
    }
    return res.json() as Promise<T>;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as {
            error?: string;
        }).error || res.statusText);
    }
    return res.json() as Promise<T>;
}
async function patchJson(url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as {
            error?: string;
        }).error || res.statusText);
    }
}
async function deleteReq(url: string): Promise<void> {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as {
            error?: string;
        }).error || res.statusText);
    }
}
export async function getTopics(): Promise<Topic[]> {
    const data = await getJson<{
        id: string;
        name: string;
        created_at: string;
    }[]>(`${API}/topics`);
    return data
        .map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export async function addTopic(name: string): Promise<Topic> {
    const r = await postJson<{
        id: string;
        name: string;
        created_at: string;
    }>(`${API}/topics`, { name });
    return { id: r.id, name: r.name, createdAt: r.created_at };
}
export async function getTopic(id: string): Promise<Topic | null> {
    try {
        const r = await getJson<{
            id: string;
            name: string;
            created_at: string;
        }>(`${API}/topics/${id}`);
        return { id: r.id, name: r.name, createdAt: r.created_at };
    }
    catch {
        return null;
    }
}
export async function updateTopic(id: string, name: string): Promise<void> {
    await patchJson(`${API}/topics/${id}`, { name });
}
export async function deleteTopic(id: string): Promise<void> {
    await deleteReq(`${API}/topics/${id}`);
}
export async function getQuestions(topicId: string): Promise<SpeakingQuestion[]> {
    const data = await getJson<{
        id: string;
        topic_id: string;
        text: string;
        part: string;
        created_at: string;
    }[]>(`${API}/topics/${topicId}/questions`);
    return (data ?? [])
        .map((r) => ({
        id: r.id,
        topicId: r.topic_id,
        text: r.text,
        part: r.part as SpeakingPart,
        createdAt: r.created_at,
    }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export async function getQuestionsByPart(topicId: string, part: SpeakingPart): Promise<SpeakingQuestion[]> {
    const all = await getQuestions(topicId);
    return all.filter((q) => q.part === part);
}
export async function getAllQuestionsByPart(): Promise<{
    part1: SpeakingQuestionWithTopic[];
    part2: SpeakingQuestionWithTopic[];
    part3: SpeakingQuestionWithTopic[];
}> {
    const data = await getJson<{
        part1: {
            id: string;
            topicId: string;
            topicName: string;
            text: string;
            part: string;
            createdAt: string;
        }[];
        part2: {
            id: string;
            topicId: string;
            topicName: string;
            text: string;
            part: string;
            createdAt: string;
        }[];
        part3: {
            id: string;
            topicId: string;
            topicName: string;
            text: string;
            part: string;
            createdAt: string;
        }[];
    }>(`${API}/exam-questions`);
    const map = (r: {
        id: string;
        topicId: string;
        topicName: string;
        text: string;
        part: string;
        createdAt: string;
    }) => ({
        id: r.id,
        topicId: r.topicId,
        topicName: r.topicName ?? "",
        text: r.text,
        part: r.part as SpeakingPart,
        createdAt: r.createdAt,
    });
    return {
        part1: (data.part1 ?? []).map(map),
        part2: (data.part2 ?? []).map(map),
        part3: (data.part3 ?? []).map(map),
    };
}
export async function addQuestion(topicId: string, part: SpeakingPart, text: string): Promise<SpeakingQuestion> {
    const trimmed = text.trim();
    if (!trimmed)
        throw new Error("Question text is required.");
    const data = await postJson<{
        count: number;
    }>(`${API}/topics/${topicId}/questions`, { part, text: trimmed });
    const list = await getJson<{
        id: string;
        topic_id: string;
        text: string;
        part: string;
        created_at: string;
    }[]>(`${API}/topics/${topicId}/questions`);
    const added = list.find((q) => q.text === trimmed && q.part === part);
    if (!added)
        throw new Error("Failed to get added question");
    return {
        id: added.id,
        topicId: added.topic_id,
        text: added.text,
        part: added.part as SpeakingPart,
        createdAt: added.created_at,
    };
}
export async function addQuestions(topicId: string, part: SpeakingPart, textBlock: string): Promise<number> {
    const trimmed = textBlock.trim();
    if (!trimmed)
        return 0;
    if (part === "2") {
        const data = await postJson<{
            count: number;
        }>(`${API}/topics/${topicId}/questions`, {
            part,
            texts: [trimmed],
        });
        return data.count ?? 0;
    }
    const normalized = textBlock.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const texts = normalized
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    if (texts.length === 0)
        return 0;
    const data = await postJson<{
        count: number;
    }>(`${API}/topics/${topicId}/questions`, {
        part,
        texts,
    });
    return data.count ?? 0;
}
export async function deleteQuestion(id: string): Promise<void> {
    await deleteReq(`${API}/questions/${id}`);
}
export async function updateQuestion(id: string, updates: {
    text?: string;
    part?: SpeakingPart;
}): Promise<void> {
    await patchJson(`${API}/questions/${id}`, updates);
}
export async function getQuestionCountByTopic(topicId: string): Promise<number> {
    const counts = await getJson<Record<string, number>>(`${API}/question-counts`);
    return counts[topicId] ?? 0;
}
export async function getTopicVocab(topicId: string): Promise<VocabItem[]> {
    const data = await getJson<VocabItem[]>(`${API}/topics/${topicId}/vocab`);
    return Array.isArray(data) ? data : [];
}
export async function addTopicVocabItem(topicId: string, word: string, explanation?: string, example?: string): Promise<void> {
    await postJson(`${API}/topics/${topicId}/vocab`, {
        word: word.trim(),
        explanation: explanation?.trim() ?? "",
        example: example?.trim() ?? "",
    });
    if (typeof window !== "undefined") {
        import("@/components/daily-tasks/daily-tasks-auto-detect")
            .then(({ incrementVocabCounter }) => incrementVocabCounter())
            .catch(() => {});
    }
}
export async function updateTopicVocabItem(topicId: string, index: number, word: string, explanation?: string, example?: string): Promise<void> {
    await patchJson(`${API}/topics/${topicId}/vocab`, {
        index,
        word: word.trim(),
        explanation: explanation?.trim() ?? "",
        example: example?.trim() ?? "",
    });
}
export async function removeTopicVocabItem(topicId: string, index: number): Promise<void> {
    await deleteReq(`${API}/topics/${topicId}/vocab?index=${index}`);
}
export async function getPracticeRecord(questionId: string): Promise<QuestionPracticeData> {
    try {
        const data = await getJson<{
            draft: string;
            history: unknown[];
        }>(`${API}/questions/${questionId}/practice`);
        const history = (Array.isArray(data.history) ? data.history : []).filter((h): h is PracticeAttempt => h != null &&
            typeof h === "object" &&
            typeof (h as PracticeAttempt).answer === "string" &&
            typeof (h as PracticeAttempt).practicedAt === "string");
        return {
            draft: typeof data.draft === "string" ? data.draft : "",
            history,
        };
    }
    catch {
        return { draft: "", history: [] };
    }
}
export async function saveDraft(questionId: string, transcript: string): Promise<void> {
    await postJson(`${API}/questions/${questionId}/practice`, {
        draft: transcript,
    });
}
export async function addPracticeAttempt(questionId: string, attempt: PracticeAttempt): Promise<void> {
    await postJson(`${API}/questions/${questionId}/practice`, { attempt });
}
