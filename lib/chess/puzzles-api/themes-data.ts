import { readFile } from "fs/promises";
import { join } from "path";

/** Shape of `data/themes.json` — one source of truth for the theme catalogue. */
export interface ThemeEntry {
  key: string;
  name: string;
  description: string;
}
export interface ThemeGroup {
  id: string;
  name: string;
  themes: ThemeEntry[];
}
interface ThemesFile {
  groups: ThemeGroup[];
}

/** Module-level cache: read the JSON once per server start. */
let _themesPromise: Promise<ThemesFile> | null = null;
let _byKeyCache: Map<string, { entry: ThemeEntry; group: ThemeGroup }> | null = null;

async function loadThemesFile(): Promise<ThemesFile> {
  if (!_themesPromise) {
    const path = join(process.cwd(), "data", "themes.json");
    _themesPromise = readFile(path, "utf-8").then((raw) => JSON.parse(raw) as ThemesFile);
  }
  return _themesPromise;
}

export async function getThemesCatalogue(): Promise<ThemesFile> {
  return loadThemesFile();
}

export async function getThemeByKey(
  key: string,
): Promise<{ entry: ThemeEntry; group: ThemeGroup } | null> {
  if (!_byKeyCache) {
    const file = await loadThemesFile();
    const map = new Map<string, { entry: ThemeEntry; group: ThemeGroup }>();
    for (const g of file.groups) {
      for (const t of g.themes) map.set(t.key, { entry: t, group: g });
    }
    _byKeyCache = map;
  }
  return _byKeyCache.get(key) ?? null;
}

/** "Did you mean…?" suggestion for 404 responses. Cheap Levenshtein-bounded
 *  prefix match — not perfect, just helpful. */
export async function suggestThemeKeys(needle: string, limit = 5): Promise<string[]> {
  const file = await loadThemesFile();
  const lower = needle.toLowerCase();
  const out: string[] = [];
  for (const g of file.groups) {
    for (const t of g.themes) {
      if (t.key.toLowerCase().includes(lower) || t.name.toLowerCase().includes(lower)) {
        out.push(t.key);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

