"use client";

import { DictionaryEntry, DictionarySense, WordRow } from "./types";
import { hasSupabaseEnv, supabase } from "./supabase";

function parseSense(s: unknown): DictionarySense | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  const pos = o.partOfSpeech ?? o.part_of_speech;
  const level = o.level;
  const ipa = o.ipaUs ?? o.ipa_us;
  const meaning = o.meaning;
  if (!pos || !level || !meaning) return null;
  return {
    partOfSpeech: String(pos) as DictionarySense["partOfSpeech"],
    level: String(level) as DictionarySense["level"],
    ipaUs: ipa != null ? String(ipa) : "N/A",
    meaning: String(meaning),
    synonyms: Array.isArray(o.synonyms) ? o.synonyms.map(String) : [],
    antonyms: Array.isArray(o.antonyms) ? o.antonyms.map(String) : [],
    examples: Array.isArray(o.examples) ? o.examples.map(String) : [],
  };
}

export function getSensesFromRow(row: WordRow): DictionarySense[] {
  if (Array.isArray(row.senses) && row.senses.length > 0) {
    return row.senses.map(parseSense).filter((x): x is DictionarySense => x !== null);
  }
  return [
    {
      partOfSpeech: row.part_of_speech,
      level: row.level,
      ipaUs: row.ipa_us ?? "N/A",
      meaning: row.meaning,
      synonyms: row.synonyms ?? [],
      antonyms: row.antonyms ?? [],
      examples: row.examples ?? [],
    },
  ];
}

function rowToSenses(row: WordRow): DictionarySense[] {
  return getSensesFromRow(row);
}

const STORAGE_KEY = "personal-dictionary.words";
const MAX_HISTORY_ITEMS = 150;

let supabaseUnavailable = false;
function useSupabase() {
  return hasSupabaseEnv && !supabaseUnavailable;
}
function markSupabaseUnavailable() {
  supabaseUnavailable = true;
}

function sortByUpdatedAtDesc(words: WordRow[]) {
  return [...words].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

function normalizeWordRow(input: Partial<WordRow>): WordRow | null {
  if (!input.id || !input.word || !input.normalized_word || !input.meaning) {
    return null;
  }
  const now = new Date().toISOString();
  const senses: DictionarySense[] =
    Array.isArray(input.senses) && input.senses.length > 0
      ? input.senses.map(parseSense).filter((x): x is DictionarySense => x !== null)
      : [];
  const first = senses[0];
  return {
    id: input.id,
    word: input.word,
    normalized_word: input.normalized_word,
    ipa_us: input.ipa_us ?? first?.ipaUs ?? "",
    is_saved: Boolean(input.is_saved),
    part_of_speech: (input.part_of_speech as WordRow["part_of_speech"]) || first?.partOfSpeech || "other",
    level: (input.level as WordRow["level"]) || first?.level || "B1",
    meaning: input.meaning,
    synonyms: Array.isArray(input.synonyms) ? input.synonyms : first?.synonyms ?? [],
    antonyms: Array.isArray(input.antonyms) ? input.antonyms : first?.antonyms ?? [],
    examples: Array.isArray(input.examples) ? input.examples : first?.examples ?? [],
    note: input.note ?? null,
    tags: Array.isArray(input.tags) ? input.tags : [],
    senses: senses.length > 0 ? senses : undefined,
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };
}

function applyHistoryLimit(words: WordRow[]) {
  const sorted = sortByUpdatedAtDesc(words);
  const saved = sorted.filter((w) => w.is_saved);
  const historyOnly = sorted.filter((w) => !w.is_saved);
  const keptHistory = historyOnly.slice(0, MAX_HISTORY_ITEMS);
  return sortByUpdatedAtDesc([...saved, ...keptHistory]);
}

// ---- LocalStorage fallback (when Supabase env not set) ----
function loadFromLocalStorage(): WordRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<WordRow>[];
    if (!Array.isArray(parsed)) return [];
    return sortByUpdatedAtDesc(
      parsed
        .map((row) => normalizeWordRow(row))
        .filter((row): row is WordRow => row !== null),
    );
  } catch {
    return [];
  }
}

function saveToLocalStorage(words: WordRow[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sortByUpdatedAtDesc(words)),
  );
}

// ---- Supabase ----
function rowFromDb(r: Record<string, unknown>): WordRow {
  const rawSenses = r.senses;
  const senses: DictionarySense[] =
    Array.isArray(rawSenses) && rawSenses.length > 0
      ? rawSenses.map(parseSense).filter((x): x is DictionarySense => x !== null)
      : [];
  const first = senses[0];
  return {
    id: String(r.id),
    word: String(r.word),
    normalized_word: String(r.normalized_word),
    ipa_us: r.ipa_us != null ? String(r.ipa_us) : (first?.ipaUs ?? ""),
    is_saved: Boolean(r.is_saved),
    part_of_speech: (r.part_of_speech as WordRow["part_of_speech"]) || first?.partOfSpeech || "other",
    level: (r.level as WordRow["level"]) || first?.level || "B1",
    meaning: String(r.meaning),
    synonyms: Array.isArray(r.synonyms) ? r.synonyms.map(String) : (first?.synonyms ?? []),
    antonyms: Array.isArray(r.antonyms) ? r.antonyms.map(String) : (first?.antonyms ?? []),
    examples: Array.isArray(r.examples) ? r.examples.map(String) : (first?.examples ?? []),
    note: r.note != null && r.note !== "" ? String(r.note) : null,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    senses: senses.length > 0 ? senses : undefined,
    created_at: new Date(String(r.created_at)).toISOString(),
    updated_at: new Date(String(r.updated_at)).toISOString(),
  };
}

