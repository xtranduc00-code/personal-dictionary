#!/usr/bin/env node
/**
 * Generate IELTS-ish example sentences for each vocab item and store in `sentences[]`.
 *
 * Usage:
 *   node scripts/generate-vocab-sentences.mjs <topicId> [--count=7]
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   OPENAI_MODEL (optional)
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import process from "node:process";

const topicId = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]);
const countArg = process.argv.find((a) => a.startsWith("--count="));
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const targetCount = Math.max(3, Math.min(12, Number((countArg?.split("=")[1] ?? "7")) || 7));
const limit = Math.max(0, Number((limitArg?.split("=")[1] ?? "0")) || 0);

if (!topicId) {
  console.error("Usage: node scripts/generate-vocab-sentences.mjs <topicId> [--count=7]");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
if (!supabaseUrl || !serviceKey) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!openaiKey) {
  console.error("Missing env: OPENAI_API_KEY");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const openai = new OpenAI({ apiKey: openaiKey });
const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}
function uniq(arr, v) {
  const t = clean(v);
  if (!t) return;
  const k = t.toLowerCase();
  if (!arr.some((x) => clean(x).toLowerCase() === k)) arr.push(t);
}
function looksLikeSentence(s) {
  const t = clean(s);
  if (t.length < 12) return false;
  // Has a space and some punctuation typical of sentences
  return /\s/.test(t) && /[.?!]/.test(t);
}

function extractTargetFromWord(wordRaw) {
  // User entries often look like: "emphasize (V) /ˈem.fə.saɪz/" or "hungry 🇭🇺"
  // We want the surface form the model should include in sentences.
  const w = clean(wordRaw);
  if (!w) return "";
  // If it's a comparison form like "expensive (adj) >< cheap", keep only the left side.
  const beforeOpp = w.split("><")[0]?.trim() ?? w;
  // Prefer the part before IPA slash.
  const beforeSlash = beforeOpp.split("/")[0]?.trim() ?? beforeOpp;
  // Drop trailing POS marker in parentheses.
  const beforeParen = beforeSlash.replace(/\s*\([^)]*\)\s*$/, "").trim();
  // Keep emoji/flags out of target.
  const noEmoji = beforeParen.replace(/[\p{Extended_Pictographic}]/gu, "").trim();
  // Normalize spaces again.
  return clean(noEmoji);
}

async function generateSentencesForItem(item) {
  const word = clean(item.word);
  const target = extractTargetFromWord(word);
  const explanation = clean(item.explanation);
  const patterns = Array.isArray(item.examples) ? item.examples.map(clean).filter(Boolean) : [];

  const prompt = [
    "You are helping a learner prepare for IELTS Speaking.",
    `Create ${targetCount} natural, short example sentences that use the exact target: ${JSON.stringify(target || word)}.`,
    "Rules:",
    "- Each sentence must be standalone and natural.",
    "- Keep them under 120 characters if possible.",
    "- Avoid repeating the same structure; vary contexts.",
    "- If the target is a phrase, keep it intact.",
    "- Do NOT output explanations, only a JSON array of strings.",
    explanation ? `Meaning/context: ${explanation}` : "",
    patterns.length ? `Notes/patterns (not sentences): ${patterns.join(" | ")}` : "",
  ].filter(Boolean).join("\n");

  const res = await openai.responses.create(
    {
      model,
      input: prompt,
      temperature: 0.8,
    },
    { timeout: 60_000 },
  );

  const text = (res.output_text ?? "").trim();
  // Expect a JSON array. Try parse; if fails, attempt to extract array substring.
  let arr;
  try {
    arr = JSON.parse(text);
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("Model did not return JSON array");
    arr = JSON.parse(m[0]);
  }
  if (!Array.isArray(arr)) throw new Error("Model output is not an array");

  const out = [];
  for (const s of arr) {
    const t = clean(s);
    if (!t) continue;
    // ensure it contains the target (case-insensitive)
    const mustContain = (target || word).toLowerCase();
    if (mustContain && !t.toLowerCase().includes(mustContain)) continue;
    uniq(out, t);
  }

  // If the model returned too few valid sentences, accept what we have.
  return out.slice(0, targetCount);
}

const { data: row, error } = await db
  .from("ielts_topic_vocab")
  .select("items")
  .eq("topic_id", topicId)
  .maybeSingle();
if (error) {
  console.error("Fetch failed:", error);
  process.exit(1);
}

const items = Array.isArray(row?.items) ? row.items : [];
let changed = 0;
let processed = 0;
let attempted = 0;

for (let i = 0; i < items.length; i++) {
  const it = items[i];
  if (!it || typeof it !== "object") continue;
  const word = clean(it.word);
  if (!word) continue;

  const existing = Array.isArray(it.sentences) ? it.sentences.map(clean).filter(Boolean) : [];
  const existingSentenceLike = existing.filter(looksLikeSentence);
  if (existingSentenceLike.length >= Math.min(5, targetCount)) continue;

  attempted += 1;
  if (limit > 0 && attempted > limit) break;
  processed += 1;
  try {
    const gen = await generateSentencesForItem(it);
    const merged = [...existingSentenceLike];
    for (const s of gen) uniq(merged, s);

    // Only write if we got something useful.
    if (merged.length) {
      it.sentences = merged;
      changed += 1;
      // Keep legacy `example` as first sentence if it looks like a real sentence.
      if (looksLikeSentence(it.example) === false && looksLikeSentence(merged[0])) {
        it.example = merged[0];
      }
    }
    // small delay to be gentle with rate limits
    await new Promise((r) => setTimeout(r, 150));
  } catch (e) {
    console.error(`Failed for "${word}" (index ${i}):`, e?.message ?? e);
  }

  if (processed % 5 === 0) {
    console.log(
      `Progress: processed ${processed}, changed ${changed} (last index ${i})`,
    );
  }
}

if (!changed) {
  console.log(`No changes. Processed candidates: ${processed}`);
  process.exit(0);
}

const { error: upErr } = await db
  .from("ielts_topic_vocab")
  .upsert({ topic_id: topicId, items }, { onConflict: "topic_id" });
if (upErr) {
  console.error("Upsert failed:", upErr);
  process.exit(1);
}

console.log(`Updated sentences[] for topic ${topicId}: changed ${changed} items (processed ${processed}).`);
