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
        hintLevel = `One concrete sentence: name ONE thing the student should look for on the board (e.g. a loose piece, a back rank, a knight fork pattern) tied to themes: ${themeList}. Do NOT name the correct move or destination square.`;
      } else if (attempt === 2) {
        hintLevel = `Two short phrases: (1) which piece type should probably move (queen/rook/knight/pawn), (2) what it should attack or cut off — still no exact square, no SAN of the solution.`;
      } else {
        hintLevel = solutionFirstSan
          ? `They are stuck. Say clearly: "Try moving your ___ toward ___" using piece words and direction (file/rank/diagonal), but do NOT write the full solution move "${solutionFirstSan}" or its exact destination square.`
          : `They are stuck. Name the best piece to activate and the target (king/pawn/empty critical square) in plain words — stop one step before naming the exact landing square.`;
      }

      const prompt = `You are a chess coach for a ${level} puzzle. The student needs VERY concrete language (not chess engine jargon).
Position (FEN): ${currentFen}
The student tried: ${wrongSan} (wrong attempt #${attempt})
Themes (metadata): ${themeList}

Reply in EXACTLY this JSON (no markdown, no code fences):
{"wrong":"...","hint":"..."}

"wrong" — EXACTLY 2 sentences, max 22 words total, simple English:
1) What goes wrong with their try in ONE concrete image (e.g. "Your rook checks but it can be captured" / "That knight move does not attack anything valuable").
2) What they should be trying instead in ONE short phrase (e.g. "Look for a fork on king and rook" / "Win a piece in one move").

"hint" — max 18 words, one sentence, actionable:
${hintLevel}

FORBIDDEN in both fields: "decisive advantage", "crushing", "optimal", "best move", "key squares", "immediate threat" without naming WHAT is missing, filler, praise.`;

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

    const prompt = `You are a friendly chess coach talking to a student. ${level} puzzle${ratingText}. Themes: ${themeList}
Starting FEN: ${fen}
Full solution line (SAN): ${solutionMoves}
Key move: ${firstSan}

Explain why this works like you're sitting next to them at the board.

STYLE RULES (strict):
- Write EXACTLY 2 or 3 short sentences. Never more.
- Each sentence MAX 15 words. Count them.
- Active voice only. Subject does the action.
- Use "you", "your", "notice", "see" — speak directly to the student.
- Plain everyday words. No textbook tone, no engine jargon.
- Walk through the move, then the consequence, then the payoff.

GOOD example (copy this rhythm):
"Rxh8+ forces the king to move away. That removes the rook's only defender. Now Rxe8 is checkmate."

GOOD example:
"You play Nf7+, forking the king and queen. The king must move to safety. Then you grab the queen for free."

BAD example (do NOT write like this):
"Rxh8+ works by delivering a check that forces the black king to e7, removing its defense of the e8 rook. Always look for forcing moves that deflect key defenders to enable mating threats."

FORBIDDEN words and phrases: "works by", "always look for", "in order to", "thereby", "thus", "decisive", "key squares", "winning move", "great job", "well done", "keep practicing", any praise or filler. No bullet points. No third-person passive. No general lesson at the end — only describe THIS move.

Now write the explanation for ${firstSan}.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 90,
      temperature: 0.5,
    });

    return NextResponse.json({
      explanation: completion.choices[0]?.message?.content?.trim() ?? "",
    });
  } catch (e) {
    console.error("Explain error:", e);
    return NextResponse.json({ explanation: "" }, { status: 500 });
  }
}
