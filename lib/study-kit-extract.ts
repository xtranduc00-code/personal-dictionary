import "./study-kit-pdfjs-polyfill";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PDFParse } from "pdf-parse";

const MAX_EXTRACT_CHARS = 120_000;
/** After merging multiple uploads / URLs, cap total text sent to the model. */
const MAX_COMBINED_SOURCE_CHARS = 200_000;

export type ExtractedDocument = {
    text: string;
    truncated: boolean;
    fileName: string;
};

/** Split textarea input: one URL per line and/or comma- or semicolon-separated; deduped in order. */
export function parseSourceUrlList(raw: string): string[] {
    const parts = raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of parts) {
        if (seen.has(u))
            continue;
        seen.add(u);
        out.push(u);
    }
    return out;
}

export function combineExtractedDocuments(parts: ExtractedDocument[]): ExtractedDocument {
    if (parts.length === 0) {
        const err = new Error("NO_PARTS");
        throw err;
    }
    if (parts.length === 1)
        return parts[0]!;
    const chunks: string[] = [];
    let truncated = parts.some((p) => p.truncated);
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!;
        chunks.push(`### Source ${i + 1}: ${p.fileName}\n\n${p.text}`);
    }
    let text = chunks.join("\n\n---\n\n");
    if (text.length > MAX_COMBINED_SOURCE_CHARS) {
        text = text.slice(0, MAX_COMBINED_SOURCE_CHARS);
        truncated = true;
    }
    return {
        text,
        truncated,
        fileName: `${parts.length} sources`,
    };
}

export function toExtractedDocument(raw: string, fileName: string): ExtractedDocument {
    const cleaned = raw.replace(/\u0000/g, "").trim();
    if (!cleaned) {
        const err = new Error("EMPTY_TEXT");
        throw err;
    }
    const { text, truncated } = truncate(cleaned);
    return { text, truncated, fileName };
}

function truncate(raw: string): { text: string; truncated: boolean } {
    const t = raw.replace(/\u0000/g, "").trim();
    if (t.length <= MAX_EXTRACT_CHARS)
        return { text: t, truncated: false };
    return { text: t.slice(0, MAX_EXTRACT_CHARS), truncated: true };
}

async function extractPptxText(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
        .sort((a, b) => {
            const na = parseInt(/\d+/.exec(a)?.[0] ?? "0", 10);
            const nb = parseInt(/\d+/.exec(b)?.[0] ?? "0", 10);
            return na - nb;
        });
    const chunks: string[] = [];
    for (const p of slidePaths) {
        const f = zip.file(p);
        if (!f)
            continue;
        const xml = await f.async("string");
        for (const m of xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)) {
            const s = m[1]?.trim();
            if (s)
                chunks.push(s);
        }
    }
    return chunks.join(" ");
}

async function extractDocxText(buffer: Buffer): Promise<string> {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return value ?? "";
}

function extractXlsxText(buffer: Buffer): string {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        if (!sheet)
            continue;
        parts.push(`## ${name}\n`, XLSX.utils.sheet_to_csv(sheet));
    }
    return parts.join("\n");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
        const result = await parser.getText();
        return result.text ?? "";
    }
    finally {
        await parser.destroy();
    }
}

/** Plain pasted text (Word/HTML stripped by client is ideal); same length limits as file extract. */
export function preparePlainText(raw: string, fileName: string): ExtractedDocument {
    const cleaned = raw.replace(/\u0000/g, "").trim();
    if (!cleaned) {
        const err = new Error("EMPTY_TEXT");
        throw err;
    }
    const { text, truncated } = truncate(cleaned);
    return { text, truncated, fileName: fileName.trim() || "pasted.txt" };
}

export async function extractDocumentText(buffer: Buffer, fileName: string, mime: string): Promise<ExtractedDocument> {
    const lower = fileName.toLowerCase();
    let raw = "";
    if (lower.endsWith(".txt") || mime === "text/plain") {
        raw = buffer.toString("utf8");
    }
    else if (lower.endsWith(".pdf") || mime === "application/pdf") {
        raw = await extractPdfText(buffer);
    }
    else if (lower.endsWith(".pptx") ||
        mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
        raw = await extractPptxText(buffer);
    }
    else if (lower.endsWith(".docx") ||
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        raw = await extractDocxText(buffer);
    }
    else if (lower.endsWith(".xlsx") ||
        mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
        raw = extractXlsxText(buffer);
    }
    else {
        const err = new Error("UNSUPPORTED_TYPE");
        throw err;
    }
    raw = raw.replace(/\u0000/g, "").trim();
    if (!raw) {
        const isPdf = lower.endsWith(".pdf") || mime === "application/pdf";
        const err = new Error(isPdf ? "PDF_NO_TEXT" : "EMPTY_TEXT");
        throw err;
    }
    const { text, truncated } = truncate(raw);
    return { text, truncated, fileName };
}
