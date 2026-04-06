import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export type LibraryPuzzle = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  level: "beginner" | "intermediate" | "hard" | "expert";
};

let _all: LibraryPuzzle[] | null = null;
// Pre-computed per-level shuffled arrays (stable within a server instance)
const _byLevel = new Map<string, LibraryPuzzle[]>();

function loadPuzzles(): LibraryPuzzle[] {
  if (_all) return _all;
  const path = join(process.cwd(), "public", "chess-puzzles.json");
  _all = JSON.parse(readFileSync(path, "utf-8")) as LibraryPuzzle[];
  return _all;
}

function getShuffledByLevel(level: string): LibraryPuzzle[] {
  if (_byLevel.has(level)) return _byLevel.get(level)!;
  // Filter strictly by level label, then shuffle once
  const subset = loadPuzzles().filter((p) => p.level === level);
  const arr = [...subset];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  _byLevel.set(level, arr);
  return arr;
}

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const level  = url.searchParams.get("level") ?? "beginner";
  const theme  = url.searchParams.get("theme") ?? "";
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  // Always filter strictly by level; use stable pre-shuffled order
  let puzzles = getShuffledByLevel(level);

  if (theme) {
    puzzles = puzzles.filter((p) => p.themes.includes(theme));
  }

  const total = puzzles.length;
  const items = puzzles.slice(offset, offset + limit);

  // Sanity guard: ensure every returned item truly matches the requested level
  const safe = items.filter((p) => p.level === level);

  return NextResponse.json({ items: safe, total, offset, limit });
}
