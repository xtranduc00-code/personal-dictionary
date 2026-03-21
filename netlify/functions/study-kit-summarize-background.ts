import type { Handler } from "@netlify/functions";
import { processStudyKitSummarizeJob } from "../../lib/study-kit-job-runner";

/**
 * Netlify Background Function: 202 to caller, then up to ~15m for OCR + OpenAI.
 * Requires STUDY_KIT_INTERNAL_SECRET, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, table + Storage bucket (see scripts/sql).
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== "POST")
        return { statusCode: 405, body: "Method Not Allowed" };
    const secret = process.env.STUDY_KIT_INTERNAL_SECRET?.trim();
    const header =
        event.headers["x-study-kit-internal-secret"]
        ?? event.headers["X-Study-Kit-Internal-Secret"];
    if (!secret || header !== secret)
        return { statusCode: 401, body: "Unauthorized" };
    let parsed: { jobId?: string };
    try {
        parsed = JSON.parse(event.body || "{}") as { jobId?: string };
    }
    catch {
        return { statusCode: 400, body: "Bad JSON" };
    }
    const jobId = parsed.jobId?.trim();
    if (!jobId)
        return { statusCode: 400, body: "Missing jobId" };

    await processStudyKitSummarizeJob(jobId);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
