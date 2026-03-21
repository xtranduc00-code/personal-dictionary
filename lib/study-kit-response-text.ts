/**
 * GPT-5 Responses API can return multiple `message` items (e.g. commentary + final_answer)
 * or multiple `output_text` chunks. Using `output_text` verbatim may duplicate content or
 * glue lines. This module picks the intended assistant text and cleans common artifacts.
 */

type OutputContentPart = { type?: string; text?: string };
type OutputMessage = {
    type?: string;
    role?: string;
    phase?: string | null;
    status?: string;
    content?: OutputContentPart[];
};

function isAssistantMessage(o: unknown): o is OutputMessage {
    if (!o || typeof o !== "object")
        return false;
    const m = o as OutputMessage;
    return m.type === "message" && m.role === "assistant";
}

function textChunksFromMessage(m: OutputMessage): string[] {
    return (m.content ?? [])
        .filter((c) => c.type === "output_text" && typeof c.text === "string")
        .map((c) => c.text!.replace(/\r\n/g, "\n").trim())
        .filter(Boolean);
}

/** Join adjacent model chunks — missing newlines cause tokens like `SCTP/M` + `Transport`. */
function joinChunks(chunks: string[]): string {
    if (chunks.length === 0)
        return "";
    let acc = chunks[0]!;
    for (let i = 1; i < chunks.length; i++) {
        const a = acc;
        const b = chunks[i]!;
        if (a.endsWith("\n") || b.startsWith("\n")) {
            acc = a + b;
            continue;
        }
        if (/[a-zA-Z0-9/)]$/.test(a) && /^[A-Za-z#]/.test(b))
            acc = `${a}\n${b}`;
        else
            acc = `${a}\n\n${b}`;
    }
    return acc;
}

function normalizeWs(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

/** If the document is two identical halves (common copy-paste / API glitch), keep one. */
function dedupePerfectDouble(text: string): string {
    const t = text.trim();
    if (t.length < 400)
        return t;
    const half = Math.floor(t.length / 2);
    const a = t.slice(0, half).trimEnd();
    const b = t.slice(half).trimStart();
    if (a === b)
        return a;
    return t;
}

/**
 * If the last ## block matches any earlier block (full duplicate section), drop trailing copies.
 */
function dedupeRepeatedTailSections(text: string): string {
    const parts = text.split(/\n(?=##\s)/);
    if (parts.length < 2)
        return text;
    const blocks = parts.map((p) => p.trim()).filter(Boolean);
    let out = [...blocks];
    while (out.length >= 2) {
        const last = out[out.length - 1]!;
        const n = normalizeWs(last);
        const dupEarlier = out.slice(0, -1).some((b) => normalizeWs(b) === n);
        if (!dupEarlier)
            break;
        out = out.slice(0, -1);
    }
    return out.join("\n\n");
}

/** Headings glued to prior text without newline. */
function insertNewlinesBeforeHeadings(text: string): string {
    return text.replace(/([^\n])(#{1,6}\s)/g, "$1\n$2");
}

/**
 * Prefer final_answer-only messages; drop commentary; if still multiple anonymous messages,
 * keep the last completed one (avoids duplicate full replies).
 */
function selectAssistantMessages(messages: OutputMessage[]): OutputMessage[] {
    const finalAns = messages.filter((m) => m.phase === "final_answer");
    if (finalAns.length > 0)
        return finalAns;
    const hasCommentary = messages.some((m) => m.phase === "commentary");
    if (hasCommentary) {
        const rest = messages.filter((m) => m.phase !== "commentary");
        if (rest.length > 0)
            return rest;
    }
    if (messages.length <= 1)
        return messages;
    const completed = messages.filter((m) => m.status === "completed");
    const pool = completed.length > 0 ? completed : messages;
    return [pool[pool.length - 1]!];
}

export function extractStudyKitResponsesText(response: {
    output?: unknown[];
    output_text?: string | null;
}): string {
    const out = response.output ?? [];
    const messages = out.filter(isAssistantMessage);
    const picked = selectAssistantMessages(messages);

    const pieces: string[] = [];
    for (const m of picked) {
        const chunks = textChunksFromMessage(m);
        if (chunks.length)
            pieces.push(joinChunks(chunks));
    }

    let text = pieces.join("\n\n").trim();
    if (!text)
        text = (response.output_text ?? "").replace(/\r\n/g, "\n").trim();

    return sanitizeStudyKitModelOutput(text);
}

/** One blank line before `##` when the model glued a bullet straight into the next section. */
function ensureBlankLineBeforeH2(text: string): string {
    return text.replace(/([^\n])\n(##\s)/g, "$1\n\n$2");
}

export function sanitizeStudyKitModelOutput(text: string): string {
    let t = text.replace(/\r\n/g, "\n").trim();
    t = insertNewlinesBeforeHeadings(t);
    t = ensureBlankLineBeforeH2(t);
    t = dedupePerfectDouble(t);
    t = dedupeRepeatedTailSections(t);
    return t.trim();
}
