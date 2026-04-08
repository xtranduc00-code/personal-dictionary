import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type EnrichedWord = {
  word: string;
  part_of_speech: string;
  definition: string;
  example: string;
};

const BATCH_SIZE = 15;

async function enrichWords(words: string[]): Promise<EnrichedWord[]> {
  const prompt = `You are a vocabulary enrichment assistant. For each English word or short phrase below, return a JSON array with exactly these fields:
- "word": the word as given
- "part_of_speech": one of "noun", "verb", "adjective", "adverb", "phrase", "other"
- "definition": concise definition in English (max 2 sentences, plain text)
- "example": one natural example sentence using this word in context

Return ONLY valid JSON array, no extra text.

Words:
${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const raw = resp.choices[0]?.message?.content?.trim() ?? "[]";
  // Strip markdown code fences if present
  const json = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
  const parsed = JSON.parse(json) as EnrichedWord[];
  return parsed;
}

function buildDefinitionHtml(enriched: EnrichedWord): string {
  const posLabel: Record<string, string> = {
    noun: "n.",
    verb: "v.",
    adjective: "adj.",
    adverb: "adv.",
    phrase: "phr.",
    other: "",
  };
  const pos = posLabel[enriched.part_of_speech] ?? enriched.part_of_speech;
  const posHtml = pos
    ? `<span style="font-style:italic;color:#888;margin-right:6px">${pos}</span>`
    : "";
  return [
    `<p>${posHtml}${enriched.definition}</p>`,
    enriched.example
      ? `<p style="color:#666;border-left:3px solid #e5a;padding-left:8px;margin-top:6px"><em>${enriched.example}</em></p>`
      : "",
  ]
    .filter(Boolean)
    .join("");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { setId } = await params;

  let body: { words?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawWords: string[] = Array.isArray(body.words)
    ? body.words.map((w) => (typeof w === "string" ? w.trim() : "")).filter(Boolean)
    : [];

  if (rawWords.length === 0) {
    return NextResponse.json({ error: "No words provided" }, { status: 400 });
  }

  // ── Dedup: fetch existing words in this set ─────────────────────────────────
  const { data: existing, error: fetchErr } = await supabaseServer
    .from("flashcard_cards")
    .select("word")
    .eq("set_id", setId)
    .eq("user_id", user.id);

  if (fetchErr) {
    console.error("bulk-enrich: fetch existing", fetchErr);
    return NextResponse.json({ error: "Failed to check existing cards" }, { status: 500 });
  }

  const existingNormalized = new Set(
    (existing ?? []).map((r) => (r.word as string).toLowerCase().trim()),
  );

  const newWords = rawWords.filter((w) => !existingNormalized.has(w.toLowerCase()));
  const skipped = rawWords.length - newWords.length;

  if (newWords.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, enriched: 0 });
  }

  // ── AI enrichment in batches ────────────────────────────────────────────────
  const enrichedAll: EnrichedWord[] = [];
  for (let i = 0; i < newWords.length; i += BATCH_SIZE) {
    const batch = newWords.slice(i, i + BATCH_SIZE);
    try {
      const results = await enrichWords(batch);
      // Align by position in case AI reorders or drops items
      const resultMap = new Map(results.map((r) => [r.word.toLowerCase(), r]));
      for (const w of batch) {
        const found = resultMap.get(w.toLowerCase());
        if (found) {
          enrichedAll.push(found);
        } else {
          // Fallback: insert with empty definition if AI skipped this word
          enrichedAll.push({ word: w, part_of_speech: "other", definition: "", example: "" });
        }
      }
    } catch (e) {
      console.error("bulk-enrich: openai batch failed", e);
      // Fallback: insert without enrichment
      for (const w of batch) {
        enrichedAll.push({ word: w, part_of_speech: "other", definition: "", example: "" });
      }
    }
  }

  // ── Insert ──────────────────────────────────────────────────────────────────
  const rows = enrichedAll.map((e) => ({
    user_id: user.id,
    set_id: setId,
    word: e.word.slice(0, 500),
    definition: buildDefinitionHtml(e).slice(0, 5000),
    example: (e.example || "").slice(0, 1000),
    part_of_speech: e.part_of_speech || "other",
  }));

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, enriched: 0 });
  }

  try {
    const { data, error: insertErr } = await supabaseServer
      .from("flashcard_cards")
      .insert(rows)
      .select("id");

    if (insertErr) throw insertErr;

    return NextResponse.json({
      inserted: data?.length ?? rows.length,
      skipped,
      enriched: enrichedAll.filter((e) => e.definition).length,
    });
  } catch (e) {
    console.error("bulk-enrich: insert", e);
    return NextResponse.json({ error: "Failed to insert cards" }, { status: 500 });
  }
}
