import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Chess } from "chess.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { fen, moves, themes, level, rating } = await req.json() as {
      fen: string;
      moves: string[];      // all moves including opponent setup at [0]
      themes: string[];
      level: string;
      rating?: number;
    };

    // Reconstruct move sequence in SAN for readability
    const chess = new Chess(fen);
    const sanMoves: string[] = [];
    for (const uci of moves) {
      try {
        const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
        if (m) sanMoves.push(m.san);
      } catch { break; }
    }

    const themeList = themes.length > 0 ? themes.join(", ") : "general tactics";
    const ratingText = rating ? ` (Lichess rating: ${rating})` : "";
    const solutionMoves = sanMoves.slice(1).join(", "); // skip setup move

    const prompt = `You are a chess coach explaining a tactical puzzle to a student.

Puzzle details:
- Difficulty: ${level}${ratingText}
- Tactical themes: ${themeList}
- Starting FEN: ${fen}
- Full move sequence (setup + solution): ${sanMoves.join(", ")}
- The player's solution moves: ${solutionMoves}

Explain in 3-4 friendly, concise sentences:
1. What tactical idea makes this solution work
2. Why specifically ${sanMoves[1] ?? sanMoves[0]} is the key move
3. Why other moves would fail

Use simple language — no jargon without explanation. Be encouraging. No bullet points, just flowing sentences.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    const explanation = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ explanation });
  } catch (e) {
    console.error("Explain error:", e);
    return NextResponse.json({ explanation: "" }, { status: 500 });
  }
}
