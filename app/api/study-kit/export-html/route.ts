import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/get-auth-user";
import {
    buildStudyKitExportDocument,
    markdownToStudyKitHtmlFragment,
} from "@/lib/study-kit-export-html";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MARKDOWN_CHARS = 400_000;

const bodySchema = z.object({
    markdown: z.string().min(1).max(MAX_MARKDOWN_CHARS),
    title: z.string().max(200).optional(),
    lang: z.enum(["en", "vi"]).optional(),
});

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

    const { markdown, title, lang } = parsed.data;
    try {
        const bodyHtml = await markdownToStudyKitHtmlFragment(markdown);
        const doc = buildStudyKitExportDocument({
            title: title?.trim() || "Study sheet",
            lang: lang ?? "en",
            bodyHtml,
        });
        return NextResponse.json({ html: doc });
    }
    catch (e) {
        console.error("study-kit export-html", e);
        return NextResponse.json({ code: "EXPORT_FAILED" }, { status: 500 });
    }
}
