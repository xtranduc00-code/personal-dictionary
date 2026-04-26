#!/usr/bin/env tsx
/**
 * Rewrites data/openings.json so each `key` matches an actual opening_tag
 * value found in the puzzle dataset. Family + variation names are derived
 * from the underscore-separated tag (Italian_Game_Two_Knights_Defense →
 * "Italian Game" family with "Two Knights Defense" variation).
 *
 * Curated families list — picked from the spec (28 families × ~74 variations,
 * 12 White / 16 Black). For each family we take the top variations by
 * puzzle count from the actual dataset. Anything we don't recognise stays
 * unmapped (no harm — those tags simply won't appear in the UI).
 */
import Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface FamilySpec {
  family: string;
  prefix: string;            // exact dataset prefix, e.g. "Italian_Game"
  color: "white" | "black";
  ecoRange: string[];
  /** Max number of variations to keep (top by puzzle count). */
  maxVariations: number;
}

const FAMILIES: FamilySpec[] = [
  // ── White openings ──
  { family: "Italian Game",          prefix: "Italian_Game",            color: "white", ecoRange: ["C50","C54"], maxVariations: 5 },
  { family: "Ruy Lopez",             prefix: "Ruy_Lopez",               color: "white", ecoRange: ["C60","C99"], maxVariations: 6 },
  { family: "Scotch Game",           prefix: "Scotch_Game",             color: "white", ecoRange: ["C44","C45"], maxVariations: 4 },
  { family: "King's Gambit",         prefix: "Kings_Gambit",            color: "white", ecoRange: ["C30","C39"], maxVariations: 4 },
  { family: "Vienna Game",           prefix: "Vienna_Game",             color: "white", ecoRange: ["C25","C29"], maxVariations: 3 },
  { family: "Queen's Gambit",        prefix: "Queens_Gambit",           color: "white", ecoRange: ["D06","D69"], maxVariations: 6 },
  { family: "London System",         prefix: "London_System",           color: "white", ecoRange: ["D02"],       maxVariations: 3 },
  { family: "English Opening",       prefix: "English_Opening",         color: "white", ecoRange: ["A10","A39"], maxVariations: 5 },
  { family: "Réti Opening",          prefix: "Reti_Opening",            color: "white", ecoRange: ["A04","A09"], maxVariations: 3 },
  { family: "Bird's Opening",        prefix: "Birds_Opening",           color: "white", ecoRange: ["A02","A03"], maxVariations: 2 },
  { family: "Catalan Opening",       prefix: "Catalan_Opening",         color: "white", ecoRange: ["E00","E09"], maxVariations: 3 },
  { family: "Trompowsky Attack",     prefix: "Trompowsky_Attack",       color: "white", ecoRange: ["A45"],       maxVariations: 2 },
  // ── Black openings ──
  { family: "Sicilian Defense",      prefix: "Sicilian_Defense",        color: "black", ecoRange: ["B20","B99"], maxVariations: 8 },
  { family: "French Defense",        prefix: "French_Defense",          color: "black", ecoRange: ["C00","C19"], maxVariations: 6 },
  { family: "Caro-Kann Defense",     prefix: "Caro-Kann_Defense",       color: "black", ecoRange: ["B10","B19"], maxVariations: 5 },
  { family: "Pirc Defense",          prefix: "Pirc_Defense",            color: "black", ecoRange: ["B07","B09"], maxVariations: 3 },
  { family: "Modern Defense",        prefix: "Modern_Defense",          color: "black", ecoRange: ["B06"],       maxVariations: 2 },
  { family: "Scandinavian Defense",  prefix: "Scandinavian_Defense",    color: "black", ecoRange: ["B01"],       maxVariations: 4 },
  { family: "Alekhine Defense",      prefix: "Alekhine_Defense",        color: "black", ecoRange: ["B02","B05"], maxVariations: 4 },
  { family: "Petroff Defense",       prefix: "Russian_Game",            color: "black", ecoRange: ["C42","C43"], maxVariations: 3 },
  { family: "Philidor Defense",      prefix: "Philidor_Defense",        color: "black", ecoRange: ["C41"],       maxVariations: 3 },
  { family: "King's Indian Defense", prefix: "Kings_Indian_Defense",    color: "black", ecoRange: ["E60","E99"], maxVariations: 6 },
  { family: "Nimzo-Indian Defense",  prefix: "Nimzo-Indian_Defense",    color: "black", ecoRange: ["E20","E59"], maxVariations: 5 },
  { family: "Queen's Indian Defense",prefix: "Queens_Indian_Defense",   color: "black", ecoRange: ["E12","E19"], maxVariations: 3 },
  { family: "Grünfeld Defense",      prefix: "Grunfeld_Defense",        color: "black", ecoRange: ["D70","D99"], maxVariations: 4 },
  { family: "Benoni Defense",        prefix: "Benoni_Defense",          color: "black", ecoRange: ["A60","A79"], maxVariations: 3 },
  { family: "Dutch Defense",         prefix: "Dutch_Defense",           color: "black", ecoRange: ["A80","A99"], maxVariations: 4 },
  { family: "Old Indian Defense",    prefix: "Old_Indian_Defense",      color: "black", ecoRange: ["A53","A55"], maxVariations: 2 },
];

const db = new Database(join(process.cwd(), "data", "puzzles.sqlite"));

function readableName(tag: string, prefix: string): string {
  // Strip the family prefix and turn underscores into spaces.
  const remainder = tag.startsWith(prefix + "_") ? tag.slice(prefix.length + 1) : tag;
  return remainder.replace(/_/g, " ");
}

function topVariations(prefix: string, max: number) {
  // Use GLOB rather than LIKE — `_` is a wildcard in LIKE and the dataset's
  // tags use literal underscores everywhere, so LIKE patterns over-match.
  // GLOB treats underscores as literals; `*` is the wildcard.
  const rows = db.prepare(
    `SELECT opening_tag AS tag, COUNT(*) AS n
       FROM puzzle_openings
      WHERE opening_tag GLOB ? AND opening_tag != ?
      GROUP BY opening_tag
      ORDER BY n DESC
      LIMIT ?`,
  ).all(`${prefix}_*`, prefix, max) as { tag: string; n: number }[];
  return rows;
}

const openings = FAMILIES.map((f) => {
  const familyExists = db
    .prepare(`SELECT 1 FROM puzzle_openings WHERE opening_tag = ? LIMIT 1`)
    .get(f.prefix);
  if (!familyExists) {
    console.warn(`  ! family prefix "${f.prefix}" missing from dataset — skipping`);
    return null;
  }
  return {
    family: f.family,
    key: f.prefix,
    color: f.color,
    ecoRange: f.ecoRange,
    variations: topVariations(f.prefix, f.maxVariations).map((v) => ({
      key: v.tag,
      name: readableName(v.tag, f.prefix),
    })),
  };
}).filter(Boolean);

const out = { openings };
const path = join(process.cwd(), "data", "openings.json");
writeFileSync(path, JSON.stringify(out, null, 2) + "\n", "utf-8");
console.log(
  `✓ Wrote ${path} — ${openings.length} families, ` +
    `${openings.reduce((n, o) => n + o!.variations.length, 0)} variations.`,
);

db.close();
