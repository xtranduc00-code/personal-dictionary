import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  question: z.string().min(1),
  answer: z.string(),
});

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request: question and answer required" },
        { status: 400 },
      );
    }

    const { question, answer } = parsed.data;
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) {
      return NextResponse.json(
        { error: "Answer is empty." },
        { status: 400 },
      );
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an IELTS Speaking coach. The candidate gave a response that scores below band 6. Rewrite their answer to target band 6.5-7: keep the same ideas and meaning, but improve grammar, vocabulary, coherence, and fluency. Return a short paragraph (2-4 sentences) that would score 6.5-7. Do not add extra ideas; only improve how they expressed their answer. Return plain text only, no JSON.`,
        },
        {
          role: "user",
          content: `Question: ${question}\n\nCandidate's response: ${trimmedAnswer}\n\nProvide an improved version (band 6.5-7):`,
        },
      ],
    });

    const improvedAnswer = response.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ improvedAnswer });
  } catch (err) {
    console.error("ielts-speak-improve error:", err);
    return NextResponse.json(
      { error: "Could not generate improvement. Try again." },
      { status: 500 },
    );
  }
}
