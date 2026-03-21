import { randomUUID } from "crypto";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import {
    presetsToCsv,
    type StudyKitParsedForm,
} from "@/lib/study-kit-summarize-pipeline";
import { sanitizeJobFileName, STUDY_KIT_ASYNC_BUCKET } from "@/lib/study-kit-summarize-shared";

export type StudyKitJobSourcesJson = {
    files: { storagePath: string; name: string; mime: string }[];
    urls: string[];
    pastes: string[];
};

/** Netlify deploy + service role + shared secret + background function URL. */
export function studyKitAsyncPipelineEnabled(): boolean {
    if (process.env.STUDY_KIT_FORCE_SYNC === "true" || process.env.STUDY_KIT_FORCE_SYNC === "1")
        return false;
    if (process.env.NETLIFY !== "true")
        return false;
    if (!process.env.STUDY_KIT_INTERNAL_SECRET?.trim())
        return false;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
        return false;
    return true;
}

async function removeStoragePaths(paths: string[]): Promise<void> {
    const sb = getSupabaseServiceClient();
    if (!sb || paths.length === 0)
        return;
    await sb.storage.from(STUDY_KIT_ASYNC_BUCKET).remove(paths);
}

export async function enqueueStudyKitSummarizeJob(
    userId: string,
    data: StudyKitParsedForm,
): Promise<
    | { ok: true; jobId: string }
    | { ok: false; code: string; status: number }
> {
    const sb = getSupabaseServiceClient();
    if (!sb)
        return { ok: false, code: "SERVER_CONFIG", status: 500 };
    const jobId = randomUUID();
    const basePath = `${userId}/${jobId}`;
    const uploadedPaths: string[] = [];
    const filesMeta: StudyKitJobSourcesJson["files"] = [];
    try {
        for (let i = 0; i < data.files.length; i++) {
            const f = data.files[i]!;
            const safe = sanitizeJobFileName(f.name || "document");
            const storagePath = `${basePath}/f${i}-${safe}`;
            const { error: upErr } = await sb.storage
                .from(STUDY_KIT_ASYNC_BUCKET)
                .upload(storagePath, f.buffer, {
                    contentType: f.mime || "application/octet-stream",
                    upsert: false,
                });
            if (upErr) {
                console.error("[study-kit/async] storage upload", upErr);
                await removeStoragePaths(uploadedPaths);
                return { ok: false, code: "STORAGE_UPLOAD_FAILED", status: 500 };
            }
            uploadedPaths.push(storagePath);
            filesMeta.push({
                storagePath,
                name: f.name || "document",
                mime: f.mime || "",
            });
        }
        const sourcesJson: StudyKitJobSourcesJson = {
            files: filesMeta,
            urls: data.urls,
            pastes: data.pastes,
        };
        const { error: insErr } = await sb.from("study_kit_summarize_jobs").insert({
            id: jobId,
            user_id: userId,
            status: "pending",
            input_mode: data.inputMode,
            presets_csv: presetsToCsv(data.presets),
            custom_scope: data.customScope,
            sources_json: sourcesJson,
        });
        if (insErr) {
            console.error("[study-kit/async] insert job", insErr);
            await removeStoragePaths(uploadedPaths);
            return { ok: false, code: "JOB_CREATE_FAILED", status: 500 };
        }
    }
    catch (e) {
        console.error("[study-kit/async] enqueue", e);
        await removeStoragePaths(uploadedPaths);
        return { ok: false, code: "JOB_CREATE_FAILED", status: 500 };
    }
    void triggerStudyKitSummarizeBackground(jobId);
    return { ok: true, jobId };
}

export async function triggerStudyKitSummarizeBackground(jobId: string): Promise<void> {
    const secret = process.env.STUDY_KIT_INTERNAL_SECRET?.trim();
    if (!secret) {
        console.error("[study-kit/async] missing STUDY_KIT_INTERNAL_SECRET");
        return;
    }
    const base = (
        process.env.URL
        || process.env.DEPLOY_PRIME_URL
        || process.env.NEXT_PUBLIC_SITE_URL
        || ""
    ).replace(/\/$/, "");
    if (!base) {
        console.error("[study-kit/async] missing URL / NEXT_PUBLIC_SITE_URL for background trigger");
        return;
    }
    const url = `${base}/.netlify/functions/study-kit-summarize-background`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Study-Kit-Internal-Secret": secret,
            },
            body: JSON.stringify({ jobId }),
        });
        if (!res.ok)
            console.error("[study-kit/async] trigger HTTP", res.status);
    }
    catch (e) {
        console.error("[study-kit/async] trigger fetch", e);
    }
}
