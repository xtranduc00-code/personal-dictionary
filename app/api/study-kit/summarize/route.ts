import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/get-auth-user";
import { extractDocumentText, preparePlainText } from "@/lib/study-kit-extract";
import {
    buildStudyKitSystemMessage,
    parseStudyFocus,
    parseStudyPreset,
    studyKitMaxOutputTokens,
} from "@/lib/study-kit-prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Hard cap on pasted characters before server-side truncate pipeline. */
const MAX_PASTE_CHARS = 400_000;

function formBool(form: FormData, key: string): boolean {
    const v = form.get(key);
    return v === "true" || v === "1" || v === "on";
}

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
    const inputMode = form.get("inputMode") === "paste" ? "paste" : "file";
    const preset = parseStudyPreset(typeof form.get("preset") === "string" ? form.get("preset") as string : null);
    const focus = parseStudyFocus(typeof form.get("focus") === "string" ? form.get("focus") as string : null);
    const optQuiz = formBool(form, "optQuiz");
    const optHighlight = formBool(form, "optHighlight");
    const optStripFluff = formBool(form, "optStripFluff");
    const promptOpts = { preset, focus, optQuiz, optHighlight, optStripFluff };

    let extracted: Awaited<ReturnType<typeof extractDocumentText>> | ReturnType<typeof preparePlainText>;
    if (inputMode === "paste") {
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
    else {
        const file = form.get("file");
        if (!(file instanceof File))
            return NextResponse.json({ code: "NO_FILE" }, { status: 400 });
        if (file.size === 0)
            return NextResponse.json({ code: "EMPTY_FILE" }, { status: 400 });
        if (file.size > MAX_FILE_BYTES)
            return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 });
        const buffer = Buffer.from(await file.arrayBuffer());
        try {
            extracted = await extractDocumentText(buffer, file.name || "document", file.type || "");
        }
        catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "";
            if (msg === "UNSUPPORTED_TYPE")
                return NextResponse.json({ code: "UNSUPPORTED_TYPE" }, { status: 400 });
            if (msg === "EMPTY_TEXT")
                return NextResponse.json({ code: "EMPTY_TEXT" }, { status: 400 });
            console.error("study-kit extract", e);
            return NextResponse.json({ code: "EXTRACT_FAILED" }, { status: 400 });
        }
    }

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const system = buildStudyKitSystemMessage(promptOpts);
    const max_tokens = studyKitMaxOutputTokens(promptOpts);
    const userContent = `Source label: ${extracted.fileName}
${extracted.truncated
        ? "Note: only the beginning of the source was available (length limit).\n"
        : ""}
--- Source text ---
${extracted.text}
--- End ---`;
    try {
        const response = await openai.chat.completions.create({
            model,
            temperature: 0.25,
            max_tokens,
            messages: [
                { role: "system", content: system },
                { role: "user", content: userContent },
            ],
        });
        const summary = response.choices?.[0]?.message?.content?.trim() ?? "";
        return NextResponse.json({
            summary,
            truncated: extracted.truncated,
            fileName: extracted.fileName,
        });
    }
    catch (err) {
        console.error("study-kit summarize", err);
        return NextResponse.json({ code: "SUMMARIZE_FAILED" }, { status: 500 });
    }
}
