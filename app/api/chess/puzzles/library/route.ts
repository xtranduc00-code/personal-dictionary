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

let _cache: LibraryPuzzle[] | null = null;

function loadPuzzles(): LibraryPuzzle[] {
  if (_cache) return _cache;
  const path = join(process.cwd(), "public", "chess-puzzles.json");
  _cache = JSON.parse(readFileSync(path, "utf-8")) as LibraryPuzzle[];
  return _cache;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const level   = url.searchParams.get("level") ?? "beginner";
  const theme   = url.searchParams.get("theme") ?? "";
  const limit   = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
  const offset  = parseInt(url.searchParams.get("offset") ?? "0");
  const random  = url.searchParams.get("random") === "true";

  let puzzles = loadPuzzles().filter((p) => p.level === level);

  if (theme) {
    puzzles = puzzles.filter((p) => p.themes.includes(theme));
  }

  if (random) {
    // Fisher-Yates shuffle on a copy
    const arr = [...puzzles];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    puzzles = arr;
  }

  const total = puzzles.length;
  const items = puzzles.slice(offset, offset + limit);

  return NextResponse.json({ items, total, offset, limit });
}
