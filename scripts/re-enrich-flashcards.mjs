#!/usr/bin/env node
/**
 * Re-enrich flashcard_cards that are missing examples (no <em> tag in definition).
 *
 * Usage:
 *   node scripts/re-enrich-flashcards.mjs [--dry-run] [--limit=100] [--set=SET_ID] [--all]
 *
 *   --all       re-enrich ALL cards, not just those missing examples
 *   --dry-run   show what would be updated without writing to DB
 *   --limit=N   process at most N cards (default: no limit)
 *   --set=ID    only process cards in a specific set
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   OPENAI_MODEL (optional, default gpt-4.1-mini)
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import process from "node:process";

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const allCards = args.includes("--all");
const limitArg = args.find((a) => a.startsWith("--limit="));
const setArg = args.find((a) => a.startsWith("--set="));
const limit = limitArg ? Number(limitArg.split("=")[1]) || 0 : 0;
const setId = setArg ? setArg.split("=")[1] : null;

// ── Clients ──────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

const BATCH_SIZE = 15;

// ── Fetch cards ──────────────────────────────────────────────────────────────
async function fetchCards() {
  let query = supabase
    .from("flashcard_cards")
    .select("id, word, definition, part_of_speech, set_id")
    .order("created_at", { ascending: true });

  if (setId) query = query.eq("set_id", setId);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch cards:", error);
    process.exit(1);
  }

  if (allCards) return data ?? [];

  // Filter to cards missing example (no <em> tag in definition)
  return (data ?? []).filter((c) => {
    if (!c.definition) return true;
    return !c.definition.includes("<em>");
  });
}

// ── OpenAI enrichment ────────────────────────────────────────────────────────
async function enrichBatch(words) {
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
  const json = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(json);
}

// ── Build HTML ───────────────────────────────────────────────────────────────
const posLabel = {
  noun: "n.", verb: "v.", adjective: "adj.", adverb: "adv.", phrase: "phr.", other: "",
};

function buildDefinitionHtml(enriched) {
  const pos = posLabel[enriched.part_of_speech] ?? enriched.part_of_speech;
  const posHtml = pos
    ? `<span style="font-style:italic;color:#888;margin-right:6px">${pos}</span>`
    : "";
  return [
    `<p>${posHtml}${enriched.definition}</p>`,
    enriched.example
      ? `<p style="color:#666;border-left:3px solid #e5a;padding-left:8px;margin-top:6px"><em>${enriched.example}</em></p>`
      : "",
  ].filter(Boolean).join("");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const cards = await fetchCards();
  console.log(`Found ${cards.length} cards to re-enrich${dryRun ? " (dry-run)" : ""}`);

  if (cards.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);
    const words = batch.map((c) => c.word);

    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}: ${words.join(", ")}`);

    try {
      const results = await enrichBatch(words);
      const resultMap = new Map(results.map((r) => [r.word.toLowerCase(), r]));

      for (const card of batch) {
        const enriched = resultMap.get(card.word.toLowerCase());
        if (!enriched || !enriched.definition) {
          console.log(`  ✗ ${card.word} — no result from AI`);
          failed++;
          continue;
        }

        const newDef = buildDefinitionHtml(enriched);
        const newPos = enriched.part_of_speech || card.part_of_speech || "other";

        if (dryRun) {
          console.log(`  ✓ ${card.word} → ${enriched.definition.slice(0, 60)}...`);
          console.log(`    example: ${enriched.example}`);
          updated++;
          continue;
        }

        const { error } = await supabase
          .from("flashcard_cards")
          .update({ definition: newDef, part_of_speech: newPos })
          .eq("id", card.id);

        if (error) {
          console.error(`  ✗ ${card.word} — update failed:`, error.message);
          failed++;
        } else {
          console.log(`  ✓ ${card.word}`);
          updated++;
        }
      }
    } catch (e) {
      console.error(`  Batch failed:`, e.message);
      failed += batch.length;
    }

    // Rate limit courtesy
    if (i + BATCH_SIZE < cards.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