async function loadFromSupabase(): Promise<WordRow[]> {
  const { data, error } = await supabase
    .from("words")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    markSupabaseUnavailable();
    return applyHistoryLimit(loadFromLocalStorage());
  }
  const rows = (data ?? []).map((r) => rowFromDb(r as Record<string, unknown>));
  return applyHistoryLimit(rows);
}

// ---- Public API (async) ----
export async function loadWordsFromStorage(): Promise<WordRow[]> {
  if (useSupabase()) return loadFromSupabase();
  return Promise.resolve(applyHistoryLimit(loadFromLocalStorage()));
}

function mapWordRowToEntry(row: WordRow): DictionaryEntry {
  return {
    word: row.word,
    senses: rowToSenses(row),
  };
}

export async function upsertSearchedWord(entry: DictionaryEntry): Promise<WordRow> {
  const normalizedWord = entry.word.trim().toLowerCase();
  const now = new Date().toISOString();
  const senses = entry.senses?.length ? entry.senses : [];
  const first = senses[0];

  if (useSupabase()) {
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from("words")
        .select("id, is_saved, created_at, note, tags")
        .eq("normalized_word", normalizedWord)
        .maybeSingle();

      if (fetchErr) {
        markSupabaseUnavailable();
        return upsertLocal(entry, normalizedWord, now);
      }

      const id = existing?.id ?? crypto.randomUUID();
      const legacy = first ?? {
        partOfSpeech: "other" as const,
        level: "B1" as const,
        ipaUs: "N/A",
        meaning: "",
        synonyms: [],
        antonyms: [],
        examples: [],
      };
      const sensesPayload = senses.map((s) => ({
        partOfSpeech: s.partOfSpeech,
        level: s.level,
        ipaUs: s.ipaUs,
        meaning: s.meaning,
        synonyms: s.synonyms,
        antonyms: s.antonyms,
        examples: s.examples,
      }));
      const payload = {
        id,
        word: entry.word,
        normalized_word: normalizedWord,
        ipa_us: legacy.ipaUs,
        is_saved: existing?.is_saved ?? false,
        part_of_speech: legacy.partOfSpeech,
        level: legacy.level,
        meaning: legacy.meaning,
        synonyms: legacy.synonyms,
        antonyms: legacy.antonyms,
        examples: legacy.examples,
        note: (existing as { note?: string } | null)?.note ?? null,
        tags: (existing as { tags?: string[] } | null)?.tags ?? [],
        senses: sensesPayload,
        updated_at: now,
        created_at: (existing as { created_at?: string } | null)?.created_at ?? now,
      };

      const { error } = await supabase
        .from("words")
        .upsert(payload, { onConflict: "normalized_word" });

      if (error) {
        markSupabaseUnavailable();
        return upsertLocal(entry, normalizedWord, now);
      }

      const { data: allHistory } = await supabase
        .from("words")
        .select("id")
        .eq("is_saved", false)
        .order("updated_at", { ascending: true });
      const history = allHistory ?? [];
      if (history.length > MAX_HISTORY_ITEMS) {
        const toDelete = history.slice(0, history.length - MAX_HISTORY_ITEMS).map((r) => r.id);
        await supabase.from("words").delete().in("id", toDelete);
      }

      return rowFromDb({ ...payload, created_at: payload.created_at, updated_at: now });
    } catch {
      markSupabaseUnavailable();
      return upsertLocal(entry, normalizedWord, now);
    }
  }

  return upsertLocal(entry, normalizedWord, now);
}

