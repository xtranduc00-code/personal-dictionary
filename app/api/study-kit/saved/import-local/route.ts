import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import {
    MAX_SHEETS_PER_TOPIC,
    MAX_SHEETS_TOTAL,
    MAX_STUDY_TOPICS,
} from "@/lib/study-kit-saved";

export const runtime = "nodejs";

const MAX_MD = 900_000;

const sheetSchema = z.object({
    title: z.string().max(200),
    markdown: z.string().max(MAX_MD),
    truncated: z.boolean().optional(),
    savedAt: z.string().optional(),
});

const topicSchema = z.object({
    name: z.string().trim().min(1).max(200),
    sheets: z.array(sheetSchema).max(MAX_SHEETS_PER_TOPIC),
});

const bodySchema = z.object({
    topics: z.array(topicSchema).max(MAX_STUDY_TOPICS),
});

/**
 * One-time style: only runs if the user has zero server-side subjects.
 * Uploads browser `study-kit-saved-v2` shape after login so folders are not lost.
 */
export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    let json: unknown;
    try {
        json = await req.json();
    }
    catch {
        return NextResponse.json({ code: "BAD_JSON" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success)
        return NextResponse.json({ code: "BAD_BODY" }, { status: 400 });
    try {
        const db = supabaseForUserData();
        const { count, error: cErr } = await db
            .from("study_kit_saved_topics")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);
        if (cErr)
            throw cErr;
        if ((count ?? 0) > 0)
            return NextResponse.json({ code: "ALREADY_HAS_DATA", imported: 0 }, { status: 409 });

        let sheetTotal = 0;
        for (const top of parsed.data.topics)
            sheetTotal += top.sheets.length;
        if (sheetTotal > MAX_SHEETS_TOTAL)
            return NextResponse.json({ code: "SHEET_TOTAL_LIMIT" }, { status: 400 });

        let importedTopics = 0;
        let importedSheets = 0;
        for (const top of parsed.data.topics) {
            const { data: trow, error: te } = await db
                .from("study_kit_saved_topics")
                .insert({ user_id: user.id, name: top.name })
                .select("id")
                .single();
            if (te)
                throw te;
            if (!trow)
                continue;
            const topicId = (trow as { id: string }).id;
            importedTopics++;
            for (const sh of top.sheets) {
                const { error: se } = await db.from("study_kit_saved_sheets").insert({
                    user_id: user.id,
                    topic_id: topicId,
                    title: sh.title.trim() || "Study sheet",
                    markdown: sh.markdown,
                    truncated: Boolean(sh.truncated),
                    ...(sh.savedAt ? { saved_at: sh.savedAt } : {}),
                });
                if (se)
                    throw se;
                importedSheets++;
            }
        }
        return NextResponse.json({ ok: true, importedTopics, importedSheets });
    }
    catch (e) {
        console.error("study-kit/saved/import-local", e);
        return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }
}
