import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type BlunderInfo = { moveNum: number; color: "w" | "b"; san: string; cpLoss: number };

type Body = {
  pgn: string;
  whitePlayer: string;
  blackPlayer: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  blunders: BlunderInfo[];
  mistakes: BlunderInfo[];
  totalMoves: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json() as Body;
    const {
      pgn,
      whitePlayer,
      blackPlayer,
      whiteAccuracy,
      blackAccuracy,
      blunders,
      mistakes,
      totalMoves,
    } = body;

    const formatMoves = (ms: BlunderInfo[]) =>
      ms.length === 0
        ? "none"
        : ms.map((m) => `${m.moveNum}. ${m.color === "w" ? "(White)" : "(Black)"} ${m.san} (${m.cpLoss}cp loss)`).join(", ");

    const prompt = `Here is a chess game to analyze:

PGN:
${pgn}

Game stats:
- ${whitePlayer} (White): ${whiteAccuracy}% accuracy
- ${blackPlayer} (Black): ${blackAccuracy}% accuracy
- Total moves: ${totalMoves}
- Blunders: ${formatMoves(blunders)}
- Mistakes: ${formatMoves(mistakes)}

As a chess coach, provide a structured game summary with exactly these 4 sections:

OPENING: (2 sentences — name the opening played, how well both sides handled it)
TURNING_POINT: (2 sentences — describe the key moment that decided the game, reference the move number if there were clear blunders)
WEAKNESS: (1 sentence — the most important tactical or strategic weakness shown, be specific)
SUGGESTIONS: (give exactly 3 short specific improvement tips, each on its own line starting with "- ")

Use simple language. Reference the actual moves from the game. Be encouraging.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You are a chess coach explaining games to improving players. Be concise, specific, and encouraging. Always follow the exact output format requested.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 380,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";

    // Parse structured response
    const extract = (label: string): string => {
      const re = new RegExp(`${label}:\\s*(.+?)(?=(?:OPENING:|TURNING_POINT:|WEAKNESS:|SUGGESTIONS:)|$)`, "s");
      return raw.match(re)?.[1]?.trim() ?? "";
    };

    const suggestionsRaw = extract("SUGGESTIONS");
    const suggestions = suggestionsRaw
      .split("\n")
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    return NextResponse.json({
      opening:      extract("OPENING"),
      turningPoint: extract("TURNING_POINT"),
      weakness:     extract("WEAKNESS"),
      suggestions,
      raw,
    });
  } catch (e) {
    console.error("review-summary error:", e);
    return NextResponse.json({ opening: "", turningPoint: "", weakness: "", suggestions: [] }, { status: 500 });
  }
}
