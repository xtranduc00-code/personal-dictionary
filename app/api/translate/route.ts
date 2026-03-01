import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
const requestSchema = z.object({
    text: z.string().min(1),
    sourceLang: z.string().optional(),
    targetLang: z.string().optional(),
});
export async function POST(req: Request) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    try {
        const body = await req.json();
        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid request: text required" }, { status: 400 });
        }
        const { text, sourceLang = "Vietnamese", targetLang = "English" } = parsed.data;
        const trimmed = text.trim();
        if (!trimmed) {
            return NextResponse.json({ translation: "" });
        }
        const openai = new OpenAI({ apiKey });
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a translator. Translate the user's text from ${sourceLang} to ${targetLang}. Reply with ONLY the translated text, no explanations. Preserve tone and natural phrasing.`,
                },
                {
                    role: "user",
                    content: trimmed,
                },
            ],
            max_tokens: 500,
        });
        const translation = response.choices?.[0]?.message?.content?.trim() ?? "";
        return NextResponse.json({ translation });
    }
    catch (error: unknown) {
        console.error("Translate API failed:", error);
        const err = error as {
            status?: number;
            message?: string;
        };
        let message = "Translation failed.";
        if (err?.status === 401)
            message = "Invalid API key.";
        if (err?.status === 429)
            message = "Rate limit exceeded. Try again in a moment.";
        return NextResponse.json({ error: message }, { status: err?.status && err.status >= 400 && err.status < 600 ? err.status : 500 });
    }
}
