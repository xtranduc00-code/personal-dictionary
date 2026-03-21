import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/get-auth-user";
import { enqueueStudyKitSummarizeJob, studyKitAsyncPipelineEnabled } from "@/lib/study-kit-async-jobs";
import {
    extractFromStudyKitParsedForm,
    parseStudyKitSummarizeForm,
} from "@/lib/study-kit-summarize-pipeline";
import {
    summarizeFailedPayload,
    summarizeStudyKitWithOpenAI,
} from "@/lib/study-kit-summarize-openai";
import { SK_LOG } from "@/lib/study-kit-summarize-shared";

const SYNC_EXTRACT_CLIENT_CODES = new Set([
    "UNSUPPORTED_TYPE",
    "EMPTY_TEXT",
    "PDF_NO_TEXT",
    "OCR_FAILED",
    "URL_INVALID",
    "URL_BLOCKED",
    "URL_TOO_LARGE",
    "URL_FETCH_FAILED",
    "EXTRACT_FAILED",
]);

export const runtime = "nodejs";
/** Vision OCR on many PDF pages can exceed 120s; async pipeline avoids sync wall time on Netlify. */
export const maxDuration = 300;

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
        return NextResponse.json({ code: "SERVER_CONFIG" }, { status: 500 });

    let form: FormData;
    try {
        form = await req.formData();
    }
    catch {
        return NextResponse.json({ code: "BAD_FORM" }, { status: 400 });
    }

    const parsed = await parseStudyKitSummarizeForm(form);
    if (!parsed.ok)
        return NextResponse.json({ code: parsed.err.code }, { status: parsed.err.status });

    const useAsyncPipeline = studyKitAsyncPipelineEnabled();
    console.info(`${SK_LOG} start`, {
        inputMode: parsed.data.inputMode,
        presets: parsed.data.presets.join(","),
        async: useAsyncPipeline,
    });

    if (useAsyncPipeline) {
        const q = await enqueueStudyKitSummarizeJob(user.id, parsed.data);
        if (!q.ok)
            return NextResponse.json({ code: q.code }, { status: q.status });
        return NextResponse.json({ jobId: q.jobId, async: true }, { status: 202 });
    }

    const openai = new OpenAI({ apiKey });
    let extracted: Awaited<ReturnType<typeof extractFromStudyKitParsedForm>>;
    try {
        extracted = await extractFromStudyKitParsedForm(parsed.data, openai);
    }
    catch (e: unknown) {
        const code = e instanceof Error ? e.message : "EXTRACT_FAILED";
        if (SYNC_EXTRACT_CLIENT_CODES.has(code))
            return NextResponse.json({ code }, { status: 400 });
        console.error(`${SK_LOG} extract_error`, e);
        return NextResponse.json({ code: "EXTRACT_FAILED" }, { status: 400 });
    }

    console.info(`${SK_LOG} extracted_ok`, {
        sourceChars: extracted.text.length,
        truncated: extracted.truncated,
        label: extracted.fileName.slice(0, 80),
    });

    try {
        const summary = await summarizeStudyKitWithOpenAI(
            openai,
            extracted,
            parsed.data.presets,
            parsed.data.customScope,
        );
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
