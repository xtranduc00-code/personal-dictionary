import { engnovateTranscripts } from "./engnovate-listening-generated/transcripts";
import { cambridge20Test3TranscriptHtml } from "./listening-transcript-cambridge-20-test-3";
import { listeningTranscripts } from "./listening_transcripts";
function splitLongParagraphs(html: string): string {
    const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z])/;
    const MIN_CHARS_TO_SPLIT = 200;
    const P_TAG = /<p([^>]*)>([\s\S]*?)<\/p>/g;
    return html.replace(P_TAG, (_, attrs, content) => {
        const textLen = content.replace(/<[^>]+>/g, "").length;
        if (textLen < MIN_CHARS_TO_SPLIT)
            return `<p${attrs}>${content}</p>`;
        const parts = content.split(SENTENCE_BOUNDARY).filter((s: string) => s.trim());
        if (parts.length <= 1)
            return `<p${attrs}>${content}</p>`;
        return parts.map((p: string) => `<p${attrs}>${p.trim()}</p>`).join("");
    });
}
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function extractSectionPlain(full: string, partNum: number): string {
    const cleaned = full.replace(/\r/g, "");
    const re = new RegExp(`\\n\\s*SECTION\\s*${partNum}\\s*\\n`, "gi");
    let lastEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
        lastEnd = m.index + m[0].length;
    }
    if (lastEnd < 0)
        return "";
    const rest = cleaned.slice(lastEnd);
    const reEnd = new RegExp(`\\n\\s*SECTION\\s*${partNum + 1}\\s*\\n`, "i");
    const em = rest.match(reEnd);
    let body = em ? rest.slice(0, em.index) : rest;
    body = body
        .replace(/^\s*https?:\/\/\S+\s*$/gm, "")
        .replace(/\n{4,}/g, "\n\n")
        .trim();
    body = body.replace(/\nCam\s+\d+\s+Listening Test[\s\S]*$/i, "").trim();
    return body;
}
function plainSectionToHtml(partNum: number, plainBody: string): string | undefined {
    if (!plainBody || plainBody.length < 15)
        return undefined;
    const lines = plainBody.split("\n");
    const paragraphs: string[] = [];
    for (const line of lines) {
        const t = line.replace(/\u00a0/g, " ").trim();
        if (!t)
            continue;
        paragraphs.push(`<p>${escapeHtml(t)}</p>`);
    }
    if (!paragraphs.length)
        return undefined;
    return `<div id="ielts-listening-transcript-${partNum}" class="ielts-listening-transcript">${paragraphs.join("")}</div>`;
}
function getTranscriptFromListeningTranscriptsFile(setId: string, testId: string, part: number): string | undefined {
    const pipeKey = `${setId}|${testId}` as keyof typeof listeningTranscripts;
    const raw = listeningTranscripts[pipeKey];
    if (typeof raw !== "string" || !raw)
        return undefined;
    const section = extractSectionPlain(raw, part);
    const html = plainSectionToHtml(part, section);
    return html ? splitLongParagraphs(html) : undefined;
}
function engnovatePartHtml(setId: string, testId: string, part: number): string | undefined {
    const key = `${setId}:${testId}`;
    const full =
        setId === "cambridge-20" && testId === "test-3"
            ? cambridge20Test3TranscriptHtml
            : engnovateTranscripts[key];
    if (!full)
        return undefined;
    const id = `ielts-listening-transcript-${part}`;
    const regex = new RegExp(`<div id="${id}"[\\s\\S]*?(?=<div id="ielts-listening-transcript-|$)`);
    const match = full.match(regex);
    const raw = match ? match[0] : undefined;
    if (!raw)
        return undefined;
    const textOnly = raw.replace(/<[^>]+>/g, "").trim();
    if (textOnly.length < 25)
        return undefined;
    return splitLongParagraphs(raw);
}
export function getListeningTranscriptHtml(setId: string, testId: string, part: number): string | undefined {
    const fromFile = getTranscriptFromListeningTranscriptsFile(setId, testId, part);
    if (fromFile)
        return fromFile;
    return engnovatePartHtml(setId, testId, part);
}
