import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LENGTH = 2;
let wordList: string[] | null = null;
const cache = new Map<string, string[]>();
const CACHE_MAX = 200;
async function getWordList(): Promise<string[]> {
    if (wordList)
        return wordList;
    const path = join(process.cwd(), "data", "common-words.json");
    const raw = await readFile(path, "utf-8");
    wordList = JSON.parse(raw) as string[];
    return wordList;
}
function getSuggestions(words: string[], q: string): string[] {
    const lower = q.trim().toLowerCase();
    if (lower.length < MIN_QUERY_LENGTH)
        return [];
    const out: string[] = [];
    for (const w of words) {
        if (w.startsWith(lower)) {
            out.push(w);
            if (out.length >= MAX_SUGGESTIONS)
                break;
        }
    }
    return out;
}
export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const trimmed = q.trim().toLowerCase();
    if (trimmed.length < MIN_QUERY_LENGTH) {
        return NextResponse.json([]);
    }
    const cached = cache.get(trimmed);
    if (cached)
        return NextResponse.json(cached);
    try {
        const words = await getWordList();
        const suggestions = getSuggestions(words, trimmed);
        if (cache.size >= CACHE_MAX) {
            const first = cache.keys().next().value;
            if (first)
                cache.delete(first);
        }
        cache.set(trimmed, suggestions);
        return NextResponse.json(suggestions);
    }
    catch {
        return NextResponse.json([]);
    }
}
