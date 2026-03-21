import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { defaultTitleFromMarkdown } from "@/lib/study-kit-saved";
import { sanitizeMetaForStore } from "@/lib/study-kit-session-meta";
import {
    packLegacyFlatMessages,
    packSessionMessages,
    sanitizeSectionThreadsRecord,
    unpackSessionMessages,
} from "@/lib/study-kit-session-messages";
import { supabaseForUserData } from "@/lib/supabase-server";

const MAX_SUMMARY_CHARS = 900_000;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { id } = await ctx.params;
    if (!id)
        return NextResponse.json({ code: "BAD_ID" }, { status: 400 });
    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("study_kit_sessions")
            .select("id,title,summary_markdown,truncated,messages,meta,created_at,updated_at")
            .eq("id", id)
            .eq("user_id", user.id)
            .maybeSingle();
        if (error)
            throw error;
        if (!data)
            return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
        const sectionThreads = unpackSessionMessages(data.messages);
        const meta =
            data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
                ? data.meta
                : {};
        return NextResponse.json({
            session: {
                id: data.id,
                title: data.title,
                summary: data.summary_markdown,
                truncated: Boolean(data.truncated),
                sectionThreads,
                meta,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
            },
        });
    }
    catch (e) {
        console.error("study-kit session GET", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { id } = await ctx.params;
    if (!id)
        return NextResponse.json({ code: "BAD_ID" }, { status: 400 });
    try {
        const body = await req.json().catch(() => ({}));
        const summaryIn =
            typeof body?.summary === "string" ? body.summary.slice(0, MAX_SUMMARY_CHARS) : undefined;
        const metaIn = body?.meta !== undefined ? sanitizeMetaForStore(body.meta) : undefined;

        let messagesPacked: unknown | undefined;
        if (body?.sectionThreads !== undefined)
            messagesPacked = packSessionMessages(sanitizeSectionThreadsRecord(body.sectionThreads));
        else if (body?.messages !== undefined)
            messagesPacked = packLegacyFlatMessages(body.messages);

        if (summaryIn === undefined && metaIn === undefined && messagesPacked === undefined)
            return NextResponse.json({ code: "BAD_BODY" }, { status: 400 });

        const now = new Date().toISOString();
        const db = supabaseForUserData();
        const { data: existing, error: exErr } = await db
            .from("study_kit_sessions")
            .select("id")
            .eq("id", id)
            .eq("user_id", user.id)
            .maybeSingle();
        if (exErr)
            throw exErr;
        if (!existing)
            return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

        const row: Record<string, unknown> = { updated_at: now };
        if (summaryIn !== undefined) {
            row.summary_markdown = summaryIn;
            row.title = defaultTitleFromMarkdown(summaryIn).slice(0, 200);
        }
        if (metaIn !== undefined)
            row.meta = metaIn;
        if (messagesPacked !== undefined)
            row.messages = messagesPacked;

        const { error } = await db
            .from("study_kit_sessions")
            .update(row)
            .eq("id", id)
            .eq("user_id", user.id);
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("study-kit session PATCH", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}
