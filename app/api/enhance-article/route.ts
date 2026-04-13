import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODES = ["simplify", "summarize", "translate", "insights"] as const;
type EnhanceMode = (typeof MODES)[number];

const bodySchema = z.object({
    content: z.string().min(20).max(40_000),
    mode: z.enum(MODES),
});

const MODEL = process.env.OPENAI_ENHANCE_MODEL?.trim() || "gpt-4o-mini";

function systemPrompt(mode: EnhanceMode): string {
    switch (mode) {
        case "simplify":
            return [
                "You rewrite articles in simple, plain English for busy learners.",
                "Keep it under 200 words.",
                "Start with one bold summary sentence (wrap it in **…**).",
                "Then 2-4 short paragraphs, short sentences, everyday vocabulary.",
                "Preserve factual accuracy. No preamble, no meta commentary.",
            ].join(" ");
        case "summarize":
            return [
                "Summarize the article in EXACTLY 5 bullet points.",
                "Each bullet is one short, complete sentence capturing a distinct key point.",
                "Start each bullet with '- '. No numbering, no preamble, no conclusion.",
            ].join(" ");
        case "translate":
            return [
                "Translate the article into natural, conversational Vietnamese.",
                "Preserve the structure (paragraph breaks, bullet points, headings).",
                "Prefer everyday spoken Vietnamese over stiff formal register, but keep proper nouns intact.",
                "Output the translation only — no preface, no notes.",
            ].join(" ");
        case "insights":
            return [
                "Extract decision-useful insights from this article.",
                'Return ONLY a JSON object with keys: "keyInsight" (string), "whyItMatters" (string), "actionItems" (array of 2-5 short imperative strings).',
                "No markdown, no commentary, just the JSON.",
            ].join(" ");
    }
}

async function callOpenAI(mode: EnhanceMode, content: string): Promise<string> {
    const client = new OpenAI();
    const res = await client.chat.completions.create({
        model: MODEL,
        messages: [
            { role: "system", content: systemPrompt(mode) },
            { role: "user", content },
        ],
        temperature: mode === "insights" ? 0.2 : 0.4,
        response_format: mode === "insights" ? { type: "json_object" } : undefined,
    });
    return res.choices[0]?.message?.content?.trim() ?? "";
}

export async function POST(req: NextRequest) {
    let parsed: z.infer<typeof bodySchema>;
    try {
        const raw: unknown = await req.json();
        const r = bodySchema.safeParse(raw);
        if (!r.success) {
            return NextResponse.json(
                { error: r.error.issues.map((i) => i.message).join("; ") },
                { status: 400 },
            );
        }
        parsed = r.data;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY?.trim()) {
        return NextResponse.json(
            { error: "OPENAI_API_KEY is not set on the server." },
            { status: 503 },
        );
    }

    try {
        const text = await callOpenAI(parsed.mode, parsed.content);
        if (!text) {
            return NextResponse.json(
                { error: "Empty response from the model." },
                { status: 502 },
            );
        }

        if (parsed.mode === "insights") {
            try {
                const json = JSON.parse(text) as unknown;
                return NextResponse.json({ mode: parsed.mode, result: json });
            } catch {
                return NextResponse.json({ mode: parsed.mode, result: text });
            }
        }

        return NextResponse.json({ mode: parsed.mode, result: text });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "AI enhance failed";
        return NextResponse.json({ error: msg }, { status: 502 });
    }
}
