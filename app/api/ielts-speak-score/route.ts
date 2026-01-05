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
        { error: "Answer is empty. Record or type your response first." },
        { status: 400 },
      );
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an IELTS Speaking examiner. Evaluate the candidate's spoken response (given as transcript) to the given question.

Return a JSON object with exactly these keys:
- "score": number from 0 to 9 (IELTS band, can use half bands like 6.5)
- "feedback": string, 2-4 sentences: what was good, what to improve, and one concrete tip. Be clear and encouraging.`,
        },
        {
          role: "user",
          content: `Question: ${question}\n\nCandidate's response (transcript): ${trimmedAnswer}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "No response from examiner" },
        { status: 500 },
      );
    }

    let result: { score?: number; feedback?: string };
    try {
      result = JSON.parse(raw) as { score?: number; feedback?: string };
    } catch {
      return NextResponse.json(
        { error: "Invalid examiner response" },
        { status: 500 },
      );
    }

    const score = typeof result.score === "number" ? Math.min(9, Math.max(0, result.score)) : 0;
    const feedback = typeof result.feedback === "string" ? result.feedback : "No feedback provided.";

    return NextResponse.json({ score, feedback });
  } catch (err) {
    console.error("ielts-speak-score error:", err);
    return NextResponse.json(
      { error: "Could not get score. Try again." },
      { status: 500 },
    );
  }
}
