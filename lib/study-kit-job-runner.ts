import OpenAI from "openai";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import {
    extractFromStudyKitParsedForm,
    type StudyKitParsedForm,
} from "@/lib/study-kit-summarize-pipeline";
import {
    summarizeFailedPayload,
    summarizeStudyKitWithOpenAI,
} from "@/lib/study-kit-summarize-openai";
import { SK_LOG, STUDY_KIT_ASYNC_BUCKET } from "@/lib/study-kit-summarize-shared";
import type { StudyKitJobSourcesJson } from "@/lib/study-kit-async-jobs";
import { parseStudyPresets } from "@/lib/study-kit-prompt";

const JOB_LOG = "[study-kit/job]";

function isJobInputMode(m: string): m is StudyKitParsedForm["inputMode"] {
    return m === "file" || m === "paste" || m === "url" || m === "mixed";
}

async function downloadJobFiles(
    sources: StudyKitJobSourcesJson,
): Promise<{ name: string; mime: string; buffer: Buffer }[]> {
    const sb = getSupabaseServiceClient();
    if (!sb)
        throw new Error("SERVER_CONFIG");
    const out: { name: string; mime: string; buffer: Buffer }[] = [];
    for (const f of sources.files) {
        const { data, error } = await sb.storage.from(STUDY_KIT_ASYNC_BUCKET).download(f.storagePath);
        if (error || !data) {
            console.error(JOB_LOG, "download", f.storagePath, error);
            throw new Error("STORAGE_DOWNLOAD_FAILED");
        }
        const buf = Buffer.from(await data.arrayBuffer());
        out.push({ name: f.name, mime: f.mime, buffer: buf });
    }
    return out;
}

async function deleteJobStorageFiles(sources: StudyKitJobSourcesJson): Promise<void> {
    const sb = getSupabaseServiceClient();
    if (!sb || sources.files.length === 0)
        return;
    const paths = sources.files.map((f) => f.storagePath);
    await sb.storage.from(STUDY_KIT_ASYNC_BUCKET).remove(paths);
}

/**
 * Netlify Background Function entry: claim job, OCR+extract, OpenAI, persist result.
 */
export async function processStudyKitSummarizeJob(jobId: string): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error(JOB_LOG, "missing OPENAI_API_KEY");
        return;
    }
    const sb = getSupabaseServiceClient();
    if (!sb) {
        console.error(JOB_LOG, "missing service role");
        return;
    }
    const openai = new OpenAI({ apiKey });

    const { data: claimed, error: claimErr } = await sb
        .from("study_kit_summarize_jobs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("status", "pending")
        .select("id, input_mode, presets_csv, custom_scope, sources_json")
        .maybeSingle();

    if (claimErr) {
        console.error(JOB_LOG, "claim", claimErr);
        return;
    }
    if (!claimed) {
        console.info(JOB_LOG, "skip (not pending)", jobId);
        return;
    }

    const row = claimed as {
        input_mode: string;
        presets_csv: string;
        custom_scope: string;
        sources_json: unknown;
    };
    if (!isJobInputMode(row.input_mode)) {
        await sb
            .from("study_kit_summarize_jobs")
            .update({
                status: "failed",
                error_code: "BAD_JOB",
                error_detail: "invalid input_mode",
                updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        return;
    }

    const sources = row.sources_json as StudyKitJobSourcesJson;
    if (!sources || !Array.isArray(sources.files) || !Array.isArray(sources.urls) || !Array.isArray(sources.pastes)) {
        await sb
            .from("study_kit_summarize_jobs")
            .update({
                status: "failed",
                error_code: "BAD_JOB",
                error_detail: "invalid sources_json",
                updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        return;
    }

    let downloaded: { name: string; mime: string; buffer: Buffer }[] = [];
    try {
        downloaded = await downloadJobFiles(sources);
    }
    catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await sb
            .from("study_kit_summarize_jobs")
            .update({
                status: "failed",
                error_code: msg === "SERVER_CONFIG" ? "SERVER_CONFIG" : "STORAGE_DOWNLOAD_FAILED",
                error_detail: msg,
                updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        return;
    }

    const parsed: StudyKitParsedForm = {
        inputMode: row.input_mode,
        presets: parseStudyPresets(row.presets_csv?.trim() || null, null),
        customScope: row.custom_scope ?? "",
        files: downloaded,
        urls: sources.urls,
        pastes: sources.pastes,
    };

    if (parsed.presets.length === 0) {
        await sb
            .from("study_kit_summarize_jobs")
            .update({
                status: "failed",
                error_code: "NO_FORMAT",
                error_detail: "no output presets",
                updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        await deleteJobStorageFiles(sources);
        return;
    }

    let extracted: Awaited<ReturnType<typeof extractFromStudyKitParsedForm>>;
    try {
        extracted = await extractFromStudyKitParsedForm(parsed, openai);
    }
    catch (e: unknown) {
        const code = e instanceof Error ? e.message : "EXTRACT_FAILED";
        await sb
            .from("study_kit_summarize_jobs")
            .update({
                status: "failed",
                error_code: code.slice(0, 64),
                error_detail: e instanceof Error ? e.message.slice(0, 500) : undefined,
                updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        await deleteJobStorageFiles(sources);
        return;
    }

    console.info(`${SK_LOG} extracted_ok`, {
        jobId,
        sourceChars: extracted.text.length,
        truncated: extracted.truncated,
        label: extracted.fileName.slice(0, 80),
    });

    try {
        const summary = await summarizeStudyKitWithOpenAI(
            openai,
            extracted,
            parsed.presets,
            parsed.customScope,
        );
        console.info(`${SK_LOG} success`, { jobId, summaryChars: summary.length });
        await sb
            .from("study_kit_summarize_jobs")
            .update({
                status: "completed",
                result_summary: summary,
                result_truncated: extracted.truncated,
                result_file_name: extracted.fileName,
                error_code: null,
                error_detail: null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
    }
    catch (err) {
        console.error(`${SK_LOG} openai_failed`, jobId, err);
        const payload = summarizeFailedPayload(err);
        await sb
            .from("study_kit_summarize_jobs")
            .update({
                status: "failed",
                error_code: payload.code,
                error_detail: payload.detail ?? null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
    }
    finally {
        await deleteJobStorageFiles(sources);
    }
}
