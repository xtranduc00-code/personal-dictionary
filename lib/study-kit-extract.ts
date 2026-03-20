import JSZip from "jszip";
import { PDFParse } from "pdf-parse";

const MAX_EXTRACT_CHARS = 120_000;

export type ExtractedDocument = {
    text: string;
    truncated: boolean;
    fileName: string;
};

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
    else {
        const err = new Error("UNSUPPORTED_TYPE");
        throw err;
    }
    raw = raw.replace(/\u0000/g, "").trim();
    if (!raw) {
        const err = new Error("EMPTY_TEXT");
        throw err;
    }
    const { text, truncated } = truncate(raw);
    return { text, truncated, fileName };
}
