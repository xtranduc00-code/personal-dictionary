import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import type { LibraryPuzzle } from "@/lib/chess-types";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const path = join(process.cwd(), "data", "chess-puzzles.json");
    const raw = await readFile(path, "utf-8");
    const all = JSON.parse(raw) as LibraryPuzzle[];
    const puzzle = all.find((p) => p.id === id);
    if (!puzzle) {
      return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
    }
    return NextResponse.json({ puzzle });
  } catch (e) {
    console.error("[chess/puzzles/by-id]", e);
    return NextResponse.json({ error: "Failed to load puzzle" }, { status: 500 });
  }
}
