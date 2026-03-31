#!/usr/bin/env node
/**
 * Normalize IELTS topic vocab items in-place (Supabase table: ielts_topic_vocab).
 *
 * Goal: make the list "clean" without manually editing each word:
 * - Split multi-line `example` notes into `examples[]`
 * - Keep `example` as the first example (for legacy UI)
 * - Merge duplicate words (case-insensitive)
 * - Trim whitespace, remove obvious prefixes like "e.g." and "1/"
 *
 * Usage:
 *   node scripts/normalize-topic-vocab.mjs <topicId>
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import crypto from "node:crypto";

const topicId = process.argv[2];
if (!topicId) {
  console.error("Usage: node scripts/normalize-topic-vocab.mjs <topicId>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normWordKey(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function uniqPush(arr, v) {
  const t = String(v ?? "").trim();
  if (!t) return;
  const k = t.toLowerCase();
  if (!arr.some((x) => String(x).trim().toLowerCase() === k)) arr.push(t);
}

function cleanLine(s) {
  let t = String(s ?? "").trim();
  if (!t) return "";
  // Strip leading markers like "e.g.", "eg.", "-", "•", "1/".
  t = t.replace(/^e\.?\s*g\.?\s*[:\-]?\s*/i, "");
  t = t.replace(/^[-•]\s*/, "");
  t = t.replace(/^\(?\d+\)?\s*[\/.)-]\s*/, "");
  // Normalize spacing.
  t = t.replace(/\s+/g, " ").trim();
  // Minimal typo fixes that are safe-ish for your dataset.
  t = t
    .replace(/\bcannt\b/gi, "can't")
    .replace(/\bdoesnt\b/gi, "doesn't")
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bim\b/gi, "I'm")
    .replace(/\bive\b/gi, "I've")
    .replace(/\bwing any bell\b/gi, "ring a bell");
  return t;
}

function splitExamples(exampleRaw) {
  const raw = String(exampleRaw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!raw.trim()) return [];
  const lines = raw
    .split("\n")
    .map((l) => cleanLine(l))
    .filter(Boolean);

  // If user wrote "e.g. 1/ ... 2/ ..." in one line, try splitting on numbers.
  if (lines.length === 1) {
    const one = lines[0];
    const parts = one
      .split(/\s*(?:\d+\s*\/|\d+\s*\.)\s*/g)
      .map((p) => cleanLine(p))
      .filter(Boolean);
    if (parts.length >= 2) return parts;
  }

  return lines;
}

function stableDigest(obj) {
  const json = JSON.stringify(obj);
  return crypto.createHash("sha1").update(json).digest("hex");
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
const beforeDigest = stableDigest(items);

// Merge by normalized word.
const byKey = new Map();
const order = [];

for (const it of items) {
  const word = typeof it?.word === "string" ? it.word.trim().replace(/\s+/g, " ") : "";
  if (!word) continue;
  const key = normWordKey(word);
  if (!byKey.has(key)) {
    byKey.set(key, {
      word,
      explanations: [],
      examples: [],
      sentences: [],
      // keep original-ish order
      _firstSeenIndex: order.length,
    });
    order.push(key);
  }
  const agg = byKey.get(key);
  if (typeof it?.explanation === "string") uniqPush(agg.explanations, it.explanation);

  // Collect examples: old `example` + optional `examples[]`.
  for (const ex of splitExamples(it?.example)) uniqPush(agg.examples, ex);
  if (Array.isArray(it?.examples)) {
    for (const ex of it.examples) uniqPush(agg.examples, cleanLine(ex));
  }
  if (Array.isArray(it?.sentences)) {
    for (const s of it.sentences) uniqPush(agg.sentences, cleanLine(s));
  }
}

const normalized = order
  .map((key) => byKey.get(key))
  .filter(Boolean)
  .map((agg) => {
    const out = { word: agg.word };
    const expl = agg.explanations.map((s) => cleanLine(s)).filter(Boolean);
    if (expl.length) out.explanation = expl.join("\n");
    if (agg.examples.length) {
      out.example = agg.examples[0];
      if (agg.examples.length > 1) out.examples = agg.examples;
    }
    if (agg.sentences.length) out.sentences = agg.sentences;
    return out;
  });

const afterDigest = stableDigest(normalized);
if (afterDigest === beforeDigest) {
  console.log("No changes needed.");
  process.exit(0);
}

const { error: upErr } = await db
  .from("ielts_topic_vocab")
  .upsert({ topic_id: topicId, items: normalized }, { onConflict: "topic_id" });

if (upErr) {
  console.error("Upsert failed:", upErr);
  process.exit(1);
}

console.log(
  `Normalized vocab items for topic ${topicId}: ${items.length} -> ${normalized.length}`,
);
