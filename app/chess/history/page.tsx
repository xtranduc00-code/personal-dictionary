"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Calendar, ChevronLeft, ChevronRight, Clock,
  Filter, Loader2, RefreshCw, Trophy,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getGameHistory, type GameHistoryItem } from "@/lib/chess-storage";
import { GameReview } from "../game-review";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(secs: number | null): string {
  if (secs == null) return "–";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function pct(n: number | null): string {
  if (n == null) return "–";
  return `${Math.round(n)}%`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultFilter = "all" | "win" | "loss" | "draw";

const RESULT_BADGES: Record<string, { label: string; cls: string }> = {
  win:  { label: "Win",  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  loss: { label: "Loss", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  draw: { label: "Draw", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChessHistoryPage() {
  const { user } = useAuth();

  const [items, setItems]           = useState<GameHistoryItem[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [page, setPage]             = useState(0);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [tcFilter, setTcFilter]     = useState("");
  const [reviewGame, setReviewGame] = useState<GameHistoryItem | null>(null);

  const LIMIT = 20;
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (pg: number, rf: ResultFilter, tc: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getGameHistory({
        result: rf,
        timeControl: tc || undefined,
        limit: LIMIT,
        offset: pg * LIMIT,
      });
      if (!ctrl.signal.aborted) {
        setItems(data.items);
        setTotal(data.total);
      }
    } catch {
      if (!ctrl.signal.aborted) {
        setLoadError("Could not load your games. Check your connection and try again.");
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load(page, resultFilter, tcFilter);
  }, [user, page, resultFilter, tcFilter, load]);

  // ── Summary stats (computed from loaded items) ────────────────────────────
  const wins   = items.filter((g) => g.result === "win").length;
  const losses = items.filter((g) => g.result === "loss").length;
  const draws  = items.filter((g) => g.result === "draw").length;
  const totalLoaded = wins + losses + draws;
  const winRate = totalLoaded > 0 ? Math.round((wins / totalLoaded) * 100) : null;

  const accuracies = items
    .map((g) => g.myColor === "white" ? g.whiteAccuracy : g.blackAccuracy)
    .filter((a): a is number => a != null);
  const avgAccuracy = accuracies.length > 0
    ? Math.round(accuracies.reduce((s, a) => s + a, 0) / accuracies.length)
    : null;

  const totalPages = Math.ceil(total / LIMIT);

  if (!user) {
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-zinc-500">
        Please sign in to view your game history.
      </div>
    );
  }

  // Review overlay
  if (reviewGame) {
    return (
      <GameReview
        pgn={reviewGame.pgn}
        gameId={reviewGame.id}
        whitePlayer={reviewGame.whitePlayer ?? "White"}
        blackPlayer={reviewGame.blackPlayer ?? "Black"}
        onBack={() => setReviewGame(null)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/90">
        <Link href="/chess" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Game History</span>
        <button
          onClick={() => load(page, resultFilter, tcFilter)}
          className="ml-auto rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-8">
        {loadError && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-900/40 dark:bg-red-950/30">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">{loadError}</p>
            <button
              type="button"
              onClick={() => user && load(page, resultFilter, tcFilter)}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Summary stats ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Games", value: total > 0 ? String(total) : "0" },
            { label: "Win Rate", value: winRate != null ? `${winRate}%` : "–" },
            { label: "Avg Accuracy", value: avgAccuracy != null ? `${avgAccuracy}%` : "–" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-zinc-200 bg-white p-3 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
              <p className="text-[10px] text-zinc-400">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Win/loss bar ──────────────────────────────────────────────────── */}
        {totalLoaded > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex h-2 flex-1 overflow-hidden rounded-full">
              <div className="bg-emerald-500 transition-all" style={{ width: `${(wins / totalLoaded) * 100}%` }} />
              <div className="bg-zinc-400 dark:bg-zinc-600 transition-all" style={{ width: `${(draws / totalLoaded) * 100}%` }} />
              <div className="bg-red-500 transition-all" style={{ width: `${(losses / totalLoaded) * 100}%` }} />
            </div>
            <span className="shrink-0 text-[10px] text-zinc-400">{wins}W {draws}D {losses}L</span>
          </div>
        )}

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 shrink-0 text-zinc-400" />

          {/* Result filter */}
          <div className="flex rounded-lg border border-zinc-200 bg-white text-xs dark:border-zinc-700 dark:bg-zinc-900">
            {(["all", "win", "loss", "draw"] as ResultFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => { setResultFilter(r); setPage(0); }}
                className={`px-2.5 py-1.5 capitalize transition first:rounded-l-lg last:rounded-r-lg ${
                  resultFilter === r
                    ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Time control filter */}
          <select
            value={tcFilter}
            onChange={(e) => { setTcFilter(e.target.value); setPage(0); }}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">All time controls</option>
            {["Bullet 1+0", "Blitz 3+2", "Blitz 5+0", "Rapid 10+0", "Unlimited"].map((tc) => (
              <option key={tc} value={tc}>{tc}</option>
            ))}
          </select>
        </div>

        {/* ── Game list ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[4.5rem] animate-pulse rounded-xl border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            filtered={resultFilter !== "all" || !!tcFilter}
            onClearFilters={() => {
              setResultFilter("all");
              setTcFilter("");
              setPage(0);
            }}
          />
        ) : (
          <div className="space-y-2">
            {items.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                onReview={() => setReviewGame(game)}
              />
            ))}
          </div>
        )}

        {/* ── Pagination ────────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-500 disabled:opacity-40 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="text-xs text-zinc-400">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-500 disabled:opacity-40 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Game Row ─────────────────────────────────────────────────────────────────

function GameRow({ game, onReview }: { game: GameHistoryItem; onReview: () => void }) {
  const badge = game.result ? RESULT_BADGES[game.result] : null;
  const opponentName = game.myColor === "white"
    ? (game.blackPlayer ?? "Unknown")
    : (game.whitePlayer ?? "Unknown");
  const myAccuracy = game.myColor === "white" ? game.whiteAccuracy : game.blackAccuracy;
  const myPiece = game.myColor === "white" ? "♔" : "♚";

  return (
    <button
      onClick={onReview}
      className="group w-full rounded-xl border border-zinc-200 bg-white p-3.5 text-left transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
    >
      {/* Mobile layout: stacked */}
      <div className="flex items-start gap-3">
        {/* Result badge */}
        <div className="flex flex-col items-center gap-1">
          {badge ? (
            <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
              {badge.label}
            </span>
          ) : (
            <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-xs text-zinc-400 dark:bg-zinc-800">–</span>
          )}
          <span className="text-base">{myPiece}</span>
        </div>

        {/* Main info */}
        <div className="flex flex-1 min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              vs {opponentName}
            </p>
            {myAccuracy != null && (
              <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {Math.round(myAccuracy)}% accuracy
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-400">
            {game.timeControl && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" /> {game.timeControl}
              </span>
            )}
            {game.durationSeconds != null && (
              <span>{formatDuration(game.durationSeconds)}</span>
            )}
            <span className="flex items-center gap-0.5">
              <Calendar className="h-3 w-3" /> {relativeDate(game.createdAt)}
            </span>
          </div>
        </div>

        {/* Review icon */}
        <Trophy className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-amber-500 dark:text-zinc-600" />
      </div>
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-3xl dark:bg-zinc-800">
        ♟
      </div>
      <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">
        {filtered ? "No games match your filters" : "No games yet"}
      </p>
      <p className="text-sm text-zinc-400">
        {filtered
          ? "Try adjusting your filters or reset them below."
          : "Play your first game to see history here"}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Clear filters
        </button>
      ) : (
        <Link
          href="/chess"
          className="mt-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Play a game
        </Link>
      )}
    </div>
  );
}
