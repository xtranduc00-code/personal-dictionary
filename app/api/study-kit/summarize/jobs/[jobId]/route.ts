import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

export const runtime = "nodejs";

type Row = {
    status: string;
    result_summary: string | null;
    result_truncated: boolean | null;
    result_file_name: string | null;
    error_code: string | null;
    error_detail: string | null;
};

/** Poll async Exam Notes job (202 flow). */
export async function GET(
    req: Request,
    ctx: { params: Promise<{ jobId: string }> },
) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { jobId } = await ctx.params;
    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId))
        return NextResponse.json({ code: "BAD_JOB_ID" }, { status: 400 });

    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("study_kit_summarize_jobs")
            .select("status, result_summary, result_truncated, result_file_name, error_code, error_detail")
            .eq("id", jobId)
            .eq("user_id", user.id)
            .maybeSingle();
        if (error)
            throw error;
        if (!data)
            return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
        const row = data as Row;
        const body: Record<string, unknown> = { status: row.status };
        if (row.status === "completed") {
            body.summary = row.result_summary ?? "";
            body.truncated = Boolean(row.result_truncated);
            body.fileName = row.result_file_name ?? "";
        }
        if (row.status === "failed") {
            body.code = row.error_code ?? "FAILED";
            if (row.error_detail)
                body.detail = row.error_detail;
        }
        return NextResponse.json(body);
    }
    catch (e) {
        console.error("[study-kit/summarize/jobs] GET", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}
