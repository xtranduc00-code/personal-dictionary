import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  word: z.string().min(1),
});

const senseSchema = z.object({
  partOfSpeech: z.enum([
    "n",
    "v",
    "adj",
    "adv",
    "prep",
    "pron",
    "conj",
    "det",
    "interj",
    "phrase",
    "other",
  ]),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  ipaUs: z.string().min(1),
  meaning: z.string().min(1),
  synonyms: z.array(z.string()).default([]),
  antonyms: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
});

const resultSchema = z.object({
  word: z.string().min(1),
  senses: z.array(senseSchema).min(1),
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
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }

    const word = parsed.data.word.trim();

    const openai = new OpenAI({ apiKey });

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a concise English dictionary assistant. Return only practical data for learners. For words with multiple parts of speech (e.g. 'play' as verb and noun), return ONE sense per part of speech. Keep meanings easy to understand. Include US IPA in slash format like /pleɪ/. Use CEFR level A1–C2. Part-of-speech labels: n, v, adj, adv, prep, pron, conj, det, interj, phrase, other.",
        },
        {
          role: "user",
          content: `Give ALL common parts of speech for the English word "${word}". Return valid JSON: { "word": "${word}", "senses": [ { "partOfSpeech", "level", "ipaUs", "meaning", "synonyms", "antonyms", "examples" }, ... ] }. Include at least one sense; include multiple when the word has different meanings as noun, verb, etc. (e.g. play = v and n). Max 6 synonyms/antonyms and 3 examples per sense.`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "dictionary_entry",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              word: { type: "string" },
              senses: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    partOfSpeech: {
                      type: "string",
                      enum: [
                        "n",
                        "v",
                        "adj",
                        "adv",
                        "prep",
                        "pron",
                        "conj",
                        "det",
                        "interj",
                        "phrase",
                        "other",
                      ],
                    },
                    level: {
                      type: "string",
                      enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
                    },
                    ipaUs: { type: "string" },
                    meaning: { type: "string" },
                    synonyms: {
                      type: "array",
                      items: { type: "string" },
                    },
                    antonyms: {
                      type: "array",
                      items: { type: "string" },
                    },
                    examples: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: [
                    "partOfSpeech",
                    "level",
                    "ipaUs",
                    "meaning",
                    "synonyms",
                    "antonyms",
                    "examples",
                  ],
                },
              },
            },
            required: ["word", "senses"],
          },
        },
      },
    });

    const raw = response.output_text;
    const json = JSON.parse(raw);
    const result = resultSchema.parse(json);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Define API failed:", error);
    return NextResponse.json(
      { error: "Could not generate dictionary result" },
      { status: 500 },
    );
  }
}
