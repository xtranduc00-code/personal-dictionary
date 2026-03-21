import type OpenAI from "openai";
import {
    combineExtractedDocuments,
    parseSourceUrlList,
    preparePlainText,
    type ExtractedDocument,
} from "@/lib/study-kit-extract";
import { fetchDocumentFromUrl } from "@/lib/study-kit-fetch-url";
import { extractStudyKitSource } from "@/lib/study-kit-source-with-ocr";
import { parseStudyPresets, parseStudyQuizDepth, type StudyPreset, type StudyQuizDepth } from "@/lib/study-kit-prompt";
import {
    MAX_CUSTOM_SCOPE_CHARS,
    MAX_FILE_BYTES,
    MAX_PASTE_CHARS,
    MAX_SOURCES,
    SK_LOG,
    parseInputMode,
} from "@/lib/study-kit-summarize-shared";

export type StudyKitParsedForm = {
    inputMode: "file" | "paste" | "url" | "mixed";
    presets: StudyPreset[];
    quizDepth: StudyQuizDepth;
    customScope: string;
    files: { name: string; mime: string; buffer: Buffer }[];
    urls: string[];
    pastes: string[];
};

export type ParseFormError = { code: string; status: number };

/**
 * Validate FormData and materialize files into buffers (same rules as sync POST).
 */
export async function parseStudyKitSummarizeForm(
    form: FormData,
): Promise<{ ok: true; data: StudyKitParsedForm } | { ok: false; err: ParseFormError }> {
    const inputMode = parseInputMode(form);
    const presetsField = typeof form.get("presets") === "string" ? form.get("presets") as string : "";
    const legacyPreset = typeof form.get("preset") === "string" ? form.get("preset") as string : null;
    const presets = parseStudyPresets(presetsField.trim() || null, legacyPreset);
    const quizDepthField =
        typeof form.get("quizDepth") === "string" ? (form.get("quizDepth") as string) : "";
    const quizDepth = parseStudyQuizDepth(quizDepthField.trim() || null);
    const customScopeRaw = typeof form.get("customScope") === "string" ? form.get("customScope") as string : (typeof form.get("lectureContext") === "string" ? form.get("lectureContext") as string : "");
    const customScope = customScopeRaw.trim().slice(0, MAX_CUSTOM_SCOPE_CHARS);

    if (inputMode === "mixed") {
        const rawFiles = form.getAll("file").filter((x): x is File => x instanceof File);
        const sourceUrlsField =
            typeof form.get("sourceUrls") === "string" ? (form.get("sourceUrls") as string) : "";
        const urlList = parseSourceUrlList(sourceUrlsField.trim());
        const chunkFields = form.getAll("pastedChunk").filter((x): x is string => typeof x === "string");
        const pastedChunks = chunkFields.map((s) => s.trim()).filter(Boolean);
        const legacyPaste =
            typeof form.get("pastedText") === "string" ? (form.get("pastedText") as string).trim() : "";
        if (legacyPaste)
            pastedChunks.push(legacyPaste);
        const pasteCount = pastedChunks.length;
        const nSources = rawFiles.length + urlList.length + pasteCount;
        if (nSources === 0)
            return { ok: false, err: { code: "NO_SOURCES", status: 400 } };
        if (nSources > MAX_SOURCES)
            return { ok: false, err: { code: "TOO_MANY_SOURCES", status: 400 } };
        for (const u of urlList) {
            try {
                const parsed = new URL(u);
                if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
                    return { ok: false, err: { code: "URL_INVALID", status: 400 } };
            }
            catch {
                return { ok: false, err: { code: "URL_INVALID", status: 400 } };
            }
        }
        const files: { name: string; mime: string; buffer: Buffer }[] = [];
        for (const file of rawFiles) {
            if (file.size > MAX_FILE_BYTES)
                return { ok: false, err: { code: "FILE_TOO_LARGE", status: 413 } };
            files.push({
                name: file.name || "document",
                mime: file.type || "",
                buffer: Buffer.from(await file.arrayBuffer()),
            });
        }
        const pastes = pastedChunks.map((p) => p.slice(0, MAX_PASTE_CHARS));
        return {
            ok: true,
            data: {
                inputMode: "mixed",
                presets,
                quizDepth,
                customScope,
                files,
                urls: urlList,
                pastes,
            },
        };
    }
    if (inputMode === "paste") {
        const pastedRaw = typeof form.get("pastedText") === "string" ? form.get("pastedText") as string : "";
        const pasted = pastedRaw.trim();
        if (!pasted)
            return { ok: false, err: { code: "NO_PASTE", status: 400 } };
        return {
            ok: true,
            data: {
                inputMode: "paste",
                presets,
                quizDepth,
                customScope,
                files: [],
                urls: [],
                pastes: [pasted.slice(0, MAX_PASTE_CHARS)],
            },
        };
    }
    if (inputMode === "url") {
        const sourceUrlsField =
            typeof form.get("sourceUrls") === "string" ? (form.get("sourceUrls") as string) : "";
        const legacySingle =
            typeof form.get("sourceUrl") === "string" ? (form.get("sourceUrl") as string).trim() : "";
        const urlList = parseSourceUrlList(sourceUrlsField.trim() || legacySingle);
        if (urlList.length === 0)
            return { ok: false, err: { code: "NO_URL", status: 400 } };
        if (urlList.length > MAX_SOURCES)
            return { ok: false, err: { code: "TOO_MANY_SOURCES", status: 400 } };
        return {
            ok: true,
            data: {
                inputMode: "url",
                presets,
                quizDepth,
                customScope,
                files: [],
                urls: urlList,
                pastes: [],
            },
        };
    }
    const rawFiles = form.getAll("file");
    const fileList = rawFiles.filter((x): x is File => x instanceof File);
    if (fileList.length === 0)
        return { ok: false, err: { code: "NO_FILE", status: 400 } };
    if (fileList.length > MAX_SOURCES)
        return { ok: false, err: { code: "TOO_MANY_SOURCES", status: 400 } };
    const files: { name: string; mime: string; buffer: Buffer }[] = [];
    for (const file of fileList) {
        if (file.size > MAX_FILE_BYTES)
            return { ok: false, err: { code: "FILE_TOO_LARGE", status: 413 } };
        files.push({
            name: file.name || "document",
            mime: file.type || "",
            buffer: Buffer.from(await file.arrayBuffer()),
        });
    }
    return {
        ok: true,
        data: {
            inputMode: "file",
            presets,
            quizDepth,
            customScope,
            files,
            urls: [],
            pastes: [],
        },
    };
}

