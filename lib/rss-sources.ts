import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Preset RSS sources that we can handle with the generic `rss-parser` flow.
 * HBR is NOT in this list — hbr.org/feed returns 404 and their RSS is unreliable;
 * it's routed through a dedicated cheerio scraper in `lib/hbr-scrape.ts` instead.
 */
export type RssPresetKey =
    | "guardian"
    | "farnamstreet"
    | "paulgraham"
    | "a16z"
    | "quanta"
    | "vietcetera";

export type RssSource = {
    name: string;
    url: string;
    label: string;
    preset: boolean;
};

const PRESET_SOURCES: Record<RssPresetKey, { url: string; label: string }> = {
    guardian: { url: "https://www.theguardian.com/world/rss", label: "The Guardian · World" },
    farnamstreet: { url: "https://fs.blog/feed", label: "Farnam Street" },
    paulgraham: { url: "http://www.paulgraham.com/rss.html", label: "Paul Graham" },
    a16z: { url: "https://a16z.com/feed", label: "a16z" },
    quanta: { url: "https://www.quantamagazine.org/feed", label: "Quanta Magazine" },
    vietcetera: { url: "https://vietcetera.com/feeed/", label: "Vietcetera" },
};

type CustomSourcesFile = {
    custom: Array<{ name: string; url: string; label?: string }>;
};

/** Path to the mutable custom-sources store. `path.join` for cross-platform (Windows). */
function sourcesFilePath(): string {
    return path.join(process.cwd(), "data", "rss-sources.json");
}

async function readCustomFile(): Promise<CustomSourcesFile> {
    try {
        const raw = await fs.readFile(sourcesFilePath(), "utf8");
        const parsed = JSON.parse(raw) as Partial<CustomSourcesFile>;
        const custom = Array.isArray(parsed.custom) ? parsed.custom : [];
        return { custom };
    } catch {
        return { custom: [] };
    }
}

async function writeCustomFile(file: CustomSourcesFile): Promise<void> {
    await fs.writeFile(sourcesFilePath(), JSON.stringify(file, null, 4) + "\n", "utf8");
}

export async function listRssSources(): Promise<RssSource[]> {
    const presets = Object.entries(PRESET_SOURCES).map(
        ([name, meta]): RssSource => ({
            name,
            url: meta.url,
            label: meta.label,
            preset: true,
        }),
    );
    const { custom } = await readCustomFile();
    const customNormalized = custom.map(
        (c): RssSource => ({
            name: c.name,
            url: c.url,
            label: c.label?.trim() || c.name,
            preset: false,
        }),
    );
    return [...presets, ...customNormalized];
}

export async function resolveRssSource(name: string): Promise<RssSource | null> {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    if (key in PRESET_SOURCES) {
        const meta = PRESET_SOURCES[key as RssPresetKey];
        return { name: key, url: meta.url, label: meta.label, preset: true };
    }
    const { custom } = await readCustomFile();
    const hit = custom.find((c) => c.name.toLowerCase() === key);
    if (!hit) return null;
    return {
        name: hit.name,
        url: hit.url,
        label: hit.label?.trim() || hit.name,
        preset: false,
    };
}

export async function addCustomRssSource(input: {
    name: string;
    url: string;
    label?: string;
}): Promise<RssSource> {
    const name = input.name.trim().toLowerCase();
    const url = input.url.trim();
    if (!name || !url) {
        throw new Error("Both name and url are required.");
    }
    try {
        const u = new URL(url);
        if (!["http:", "https:"].includes(u.protocol)) {
            throw new Error("RSS url must be http(s).");
        }
    } catch {
        throw new Error("Invalid RSS url.");
    }
    if (name in PRESET_SOURCES) {
        throw new Error(`"${name}" is a preset source — pick another name.`);
    }
    const file = await readCustomFile();
    const idx = file.custom.findIndex((c) => c.name.toLowerCase() === name);
    const entry = { name, url, label: input.label?.trim() || name };
    if (idx >= 0) file.custom[idx] = entry;
    else file.custom.push(entry);
    await writeCustomFile(file);
    return { ...entry, preset: false };
}
