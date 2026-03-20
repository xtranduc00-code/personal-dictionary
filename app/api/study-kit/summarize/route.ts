import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/get-auth-user";
import { extractDocumentText } from "@/lib/study-kit-extract";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PROMPT_CHARS = 4000;

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
    const file = form.get("file");
    if (!(file instanceof File))
        return NextResponse.json({ code: "NO_FILE" }, { status: 400 });
    if (file.size === 0)
        return NextResponse.json({ code: "EMPTY_FILE" }, { status: 400 });
    if (file.size > MAX_FILE_BYTES)
        return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 });
    const customPromptRaw = typeof form.get("customPrompt") === "string"
        ? form.get("customPrompt") as string
        : "";
    const customPrompt = customPromptRaw.trim().slice(0, MAX_PROMPT_CHARS);
    const buffer = Buffer.from(await file.arrayBuffer());
    let extracted: Awaited<ReturnType<typeof extractDocumentText>>;
    try {
        extracted = await extractDocumentText(buffer, file.name || "document", file.type || "");
    }
    catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "UNSUPPORTED_TYPE") {
            return NextResponse.json({ code: "UNSUPPORTED_TYPE" }, { status: 400 });
        }
        if (msg === "EMPTY_TEXT") {
            return NextResponse.json({ code: "EMPTY_TEXT" }, { status: 400 });
        }
        console.error("study-kit extract", e);
        return NextResponse.json({ code: "EXTRACT_FAILED" }, { status: 400 });
    }
    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const system = `You are a study assistant. Summarize the document provided by the user.
Rules:
- Base the summary ONLY on the document text. Do not invent facts.
- If the user gives extra instructions, follow them as long as they do not require information not in the document.
- Prefer clear structure (headings or bullet points) when helpful.
- If the document is very short, keep the summary proportionate.`;
    const userContent = `File name: ${extracted.fileName}
${extracted.truncated
        ? "Note: only the beginning of the document was available (truncated for length).\n"
        : ""}
--- Document text ---
${extracted.text}
--- End ---

User instructions (optional):
${customPrompt || "(none — give a concise general summary)"}`;
    try {
        const response = await openai.chat.completions.create({
            model,
            temperature: 0.3,
            max_tokens: 4096,
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