function mapExtractMessageToHttp(msg: string): ParseFormError | null {
    if (msg === "UNSUPPORTED_TYPE")
        return { code: "UNSUPPORTED_TYPE", status: 400 };
    if (msg === "EMPTY_TEXT")
        return { code: "EMPTY_TEXT", status: 400 };
    if (msg === "PDF_NO_TEXT")
        return { code: "PDF_NO_TEXT", status: 400 };
    if (msg === "OCR_FAILED")
        return { code: "OCR_FAILED", status: 400 };
    return null;
}

/**
 * OCR + merge sources into one extracted document (throws Error with message = client code when known).
 */
export async function extractFromStudyKitParsedForm(
    data: StudyKitParsedForm,
    openai: OpenAI,
): Promise<ExtractedDocument> {
    const { inputMode, files, urls, pastes } = data;

    if (inputMode === "mixed") {
        const parts: ExtractedDocument[] = [];
        for (const file of files) {
            try {
                parts.push(
                    await extractStudyKitSource(
                        file.buffer,
                        file.name || "document",
                        file.mime || "",
                        openai,
                    ),
                );
            }
            catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                const mapped = mapExtractMessageToHttp(msg);
                if (mapped)
                    throw new Error(mapped.code);
                console.error(`${SK_LOG} extract_error`, e);
                throw new Error("EXTRACT_FAILED");
            }
        }
        for (const sourceUrl of urls) {
            let fetched: Awaited<ReturnType<typeof fetchDocumentFromUrl>>;
            try {
                fetched = await fetchDocumentFromUrl(sourceUrl);
            }
            catch (e: unknown) {
                const code = e instanceof Error ? e.message : "";
                if (code === "URL_EMPTY" || code === "URL_INVALID" || code === "URL_PROTOCOL")
                    throw new Error("URL_INVALID");
                if (code === "URL_HOST_BLOCKED")
                    throw new Error("URL_BLOCKED");
                if (code === "URL_TOO_LARGE")
                    throw new Error("URL_TOO_LARGE");
                console.error(`${SK_LOG} url_fetch_error`, e);
                throw new Error("URL_FETCH_FAILED");
            }
            try {
                parts.push(
                    await extractStudyKitSource(
                        fetched.buffer,
                        fetched.fileName,
                        fetched.contentType,
                        openai,
                    ),
                );
            }
            catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                const mapped = mapExtractMessageToHttp(msg);
                if (mapped)
                    throw new Error(mapped.code);
                console.error(`${SK_LOG} url_extract_error`, e);
                throw new Error("EXTRACT_FAILED");
            }
        }
        for (let i = 0; i < pastes.length; i++) {
            const clipped = pastes[i]!;
            try {
                parts.push(
                    preparePlainText(
                        clipped,
                        pastes.length > 1 ? `Pasted text ${i + 1}.txt` : "pasted.txt",
                    ),
                );
            }
            catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                if (msg === "EMPTY_TEXT")
                    throw new Error("EMPTY_TEXT");
                throw e;
            }
        }
        return combineExtractedDocuments(parts);
    }
    if (inputMode === "paste") {
        const pasted = pastes[0] ?? "";
        try {
            return preparePlainText(pasted, "pasted.txt");
        }
        catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "";
            if (msg === "EMPTY_TEXT")
                throw new Error("EMPTY_TEXT");
            throw e;
        }
    }
    if (inputMode === "url") {
        const parts: ExtractedDocument[] = [];
        for (const sourceUrl of urls) {
            let fetched: Awaited<ReturnType<typeof fetchDocumentFromUrl>>;
            try {
                fetched = await fetchDocumentFromUrl(sourceUrl);
            }
            catch (e: unknown) {
                const code = e instanceof Error ? e.message : "";
                if (code === "URL_EMPTY" || code === "URL_INVALID" || code === "URL_PROTOCOL")
                    throw new Error("URL_INVALID");
                if (code === "URL_HOST_BLOCKED")
                    throw new Error("URL_BLOCKED");
                if (code === "URL_TOO_LARGE")
                    throw new Error("URL_TOO_LARGE");
                console.error(`${SK_LOG} url_fetch_error`, e);
                throw new Error("URL_FETCH_FAILED");
            }
            try {
                parts.push(
                    await extractStudyKitSource(
                        fetched.buffer,
                        fetched.fileName,
                        fetched.contentType,
                        openai,
                    ),
                );
            }
            catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                const mapped = mapExtractMessageToHttp(msg);
                if (mapped)
                    throw new Error(mapped.code);
                console.error(`${SK_LOG} url_extract_error`, e);
                throw new Error("EXTRACT_FAILED");
            }
        }
        return combineExtractedDocuments(parts);
    }
    const parts: ExtractedDocument[] = [];
    for (const file of files) {
        try {
            parts.push(
                await extractStudyKitSource(
                    file.buffer,
                    file.name || "document",
                    file.mime || "",
                    openai,
                ),
            );
        }
        catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "";
            const mapped = mapExtractMessageToHttp(msg);
            if (mapped)
                throw new Error(mapped.code);
            console.error(`${SK_LOG} extract_error`, e);
            throw new Error("EXTRACT_FAILED");
        }
    }
    return combineExtractedDocuments(parts);
}

export function presetsToCsv(presets: StudyPreset[]): string {
    return presets.join(",");
}
