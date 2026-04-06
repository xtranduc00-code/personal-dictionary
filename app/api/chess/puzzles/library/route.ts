import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export type LibraryPuzzle = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  level: "beginner" | "intermediate" | "hard" | "expert";
};

const VALID_LEVELS = new Set(["beginner", "intermediate", "hard", "expert"]);

let _allPromise: Promise<LibraryPuzzle[]> | null = null;
const _byLevel = new Map<string, LibraryPuzzle[]>();

async function loadPuzzles(): Promise<LibraryPuzzle[]> {
  if (!_allPromise) {
    const path = join(process.cwd(), "public", "chess-puzzles.json");
    _allPromise = readFile(path, "utf-8").then((raw) => JSON.parse(raw) as LibraryPuzzle[]);
  }
  return _allPromise;
}

async function getShuffledByLevel(level: string): Promise<LibraryPuzzle[]> {
  if (_byLevel.has(level)) return _byLevel.get(level)!;
  const subset = (await loadPuzzles()).filter((p) => p.level === level);
  const arr = [...subset];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  _byLevel.set(level, arr);
  return arr;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawLevel = url.searchParams.get("level") ?? "beginner";
  const level = VALID_LEVELS.has(rawLevel) ? rawLevel : "beginner";
  const theme = url.searchParams.get("theme") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));

  try {
    let puzzles = await getShuffledByLevel(level);

    if (theme) {
      puzzles = puzzles.filter((p) => p.themes.includes(theme));
    }

    const total = puzzles.length;
    const items = puzzles.slice(offset, offset + limit);
    const safe = items.filter((p) => p.level === level);

    return NextResponse.json({ items: safe, total, offset, limit, level });
  } catch (e) {
    console.error("[chess/puzzles/library]", e);
    return NextResponse.json(
      { items: [], total: 0, offset, limit, error: "Failed to load puzzle library" },
      { status: 500 },
    );
  }
}