function upsertLocal(
  entry: DictionaryEntry,
  normalizedWord: string,
  now: string,
): WordRow {
  const all = loadFromLocalStorage();
  const existing = all.find((w) => w.normalized_word === normalizedWord);
  const senses = entry.senses?.length ? entry.senses : [];
  const first = senses[0] ?? {
    partOfSpeech: "other" as const,
    level: "B1" as const,
    ipaUs: "N/A",
    meaning: "",
    synonyms: [],
    antonyms: [],
    examples: [],
  };
  const nextWord: WordRow = {
    id: existing?.id ?? crypto.randomUUID(),
    word: entry.word,
    normalized_word: normalizedWord,
    ipa_us: first.ipaUs,
    is_saved: existing?.is_saved ?? false,
    part_of_speech: first.partOfSpeech,
    level: first.level,
    meaning: first.meaning,
    synonyms: first.synonyms,
    antonyms: first.antonyms,
    examples: first.examples,
    note: existing?.note ?? null,
    tags: existing?.tags ?? [],
    senses: senses.length > 0 ? senses : undefined,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const nextWords = existing
    ? all.map((w) => (w.id === existing.id ? nextWord : w))
    : [nextWord, ...all];
  saveToLocalStorage(applyHistoryLimit(nextWords));
  return nextWord;
}

export async function deleteWordFromStorage(id: string): Promise<void> {
  if (useSupabase()) {
    const { error } = await supabase.from("words").delete().eq("id", id);
    if (error) {
      markSupabaseUnavailable();
      const all = loadFromLocalStorage();
      saveToLocalStorage(all.filter((w) => w.id !== id));
      return;
    }
    return;
  }
  const all = loadFromLocalStorage();
  saveToLocalStorage(all.filter((w) => w.id !== id));
}

export async function setSavedStatusById(id: string, isSaved: boolean): Promise<WordRow | null> {
  if (useSupabase()) {
    const { data, error } = await supabase
      .from("words")
      .update({ is_saved: isSaved, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      markSupabaseUnavailable();
      const all = loadFromLocalStorage();
      const target = all.find((w) => w.id === id);
      if (!target) return null;
      const next = { ...target, is_saved: isSaved, updated_at: new Date().toISOString() };
      saveToLocalStorage(applyHistoryLimit(all.map((w) => (w.id === id ? next : w))));
      return next;
    }
    if (!data) return null;
    return rowFromDb(data as Record<string, unknown>);
  }
  const all = loadFromLocalStorage();
  const target = all.find((w) => w.id === id);
  if (!target) return null;
  const next = { ...target, is_saved: isSaved, updated_at: new Date().toISOString() };
  saveToLocalStorage(applyHistoryLimit(all.map((w) => (w.id === id ? next : w))));
  return next;
}

export async function setSavedStatusByWord(
  word: string,
  isSaved: boolean,
): Promise<WordRow | null> {
  const target = await getWordFromStorage(word);
  if (!target) return null;
  return setSavedStatusById(target.id, isSaved);
}

export async function getWordFromStorage(word: string): Promise<WordRow | null> {
  const normalizedWord = word.trim().toLowerCase();
  if (!normalizedWord) return null;
  if (useSupabase()) {
    const { data, error } = await supabase
      .from("words")
      .select("*")
      .eq("normalized_word", normalizedWord)
      .maybeSingle();
    if (error) {
      markSupabaseUnavailable();
      const found = loadFromLocalStorage().find((w) => w.normalized_word === normalizedWord);
      return found ?? null;
    }
    return data ? rowFromDb(data as Record<string, unknown>) : null;
  }
  const found = loadFromLocalStorage().find((w) => w.normalized_word === normalizedWord);
  return found ?? null;
}

export async function getWordEntryFromStorage(word: string): Promise<DictionaryEntry | null> {
  const matched = await getWordFromStorage(word);
  return matched ? mapWordRowToEntry(matched) : null;
}

export async function getHistoryWordsFromStorage(): Promise<WordRow[]> {
  const all = await loadWordsFromStorage();
  return all;
}

export async function getSavedWordsFromStorage(): Promise<WordRow[]> {
  const all = await loadWordsFromStorage();
  return all.filter((w) => w.is_saved);
}

export async function updateNoteById(id: string, note: string): Promise<WordRow | null> {
  if (useSupabase()) {
    const { data, error } = await supabase
      .from("words")
      .update({ note: note || null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      markSupabaseUnavailable();
      const all = loadFromLocalStorage();
      const target = all.find((w) => w.id === id);
      if (!target) return null;
      const next = { ...target, note: note || null, updated_at: new Date().toISOString() };
      saveToLocalStorage(all.map((w) => (w.id === id ? next : w)));
      return next;
    }
    return data ? rowFromDb(data as Record<string, unknown>) : null;
  }
  const all = loadFromLocalStorage();
  const target = all.find((w) => w.id === id);
  if (!target) return null;
  const next = { ...target, note: note || null, updated_at: new Date().toISOString() };
  saveToLocalStorage(all.map((w) => (w.id === id ? next : w)));
  return next;
}

export async function updateTagsById(id: string, tags: string[]): Promise<WordRow | null> {
  const normalized = tags.map((t) => t.trim()).filter(Boolean);
  if (useSupabase()) {
    const { data, error } = await supabase
      .from("words")
      .update({ tags: normalized, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      markSupabaseUnavailable();
      const all = loadFromLocalStorage();
      const target = all.find((w) => w.id === id);
      if (!target) return null;
      const next = { ...target, tags: normalized, updated_at: new Date().toISOString() };
      saveToLocalStorage(all.map((w) => (w.id === id ? next : w)));
      return next;
    }
    return data ? rowFromDb(data as Record<string, unknown>) : null;
  }
  const all = loadFromLocalStorage();
  const target = all.find((w) => w.id === id);
  if (!target) return null;
  const next = { ...target, tags: normalized, updated_at: new Date().toISOString() };
  saveToLocalStorage(all.map((w) => (w.id === id ? next : w)));
  return next;
}
