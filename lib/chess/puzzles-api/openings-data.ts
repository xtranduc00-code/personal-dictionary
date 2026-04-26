import { readFile } from "fs/promises";
import { join } from "path";

export interface OpeningVariation {
  key: string;
  name: string;
}
export interface OpeningEntry {
  family: string;
  key: string;
  color: "white" | "black";
  ecoRange: string[];
  variations: OpeningVariation[];
}
interface OpeningsFile {
  openings: OpeningEntry[];
}

let _openingsPromise: Promise<OpeningsFile> | null = null;
let _byKeyCache: Map<string, OpeningEntry> | null = null;
/** Variation key → { parent family, variation } so route handlers can
 *  resolve a `?key=Sicilian_Defense_Najdorf_Variation` deep-link without
 *  walking every family on every request. */
let _variationCache: Map<string, { parent: OpeningEntry; variation: OpeningVariation }> | null = null;
let _allKeysCache: string[] | null = null;

async function loadOpeningsFile(): Promise<OpeningsFile> {
  if (!_openingsPromise) {
    const path = join(process.cwd(), "data", "openings.json");
    _openingsPromise = readFile(path, "utf-8").then((raw) => JSON.parse(raw) as OpeningsFile);
  }
  return _openingsPromise;
}

export async function getOpeningsCatalogue(): Promise<OpeningsFile> {
  return loadOpeningsFile();
}

export async function getOpeningByKey(key: string): Promise<OpeningEntry | null> {
  if (!_byKeyCache) {
    const file = await loadOpeningsFile();
    _byKeyCache = new Map(file.openings.map((o) => [o.key, o]));
  }
  return _byKeyCache.get(key) ?? null;
}

/** Resolve either a family key OR a variation key. Returns family info
 *  with `variation` set when the key matched a sub-variation. */
export async function getOpeningOrVariationByKey(
  key: string,
): Promise<
  | { family: OpeningEntry; variation: OpeningVariation | null }
  | null
> {
  const family = await getOpeningByKey(key);
  if (family) return { family, variation: null };

  if (!_variationCache) {
    const file = await loadOpeningsFile();
    const map = new Map<string, { parent: OpeningEntry; variation: OpeningVariation }>();
    for (const o of file.openings) {
      for (const v of o.variations) map.set(v.key, { parent: o, variation: v });
    }
    _variationCache = map;
  }
  const hit = _variationCache.get(key);
  if (!hit) return null;
  return { family: hit.parent, variation: hit.variation };
}

/** Flat list of every opening + variation key so we can synthesize stable
 *  per-puzzle opening tags for mock mode without re-parsing the JSON. */
export async function getAllOpeningKeys(): Promise<string[]> {
  if (_allKeysCache) return _allKeysCache;
  const file = await loadOpeningsFile();
  const keys: string[] = [];
  for (const o of file.openings) {
    keys.push(o.key);
    for (const v of o.variations) keys.push(v.key);
  }
  _allKeysCache = keys;
  return keys;
}

export async function suggestOpeningKeys(needle: string, limit = 5): Promise<string[]> {
  const file = await loadOpeningsFile();
  const lower = needle.toLowerCase();
  const out: string[] = [];
  for (const o of file.openings) {
    if (o.key.toLowerCase().includes(lower) || o.family.toLowerCase().includes(lower)) {
      out.push(o.key);
      if (out.length >= limit) return out;
    }
    for (const v of o.variations) {
      if (v.key.toLowerCase().includes(lower) || v.name.toLowerCase().includes(lower)) {
        out.push(v.key);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

