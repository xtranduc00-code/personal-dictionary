import { NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";
import { z } from "zod";
import { getAuthUser } from "@/lib/get-auth-user";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTEXT_CHARS = 320_000;
const MAX_MESSAGE_CHARS = 16_000;

const bodySchema = z.object({
    studyContext: z.string().min(1).max(MAX_CONTEXT_CHARS),
    messages: z
        .array(
            z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().min(1).max(MAX_MESSAGE_CHARS),
            }),
        )
        .min(1)
        .max(40),
});

const SYSTEM = `You are a patient tutor helping a student understand their exam-revision sheet.
The user has a compressed study summary (Markdown) for recall. Your job is to expand: explain why, give step-by-step reasoning when useful, concrete examples, and fix misunderstandings.
Rules:
- Ground answers in the provided sheet when the topic is there; if something is outside the sheet, say so briefly then teach generally.
- Be concise but clear; prefer short paragraphs or numbered steps over walls of text.
- Do not repeat the entire sheet back.
- If asked in Vietnamese, reply in Vietnamese; otherwise match the user's language.
- For math, use Markdown-friendly delimiters: inline as $...$ and display as $$...$$ (not bare Unicode that breaks fonts). You may use ### headings and bullet lists.`;

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
        return NextResponse.json({ code: "SERVER_CONFIG" }, { status: 500 });

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

    const { studyContext, messages } = parsed.data;
    const model = process.env.STUDY_KIT_CHAT_MODEL?.trim() || "gpt-4o-mini";

    const openai = new OpenAI({ apiKey });
    const contextBlock = `--- Study sheet (Markdown) ---\n${studyContext}\n--- End sheet ---`;

    try {
        const response = await openai.chat.completions.create({
            model,
            temperature: 0.35,
            max_completion_tokens: 2048,
            messages: [
                { role: "system", content: `${SYSTEM}\n\n${contextBlock}` },
                ...messages.map((m) => ({ role: m.role, content: m.content })),
            ],
        });
        const reply = response.choices?.[0]?.message?.content?.trim() ?? "";
        if (!reply)
            return NextResponse.json(
                { code: "EMPTY_REPLY", detail: "Model returned no text." },
                { status: 502 },
            );
        return NextResponse.json({ reply });
    }
    catch (e) {
        console.error("study-kit chat", e);
        if (e instanceof APIError) {
            const dev = process.env.NODE_ENV === "development";
            return NextResponse.json(
                {
                    code: "CHAT_FAILED",
                    detail: dev ? `${e.status ?? "?"} ${e.message}` : undefined,
                },
                { status: e.status && e.status >= 400 && e.status < 600 ? e.status : 500 },
            );
        }
        return NextResponse.json({ code: "CHAT_FAILED" }, { status: 500 });
    }
}
