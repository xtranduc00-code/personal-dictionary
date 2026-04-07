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
      attempt?: number;     // how many wrong attempts so far (1-based)
      solutionMoves?: string[]; // UCI moves of the full solution line
    }
  | {
      mode: "position_hint";
      fen: string;
      themes: string[];
      level: string;
      /** Student's color in this puzzle ("white" | "black") for "your" wording */
      studentColor: "white" | "black";
    };

export async function POST(req: Request) {
  try {
    const body = await req.json() as RequestBody;

    // ── Wrong move explanation ────────────────────────────────────────────────
    if (body.mode === "wrong_move") {
      const { currentFen, wrongMove, themes, level, attempt = 1, solutionMoves } = body;

      // Translate wrong move to SAN
      const chess = new Chess(currentFen);
      let wrongSan = wrongMove;
      try {
        const m = chess.move({ from: wrongMove.slice(0, 2), to: wrongMove.slice(2, 4), promotion: wrongMove[4] ?? "q" });
        if (m) wrongSan = m.san;
      } catch { /* keep UCI if move is illegal */ }

      // Convert solution first move to SAN for progressive hints
      let solutionFirstSan = "";
      if (solutionMoves && solutionMoves.length > 0) {
        const solChess = new Chess(currentFen);
        try {
          const sm = solChess.move({ from: solutionMoves[0].slice(0, 2), to: solutionMoves[0].slice(2, 4), promotion: solutionMoves[0][4] ?? "q" });
          if (sm) solutionFirstSan = sm.san;
        } catch { /* ignore */ }
      }

      const themeList = themes.length > 0 ? themes.join(", ") : "general tactics";

      // Progressive hint levels based on attempt count
      let hintLevel: string;
      if (attempt <= 1) {
        hintLevel = `Give a gentle nudge. Name the tactical theme (${themeList}) in plain words. Do NOT reveal the correct move or its destination square.`;
      } else if (attempt === 2) {
        hintLevel = `Be more specific. Name the piece that should move and the general idea (e.g. "your rook needs to cut off the king" or "look for a fork with the knight"). Do NOT name the exact destination square.`;
      } else {
        // 3+ attempts — very direct, almost reveal
        hintLevel = solutionFirstSan
          ? `The student is struggling. Tell them which piece to move and strongly hint at the idea (e.g. "move your rook along the 7th rank" or "your knight can jump to attack two pieces"). You may hint at the piece and direction but do NOT write the exact move notation "${solutionFirstSan}".`
          : `The student is struggling. Give the most direct hint possible — name the piece and the general direction/idea. Stop just short of naming the exact square.`;
      }

      const prompt = `You are a patient chess teacher helping a student with a ${level} puzzle.
Position (FEN): ${currentFen}
The student played: ${wrongSan} (attempt #${attempt})
Puzzle themes: ${themeList}

Reply in EXACTLY this JSON format (no markdown, no code fences):
{"wrong":"...","hint":"..."}

For "wrong" (max 2 short sentences, max 25 words total):
- Sentence 1: What the student's move fails to do, in plain language. Example: "${wrongSan} doesn't create any immediate threat" or "${wrongSan} lets the opponent escape".
- Sentence 2: What the puzzle is actually asking for — the goal. Example: "This puzzle is about trapping the king" or "You need to win material with a tactic".
- Use everyday chess language a beginner can follow. No engine jargon.

For "hint" (max 1-2 sentences, max 20 words):
${hintLevel}

FORBIDDEN: "decisive advantage", "winning move", "crushing", "strongest move", "optimal", "key squares", praise, filler.`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 140,
        temperature: 0.4,
      });

      const raw = completion.choices[0]?.message?.content?.trim() ?? "";
      try {
        const parsed = JSON.parse(raw) as { wrong?: string; hint?: string };
        return NextResponse.json({
          explanation: parsed.wrong ?? "",
          hint: parsed.hint ?? "",
        });
      } catch {
        return NextResponse.json({ explanation: raw, hint: "" });
      }
    }

    // ── Position hint (Show hint / non-destructive nudge) ─────────────────────
    if (body.mode === "position_hint") {
      const { fen, themes, level, studentColor } = body;
      const themeList = themes.length > 0 ? themes.join(", ") : "general tactics";
      const prompt = `You are a chess coach. ${level} puzzle. The student plays as ${studentColor}.
They must find the best move. Themes (from puzzle metadata): ${themeList}.

Current position (FEN — it is ${studentColor}'s turn to move): ${fen}

Write EXACTLY ONE sentence, max 25 words:
- Reference specific pieces and squares that actually appear on the board (e.g. "your rook on d4", "the white king on b2", "the knight on f6").
- Steer toward a concrete idea (file, diagonal, weak king, loose piece, mating pattern) WITHOUT naming the correct move or destination square (no "play Nf7+" or "Queen h7#").
- If a theme tag names a tactic (fork, pin, skewer, discoveredAttack, backRankMate, hangingPiece, sacrifice, deflection, decoy, quietMove, mateIn1, etc.), work that concept into the hint in plain words.

Good examples:
- "Look at your rook on d4 — can it cause problems on the d-file?"
- "The white king on b2 is exposed — which of your pieces can attack it?"
- "Think about a knight fork — which square might hit two enemy pieces at once?"

FORBIDDEN: "decisive advantage", "winning move", "crushing", "material advantage", "positional advantage", "best move", "you should", praise, or filler. No bullet points.`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 70,
        temperature: 0.45,
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

    const firstSan = sanMoves[1] ?? sanMoves[0] ?? "";

    const prompt = `You are a chess coach. ${level} puzzle${ratingText}. Themes: ${themeList}
Starting FEN: ${fen}
Full solution line (SAN): ${solutionMoves}

Write EXACTLY 2 sentences. Total under 30 words. No bullet points.

Sentence 1: Why ${firstSan} works mechanically (fork, check, capture threat, deflection, etc.) — name pieces/squares when helpful.
Sentence 2: One sharp pattern to remember (general lesson only).

FORBIDDEN: "Great job", "Keep practicing", "You're doing great", "well done", "congratulations", filler praise, or a third sentence. Do not exceed 30 words total.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
      temperature: 0.4,
    });

    return NextResponse.json({
      explanation: completion.choices[0]?.message?.content?.trim() ?? "",
    });
  } catch (e) {
    console.error("Explain error:", e);
    return NextResponse.json({ explanation: "" }, { status: 500 });
  }
}
