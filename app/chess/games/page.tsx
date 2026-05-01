"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Star, Trophy, X as XIcon } from "lucide-react";
import { authFetch } from "@/lib/auth-context";
import {
  GAME_PUZZLES_PAGE_SIZE,
  writeGamePuzzleNav,
} from "@/lib/chess/game-puzzle-nav";

/**
 * /chess/games — list view for puzzles extracted from my analysed games.
 *
 * Reuses no UI from /chess/puzzles intentionally: the filter shape is
 * different (no Lichess themes / openings / difficulty buckets — those
 * don't apply to game-derived puzzles) and the cards surface different
 * labels (Δ swing instead of Lichess rating). Same grid + pagination
 * pattern though.
 */

interface GamePuzzleItem {
  id: string;
  fen: string;
  moves: string[];
  rating: number;        // = swingCp; we render it as Δ in the card
  themes: string[];
  level: string;
  swingCp: number;
  classification: "mistake" | "blunder";
  gameId: string;
  fullmove: number;
  whiteName: string | null;
  blackName: string | null;
}

interface ListResponse {
  items: GamePuzzleItem[];
  total: number;
  hasMore: boolean;
}

function GamesPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const initial = {
    classification:
      (sp.get("classification") as "mistake" | "blunder" | null) ?? null,
    gameId: sp.get("gameId") ?? null,
    sort: (sp.get("sort") as "newest" | "hardest" | "easiest" | "random") ?? "newest",
    page: Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1),
  };

  const [classification, setClassification] = useState<
    "mistake" | "blunder" | null
  >(initial.classification);
  const [gameId, setGameId] = useState<string | null>(initial.gameId);
  const [sort, setSort] = useState(initial.sort);
  const [page, setPage] = useState(initial.page);
  const [items, setItems] = useState<GamePuzzleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Push state to URL on change so deep-links work.
  useEffect(() => {
    const p = new URLSearchParams();
    if (classification) p.set("classification", classification);
    if (gameId) p.set("gameId", gameId);
    if (sort !== "newest") p.set("sort", sort);
    if (page !== 1) p.set("page", String(page));
    const qs = p.toString();
    router.replace(`/chess/games${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [classification, gameId, sort, page, router]);

  // Fetch the list whenever a filter changes.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const p = new URLSearchParams({
      sort,
      limit: String(GAME_PUZZLES_PAGE_SIZE),
      offset: String((page - 1) * GAME_PUZZLES_PAGE_SIZE),
    });
    if (classification) p.set("classification", classification);
    if (gameId) p.set("gameId", gameId);
    authFetch(`/api/chess/game-puzzles?${p}`)
      .then(async (r) => {
        const data = (await r.json()) as ListResponse | { error?: string };
        if (!alive) return;
        if (!r.ok || "error" in data) {
          setError((data as { error?: string }).error ?? "Failed to load puzzles");
          setItems([]);
          setTotal(0);
        } else {
          setItems((data as ListResponse).items);
          setTotal((data as ListResponse).total);
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [classification, gameId, sort, page]);

  const totalPages = Math.max(1, Math.ceil(total / GAME_PUZZLES_PAGE_SIZE) || 1);
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * GAME_PUZZLES_PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(safePage * GAME_PUZZLES_PAGE_SIZE, total);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6">
      {/* Slim header */}
      <div className="flex items-center gap-2">
        <Link
          href="/chess"
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          aria-label="Back to chess"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          From my games
        </h1>
        <span className="font-mono text-[11px] text-zinc-400">
          ({total.toLocaleString()})
        </span>
        <Link
          href="/chess/stats"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Trophy className="h-3.5 w-3.5" /> Stats
        </Link>
      </div>

      {/* Filter row — classification + sort. No theme/opening sidebar:
           game puzzles don't share the Lichess theme catalogue. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/80">
          {(
            [
              { id: null, label: "All" },
              { id: "mistake", label: "Mistakes" },
              { id: "blunder", label: "Blunders" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                setClassification(opt.id);
                setPage(1);
              }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                classification === opt.id
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as typeof sort);
            setPage(1);
          }}
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <option value="newest">Most recently extracted</option>
          <option value="hardest">Biggest swing</option>
          <option value="easiest">Smallest swing</option>
          <option value="random">Random</option>
        </select>
        {gameId ? (
          <button
            type="button"
            onClick={() => {
              setGameId(null);
              setPage(1);
            }}
            className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50"
          >
            Single game · {gameId}
            <XIcon className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {loading && total === 0
          ? "Loading…"
          : total === 0
            ? "No game puzzles yet — analyse a game to extract trainable positions."
            : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()} puzzles · Page ${safePage} of ${totalPages}`}
      </p>

      {error ? (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <GamePuzzleCard
            key={p.id}
            puzzle={p}
            onOpen={(id) => {
              const idx = items.findIndex((x) => x.id === id);
              writeGamePuzzleNav({
                classification,
                gameId,
                sort,
                page: safePage,
                index: idx >= 0 ? idx : 0,
                pageItems: items.map((i) => ({ id: i.id })),
                total,
              });
              router.push(`/chess/puzzles/${encodeURIComponent(id)}`);
            }}
          />
        ))}
        {loading && items.length === 0 && (
          <div className="col-span-full flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200"
          >
            Previous
          </button>
          <span className="font-mono text-sm text-zinc-600 dark:text-zinc-300">
            Page {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function GamePuzzleCard({
  puzzle,
  onOpen,
}: {
  puzzle: GamePuzzleItem;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(puzzle.id)}
      className="group flex min-h-[120px] flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-baseline gap-1 font-mono text-xl font-black leading-none text-zinc-800 dark:text-zinc-100">
          <Star className="h-4 w-4 self-center fill-amber-400 text-amber-400" />
          Δ{puzzle.swingCp}
        </span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            puzzle.classification === "blunder"
              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              : "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
          }`}
        >
          {puzzle.classification}
        </span>
      </div>
      <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
        {puzzle.whiteName ?? "?"} vs {puzzle.blackName ?? "?"} · move {puzzle.fullmove}
      </p>
      {puzzle.themes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {puzzle.themes.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export default function GamesPage() {
  // useSearchParams forces a Suspense boundary in app router.
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      }
    >
      <GamesPageInner />
    </Suspense>
  );
}

