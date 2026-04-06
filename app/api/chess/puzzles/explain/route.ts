import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Chess } from "chess.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type RequestBody =
  | {
      mode: "solve";
      fen: string;
      moves: string[];
      themes: string[];
      level: string;
      rating?: number;
    }
  | {
      mode: "wrong_move";
      currentFen: string;   // FEN BEFORE the wrong move
      wrongMove: string;    // UCI of the wrong move
      themes: string[];
      level: string;
    };

export async function POST(req: Request) {
  try {
    const body = await req.json() as RequestBody;

    // ── Wrong move explanation ────────────────────────────────────────────────
    if (body.mode === "wrong_move") {
      const { currentFen, wrongMove, themes, level } = body;

      // Translate wrong move to SAN
      const chess = new Chess(currentFen);
      let wrongSan = wrongMove;
      try {
        const m = chess.move({ from: wrongMove.slice(0, 2), to: wrongMove.slice(2, 4), promotion: wrongMove[4] ?? "q" });
        if (m) wrongSan = m.san;
      } catch { /* keep UCI if move is illegal */ }

      const themeList = themes.length > 0 ? themes.join(", ") : "general tactics";
      const prompt = `You are a chess tutor. A student is solving a ${level} tactical puzzle with themes: ${themeList}.

The current position (FEN): ${currentFen}
The student just played: ${wrongSan}

This move is NOT the best move. Explain in 1-2 short, friendly sentences:
- Why this specific move falls short (e.g. it misses a threat, allows a recapture, doesn't create enough pressure)
- A vague directional nudge like "think about controlling a key square" or "look for a move that attacks more than one target" — do NOT reveal the correct piece or destination square

Be encouraging, specific about the flaw of ${wrongSan}, and concise. No bullet points.`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 90,
        temperature: 0.6,
      });

      return NextResponse.json({
        explanation: completion.choices[0]?.message?.content?.trim() ?? "",
      });
    }

    // ── Post-solve explanation ────────────────────────────────────────────────
    const { fen, moves, themes, level, rating } = body;

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
    const solutionMoves = sanMoves.slice(1).join(", ");

    const prompt = `You are a chess coach explaining a tactical puzzle to a student.

Puzzle: ${level}${ratingText} · themes: ${themeList}
FEN: ${fen}
Solution moves: ${solutionMoves}

In exactly 3 short, direct sentences (no bullet points):
1. The key tactical idea that makes ${sanMoves[1] ?? sanMoves[0]} the right move
2. What it threatens or wins
3. One reason other moves fail

Simple language, encouraging tone.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120,
      temperature: 0.65,
    });

    return NextResponse.json({
      explanation: completion.choices[0]?.message?.content?.trim() ?? "",
    });
  } catch (e) {
    console.error("Explain error:", e);
    return NextResponse.json({ explanation: "" }, { status: 500 });
  }
}
