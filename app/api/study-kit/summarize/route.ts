import { NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";
import { getAuthUser } from "@/lib/get-auth-user";
import {
    combineExtractedDocuments,
    parseSourceUrlList,
    preparePlainText,
    type ExtractedDocument,
} from "@/lib/study-kit-extract";
import { fetchDocumentFromUrl } from "@/lib/study-kit-fetch-url";
import { extractStudyKitSource } from "@/lib/study-kit-source-with-ocr";
import {
    buildExamRevisionSystemMessage,
    parseStudyPresets,
    studyKitMaxOutputTokens,
} from "@/lib/study-kit-prompt";
import {
    chatCompletionAssistantText,
    extractStudyKitResponsesText,
    sanitizeStudyKitModelOutput,
} from "@/lib/study-kit-response-text";

export const runtime = "nodejs";
/** Vision OCR on many PDF pages can exceed 120s; lower STUDY_KIT_OCR_MAX_PAGES if your host caps duration. */
export const maxDuration = 300;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES = 10;
/** Hard cap on pasted characters before server-side truncate pipeline. */
const MAX_PASTE_CHARS = 400_000;
const MAX_CUSTOM_SCOPE_CHARS = 3000;
/** Netlify/Vercel: search Functions logs for this string to find Exam Notes generate runs. */
const SK_LOG = "[study-kit/summarize]";
const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh"] as const;
type StudyKitReasoningEffort = (typeof REASONING_EFFORTS)[number];
const VERBOSITIES = ["low", "medium", "high"] as const;
type StudyKitVerbosity = (typeof VERBOSITIES)[number];

function studyKitReasoningEffort(): StudyKitReasoningEffort {
    const raw = process.env.STUDY_KIT_REASONING_EFFORT?.trim().toLowerCase();
    if (raw && (REASONING_EFFORTS as readonly string[]).includes(raw))
        return raw as StudyKitReasoningEffort;
    /** Default `medium`: balance vs `low` (faster, thinner) and `high`/`xhigh` (slow). */
    return "medium";
}

function studyKitVerbosity(): StudyKitVerbosity {
    const raw = process.env.STUDY_KIT_VERBOSITY?.trim().toLowerCase();
    if (raw && (VERBOSITIES as readonly string[]).includes(raw))
        return raw as StudyKitVerbosity;
    return "medium";
}

/** GPT-5 family expects the Responses API (reasoning / verbosity). Others use Chat Completions. */
function useResponsesApiForModel(model: string): boolean {
    return /^gpt-5/i.test(model.trim());
}

/** After GPT-5 Responses or as chat-only default: strong → fast. */
const CHAT_MODEL_FALLBACKS = ["gpt-4o", "gpt-4.1", "gpt-4o-mini"] as const;

function summarizeFailedPayload(err: unknown): { code: string; detail?: string } {
    const dev = process.env.NODE_ENV === "development";
    if (err instanceof APIError) {
        return {
            code: "SUMMARIZE_FAILED",
            detail: dev
                ? `${err.status ?? "?"} ${err.message}`
                : err.status === 401 || err.status === 403
                  ? "OpenAI rejected the API key (check OPENAI_API_KEY)."
                  : err.status === 429
                    ? "OpenAI quota or rate limit — check billing at platform.openai.com or retry shortly."
                    : err.message
                      ? err.message.slice(0, 280)
                      : undefined,
        };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
        code: "SUMMARIZE_FAILED",
        detail: dev
            ? msg
            : msg.includes("empty") || msg.includes("assistant")
              ? "The model returned no text. Set STUDY_KIT_OPENAI_MODEL=gpt-4o or check OpenAI status."
              : msg.slice(0, 200),
    };
}

function parseInputMode(form: FormData): "file" | "paste" | "url" | "mixed" {
    const m = typeof form.get("inputMode") === "string" ? (form.get("inputMode") as string).trim() : "";
    if (m === "mixed")
        return "mixed";
    if (m === "paste")
        return "paste";
    if (m === "url")
        return "url";
    return "file";
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
        return NextResponse.json({ code: "SERVER_CONFIG" }, { status: 500 });
    const openai = new OpenAI({ apiKey });
    let form: FormData;
    try {
        form = await req.formData();
    }
    catch {
        return NextResponse.json({ code: "BAD_FORM" }, { status: 400 });
    }
    const inputMode = parseInputMode(form);
    const presetsField = typeof form.get("presets") === "string" ? form.get("presets") as string : "";
    const legacyPreset = typeof form.get("preset") === "string" ? form.get("preset") as string : null;
    const presets = parseStudyPresets(presetsField.trim() || null, legacyPreset);
    const customScopeRaw = typeof form.get("customScope") === "string" ? form.get("customScope") as string : (typeof form.get("lectureContext") === "string" ? form.get("lectureContext") as string : "");
    const customScope = customScopeRaw.trim().slice(0, MAX_CUSTOM_SCOPE_CHARS);

    console.info(`${SK_LOG} start`, { inputMode, presets: presets.join(",") });

    let extracted: ExtractedDocument | ReturnType<typeof preparePlainText>;

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
            return NextResponse.json({ code: "NO_SOURCES" }, { status: 400 });
        if (nSources > MAX_SOURCES)
            return NextResponse.json({ code: "TOO_MANY_SOURCES" }, { status: 400 });
        console.info(`${SK_LOG} sources`, {
            files: rawFiles.length,
            urls: urlList.length,
            pastes: pasteCount,
        });
        for (const u of urlList) {
            try {
                const parsed = new URL(u);
                if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
                    return NextResponse.json({ code: "URL_INVALID" }, { status: 400 });
            }
            catch {
                return NextResponse.json({ code: "URL_INVALID" }, { status: 400 });
            }
        }
        const parts: ExtractedDocument[] = [];
        for (const file of rawFiles) {
            if (file.size > MAX_FILE_BYTES)
                return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 });
            const buffer = Buffer.from(await file.arrayBuffer());
            try {
                parts.push(
                    await extractStudyKitSource(
                        buffer,
                        file.name || "document",
                        file.type || "",
                        openai,
                    ),
                );
            }
            catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                if (msg === "UNSUPPORTED_TYPE")
                    return NextResponse.json({ code: "UNSUPPORTED_TYPE" }, { status: 400 });
                if (msg === "EMPTY_TEXT")
                    return NextResponse.json({ code: "EMPTY_TEXT" }, { status: 400 });
                if (msg === "PDF_NO_TEXT")
                    return NextResponse.json({ code: "PDF_NO_TEXT" }, { status: 400 });
                if (msg === "OCR_FAILED")
                    return NextResponse.json({ code: "OCR_FAILED" }, { status: 400 });
                console.error(`${SK_LOG} extract_error`, e);
                return NextResponse.json({ code: "EXTRACT_FAILED" }, { status: 400 });
            }
        }
        for (const sourceUrl of urlList) {
            let fetched: Awaited<ReturnType<typeof fetchDocumentFromUrl>>;
            try {
                fetched = await fetchDocumentFromUrl(sourceUrl);
            }
            catch (e: unknown) {
                const code = e instanceof Error ? e.message : "";
                if (code === "URL_EMPTY" || code === "URL_INVALID" || code === "URL_PROTOCOL")
                    return NextResponse.json({ code: "URL_INVALID" }, { status: 400 });
                if (code === "URL_HOST_BLOCKED")
                    return NextResponse.json({ code: "URL_BLOCKED" }, { status: 400 });
                if (code === "URL_TOO_LARGE")
                    return NextResponse.json({ code: "URL_TOO_LARGE" }, { status: 413 });
                console.error(`${SK_LOG} url_fetch_error`, e);
                return NextResponse.json({ code: "URL_FETCH_FAILED" }, { status: 400 });
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
                if (msg === "UNSUPPORTED_TYPE")
                    return NextResponse.json({ code: "UNSUPPORTED_TYPE" }, { status: 400 });
                if (msg === "EMPTY_TEXT")
                    return NextResponse.json({ code: "EMPTY_TEXT" }, { status: 400 });
                if (msg === "PDF_NO_TEXT")
                    return NextResponse.json({ code: "PDF_NO_TEXT" }, { status: 400 });
                if (msg === "OCR_FAILED")
                    return NextResponse.json({ code: "OCR_FAILED" }, { status: 400 });
                console.error(`${SK_LOG} url_extract_error`, e);
                return NextResponse.json({ code: "EXTRACT_FAILED" }, { status: 400 });
            }
        }
        for (let i = 0; i < pastedChunks.length; i++) {
            const clipped = pastedChunks[i]!.slice(0, MAX_PASTE_CHARS);
            try {
                parts.push(
                    preparePlainText(
                        clipped,
                        pastedChunks.length > 1 ? `Pasted text ${i + 1}.txt` : "pasted.txt",
                    ),
                );
            }
            catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                if (msg === "EMPTY_TEXT")
                    return NextResponse.json({ code: "EMPTY_TEXT" }, { status: 400 });
                throw e;
            }
        }
        extracted = combineExtractedDocuments(parts);
    }
    else if (inputMode === "paste") {
        const pastedRaw = typeof form.get("pastedText") === "string" ? form.get("pastedText") as string : "";
        const pasted = pastedRaw.trim();
        if (!pasted)
            return NextResponse.json({ code: "NO_PASTE" }, { status: 400 });
        const clipped = pasted.slice(0, MAX_PASTE_CHARS);
        try {
            extracted = preparePlainText(clipped, "pasted.txt");
        }
        catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "";
            if (msg === "EMPTY_TEXT")
                return NextResponse.json({ code: "EMPTY_TEXT" }, { status: 400 });
            throw e;
        }
    }
    else if (inputMode === "url") {
        const sourceUrlsField =
            typeof form.get("sourceUrls") === "string" ? (form.get("sourceUrls") as string) : "";
        const legacySingle =
            typeof form.get("sourceUrl") === "string" ? (form.get("sourceUrl") as string).trim() : "";
        const urlList = parseSourceUrlList(sourceUrlsField.trim() || legacySingle);
        if (urlList.length === 0)
            return NextResponse.json({ code: "NO_URL" }, { status: 400 });
        if (urlList.length > MAX_SOURCES)
            return NextResponse.json({ code: "TOO_MANY_SOURCES" }, { status: 400 });
        const parts: ExtractedDocument[] = [];
        for (const sourceUrl of urlList) {
            let fetched: Awaited<ReturnType<typeof fetchDocumentFromUrl>>;
            try {
                fetched = await fetchDocumentFromUrl(sourceUrl);
            }
            catch (e: unknown) {
                const code = e instanceof Error ? e.message : "";
                if (code === "URL_EMPTY" || code === "URL_INVALID" || code === "URL_PROTOCOL")
                    return NextResponse.json({ code: "URL_INVALID" }, { status: 400 });
                if (code === "URL_HOST_BLOCKED")
                    return NextResponse.json({ code: "URL_BLOCKED" }, { status: 400 });
                if (code === "URL_TOO_LARGE")
                    return NextResponse.json({ code: "URL_TOO_LARGE" }, { status: 413 });
                console.error(`${SK_LOG} url_fetch_error`, e);
                return NextResponse.json({ code: "URL_FETCH_FAILED" }, { status: 400 });
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
                if (msg === "UNSUPPORTED_TYPE")
                    return NextResponse.json({ code: "UNSUPPORTED_TYPE" }, { status: 400 });
                if (msg === "EMPTY_TEXT")
                    return NextResponse.json({ code: "EMPTY_TEXT" }, { status: 400 });
                if (msg === "PDF_NO_TEXT")
                    return NextResponse.json({ code: "PDF_NO_TEXT" }, { status: 400 });
                if (msg === "OCR_FAILED")
                    return NextResponse.json({ code: "OCR_FAILED" }, { status: 400 });
                console.error(`${SK_LOG} url_extract_error`, e);
                return NextResponse.json({ code: "EXTRACT_FAILED" }, { status: 400 });
            }
        }
        extracted = combineExtractedDocuments(parts);
    }
    else {
        const rawFiles = form.getAll("file");
        const files = rawFiles.filter((x): x is File => x instanceof File);
        if (files.length === 0)
            return NextResponse.json({ code: "NO_FILE" }, { status: 400 });
        if (files.length > MAX_SOURCES)
            return NextResponse.json({ code: "TOO_MANY_SOURCES" }, { status: 400 });
        const parts: ExtractedDocument[] = [];
        for (const file of files) {
            if (file.size > MAX_FILE_BYTES)
                return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 });
            const buffer = Buffer.from(await file.arrayBuffer());
            try {
                parts.push(
                    await extractStudyKitSource(
                        buffer,
                        file.name || "document",
                        file.type || "",
                        openai,
                    ),
                );
            }
            catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                if (msg === "UNSUPPORTED_TYPE")
                    return NextResponse.json({ code: "UNSUPPORTED_TYPE" }, { status: 400 });
                if (msg === "EMPTY_TEXT")
                    return NextResponse.json({ code: "EMPTY_TEXT" }, { status: 400 });
                if (msg === "PDF_NO_TEXT")
                    return NextResponse.json({ code: "PDF_NO_TEXT" }, { status: 400 });
                if (msg === "OCR_FAILED")
                    return NextResponse.json({ code: "OCR_FAILED" }, { status: 400 });
                console.error(`${SK_LOG} extract_error`, e);
                return NextResponse.json({ code: "EXTRACT_FAILED" }, { status: 400 });
            }
        }
        extracted = combineExtractedDocuments(parts);
    }

    console.info(`${SK_LOG} extracted_ok`, {
        sourceChars: extracted.text.length,
        truncated: extracted.truncated,
        label: extracted.fileName.slice(0, 80),
    });

    const model =
        process.env.STUDY_KIT_OPENAI_MODEL?.trim() || "gpt-5.4";
    const reasoningEffort = studyKitReasoningEffort();
    const verbosity = studyKitVerbosity();
    const system = buildExamRevisionSystemMessage(presets, customScope || undefined);
    const maxTokens = studyKitMaxOutputTokens(presets);
    const userContent = `Source label: ${extracted.fileName}
${extracted.truncated
        ? "Note: only the beginning of the source was available (length limit).\n"
        : ""}
--- Source text ---
${extracted.text}
--- End ---`;

    async function summarizeChatOnce(completionModel: string): Promise<string> {
        const response = await openai.chat.completions.create({
            model: completionModel,
            temperature: 0.25,
            max_completion_tokens: maxTokens,
            messages: [
                { role: "system", content: system },
                { role: "user", content: userContent },
            ],
        });
        const raw = chatCompletionAssistantText(response.choices?.[0]?.message);
        return sanitizeStudyKitModelOutput(raw);
    }

    async function summarizeChatWithFallback(preferred: string): Promise<string> {
        const order = [preferred, ...CHAT_MODEL_FALLBACKS.filter((m) => m !== preferred)];
        let lastErr: unknown;
        for (const m of order) {
            try {
                const out = await summarizeChatOnce(m);
                if (out)
                    return out;
            }
            catch (e) {
                lastErr = e;
                if (e instanceof APIError) {
                    if (e.status === 401 || e.status === 429)
                        throw e;
                    if (e.status === 400 || e.status === 404 || e.status === 403) {
                        console.warn(`${SK_LOG} chat_model_retry`, m, e.status, e.message);
                        continue;
                    }
                }
                throw e;
            }
        }
        throw lastErr ?? new Error("empty completion");
    }

    console.info(`${SK_LOG} openai_call`, { model, maxTokens });

    try {
        let summary: string;
        if (useResponsesApiForModel(model)) {
            try {
                const response = await openai.responses.create({
                    model,
                    instructions: system,
                    input: userContent,
                    max_output_tokens: maxTokens,
                    reasoning: { effort: reasoningEffort },
                    text: { verbosity },
                });
                if (response.error)
                    throw new Error(response.error.message ?? "response error");
                summary = extractStudyKitResponsesText(response);
                if (!summary)
                    throw new Error("empty assistant output");
            }
            catch (responsesErr) {
                console.warn(`${SK_LOG} responses_failed_fallback_chat`, responsesErr);
                summary = await summarizeChatWithFallback("gpt-4o");
            }
        }
        else {
            summary = await summarizeChatWithFallback(model);
        }

        console.info(`${SK_LOG} success`, { summaryChars: summary.length });

        return NextResponse.json({
            summary,
            truncated: extracted.truncated,
            fileName: extracted.fileName,
        });
    }
    catch (err) {
        console.error(`${SK_LOG} openai_failed`, err);
        const payload = summarizeFailedPayload(err);
        return NextResponse.json(payload, { status: 500 });
    }
}
