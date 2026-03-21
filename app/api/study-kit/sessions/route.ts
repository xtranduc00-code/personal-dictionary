import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { defaultTitleFromMarkdown } from "@/lib/study-kit-saved";
import { sanitizeMetaForStore } from "@/lib/study-kit-session-meta";
import { packLegacyFlatMessages, packSessionMessages, sanitizeSectionThreadsRecord } from "@/lib/study-kit-session-messages";
import { supabaseForUserData } from "@/lib/supabase-server";

const MAX_SUMMARY_CHARS = 900_000;

export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("study_kit_sessions")
            .select("id,title,summary_markdown,truncated,created_at,updated_at")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(50);
        if (error)
            throw error;
        const rows = Array.isArray(data) ? data : [];
        const sessions = rows.map((r: {
            id: string;
            title: string;
            summary_markdown: string;
            truncated: boolean;
            created_at: string;
            updated_at: string;
        }) => ({
            id: r.id,
            title: r.title || defaultTitleFromMarkdown(r.summary_markdown),
            truncated: Boolean(r.truncated),
            preview: r.summary_markdown.slice(0, 160),
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
        return NextResponse.json({ sessions });
    }
    catch (e) {
        console.error("study-kit sessions GET", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        const summary =
            typeof body?.summary === "string"
                ? body.summary.slice(0, MAX_SUMMARY_CHARS)
                : "";
        if (!summary.trim())
            return NextResponse.json({ code: "EMPTY" }, { status: 400 });
        const truncated = Boolean(body?.truncated);
        const titleRaw = typeof body?.title === "string" ? body.title.trim() : "";
        const title = titleRaw.slice(0, 200) || defaultTitleFromMarkdown(summary);
        const meta = sanitizeMetaForStore(body?.meta);
        let messagesPacked: unknown;
        if (body?.sectionThreads !== undefined)
            messagesPacked = packSessionMessages(sanitizeSectionThreadsRecord(body.sectionThreads));
        else if (body?.messages !== undefined)
            messagesPacked = packLegacyFlatMessages(body.messages);
        else
            messagesPacked = packSessionMessages({});

        const now = new Date().toISOString();
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("study_kit_sessions")
            .insert({
                user_id: user.id,
                title,
                summary_markdown: summary,
                truncated,
                messages: messagesPacked,
                meta,
                created_at: now,
                updated_at: now,
            })
            .select("id,title,truncated,created_at,updated_at")
            .single();
        if (error)
            throw error;
        return NextResponse.json({ session: data });
    }
    catch (e) {
        console.error("study-kit sessions POST", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}
