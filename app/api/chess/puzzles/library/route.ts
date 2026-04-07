import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

import type { LibraryPuzzle } from "@/lib/chess-types";
export type { LibraryPuzzle };

const VALID_LEVELS = new Set(["beginner", "intermediate", "hard", "expert"]);
const VALID_SORT = new Set(["rating_asc", "rating_desc", "newest"]);
const VALID_PROGRESS = new Set(["all", "unsolved", "solved"]);

async function loadSolvedForLevel(
  userId: string,
  level: string,
): Promise<{ ids: Set<string>; count: number }> {
  const db = supabaseForUserData();
  const { data, error } = await db
    .from("user_puzzle_progress")
    .select("puzzle_id")
    .eq("user_id", userId)
    .eq("puzzle_level", level);
  if (error) {
    console.warn("[chess/puzzles/library] user_puzzle_progress:", error.message);
    return { ids: new Set(), count: 0 };
  }
  const ids = new Set((data ?? []).map((r) => String((r as { puzzle_id: string }).puzzle_id)));
  return { ids, count: ids.size };
}

let _allPromise: Promise<LibraryPuzzle[]> | null = null;
/** Per-level subsets (insertion order from JSON preserved for "newest"). */
const _byLevel = new Map<string, LibraryPuzzle[]>();
let _idOrder: Map<string, number> | null = null;

async function loadPuzzles(): Promise<LibraryPuzzle[]> {
  if (!_allPromise) {
    const path = join(process.cwd(), "data", "chess-puzzles.json");
    _allPromise = readFile(path, "utf-8").then((raw) => JSON.parse(raw) as LibraryPuzzle[]);
  }
  return _allPromise;
}

async function getIdOrder(): Promise<Map<string, number>> {
  if (_idOrder) return _idOrder;
  const all = await loadPuzzles();
  _idOrder = new Map(all.map((p, i) => [p.id, i]));
  return _idOrder;
}

async function getPuzzlesForLevel(level: string): Promise<LibraryPuzzle[]> {
  if (_byLevel.has(level)) return _byLevel.get(level)!;
  const all = await loadPuzzles();
  const subset = all.filter((p) => p.level === level);
  _byLevel.set(level, subset);
  return subset;
}

function applySearch(puzzles: LibraryPuzzle[], q: string): LibraryPuzzle[] {
  const raw = q.trim();
  if (!raw) return puzzles;
  const needle = raw.replace(/^#/, "").trim().toLowerCase();
  if (!needle) return puzzles;
  return puzzles.filter((p) => {
    if (p.id.toLowerCase().includes(needle)) return true;
    return p.themes.some((t) => t.toLowerCase().includes(needle));
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawLevel = url.searchParams.get("level") ?? "beginner";
  const level = VALID_LEVELS.has(rawLevel) ? rawLevel : "beginner";
  const theme = url.searchParams.get("theme") ?? "";
  const q = url.searchParams.get("q") ?? "";
  const sortRaw = url.searchParams.get("sort") ?? "newest";
  const sort = VALID_SORT.has(sortRaw) ? sortRaw : "newest";
  const progressRaw = url.searchParams.get("progress") ?? "all";
  const progress = VALID_PROGRESS.has(progressRaw) ? progressRaw : "all";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10), 1), 50);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));

  try {
    const user = await getAuthUser(req);
    let solvedIds = new Set<string>();
    let solvedCount = 0;

    let puzzles = await getPuzzlesForLevel(level);
    const levelGrandTotal = puzzles.length;

    if (user) {
      const s = await loadSolvedForLevel(user.id, level);
      solvedIds = s.ids;
      solvedCount = s.count;
    }

    if (theme) {
      puzzles = puzzles.filter((p) => p.themes.includes(theme));
    }

    puzzles = applySearch(puzzles, q);

    if (user && progress === "solved") {
      puzzles = puzzles.filter((p) => solvedIds.has(p.id));
    } else if (user && progress === "unsolved") {
      puzzles = puzzles.filter((p) => !solvedIds.has(p.id));
    }

    const orderMap = await getIdOrder();
    const puzzlesCopy = [...puzzles];

    switch (sort) {
      case "rating_asc":
        puzzlesCopy.sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
        break;
      case "rating_desc":
        puzzlesCopy.sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
        break;
      case "newest":
      default:
        puzzlesCopy.sort(
          (a, b) => (orderMap.get(b.id) ?? 0) - (orderMap.get(a.id) ?? 0),
        );
        break;
    }

    const total = puzzlesCopy.length;
    const items = puzzlesCopy.slice(offset, offset + limit);

    const payload: Record<string, unknown> = {
      items,
      total,
      offset,
      limit,
      level,
      sort,
      progress,
      levelGrandTotal,
    };
    if (user) {
      payload.solvedCount = solvedCount;
      payload.solvedPuzzleIds = [...solvedIds];
    }

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[chess/puzzles/library]", e);
    return NextResponse.json(
      { items: [], total: 0, offset, limit, error: "Failed to load puzzle library" },
      { status: 500 },
    );
  }
}
