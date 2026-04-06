import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Chess } from "chess.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Body = {
  fen: string;         // position BEFORE the move
  moveSan: string;     // move played (SAN)
  bestUci: string;     // best move according to Stockfish (UCI)
  cpLoss: number;      // centipawn loss
  classification: string; // "brilliant" | "great" | "good" | "inaccuracy" | "mistake" | "blunder"
  color: "w" | "b";
  moveNum: number;
};

// Convert UCI to SAN for the best move
function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] ?? "q",
    });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

const QUALITY: Record<string, string> = {
  brilliant:  "a brilliant sacrifice",
  great:      "a great move",
  good:       "a solid move",
  inaccuracy: "an inaccuracy",
  mistake:    "a mistake",
  blunder:    "a blunder",
};

export async function POST(req: Request) {
  try {
    const body = await req.json() as Body;
    const { fen, moveSan, bestUci, cpLoss, classification, color, moveNum } = body;

    const side = color === "w" ? "White" : "Black";
    const bestSan = uciToSan(fen, bestUci);
    const quality = QUALITY[classification] ?? classification;
    const isBetter = classification === "brilliant" || classification === "great" || classification === "good";

    const prompt = isBetter
      ? `Move ${moveNum}: ${side} played ${moveSan}, which is ${quality}.
Position (FEN): ${fen}

In 2-3 short, encouraging sentences, explain:
1. Why ${moveSan} is strong in this position (what threat or idea it creates)
2. What makes it the right move here

Be specific to this position. No jargon without explanation. Encouraging tone.`
      : `Move ${moveNum}: ${side} played ${moveSan} (${quality}, ${cpLoss}cp loss). The engine suggests ${bestSan} instead.
Position (FEN): ${fen}

In 2-3 short, friendly sentences, explain:
1. The specific problem with ${moveSan} in this position (what it allows or misses)
2. Why ${bestSan} is stronger — what does it accomplish?

Be specific and concrete. Encouraging tone. No jargon without explanation.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You are a chess coach explaining game positions to an improving player. Be concise, specific, and encouraging. Avoid jargon unless explained.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.65,
    });

    return NextResponse.json({
      explanation: completion.choices[0]?.message?.content?.trim() ?? "",
    });
  } catch (e) {
    console.error("review-move error:", e);
    return NextResponse.json({ explanation: "" }, { status: 500 });
  }
}
