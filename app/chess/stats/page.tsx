"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  X as XIcon,
  Lightbulb,
  Loader2,
  TrendingDown,
  Trophy,
  Flame,
  CalendarCheck,
} from "lucide-react";

interface ThemeStat {
  theme: string;
  name: string;
  attempted: number;
  solved: number;
  accuracyPct: number;
}

interface RecentAttempt {
  puzzleId: string;
  attemptedAt: number;
  solved: boolean;
  hintsUsed: number;
  durationMs: number;
  rating: number;
  level: string;
  themes: string[];
}

interface ProgressStats {
  totalAttempted: number;
  totalSolved: number;
  accuracyPct: number;
  todayAttempts: number;
  streakDays: number;
  weakestThemes: ThemeStat[];
  recentAttempts: RecentAttempt[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m}m` : `${m}m ${rest}s`;
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

const LEVEL_COLOR: Record<string, string> = {
  beginner: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  intermediate: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  hard: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  expert: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/chess/progress")
      .then(async (r) => {
        const data = (await r.json()) as ProgressStats | { error?: string };
        if (!alive) return;
        if (!r.ok || "error" in data) {
          setError((data as { error?: string }).error ?? "Failed to load stats");
        } else {
          setStats(data as ProgressStats);
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {error ?? "No stats yet."}
        </p>
        <Link href="/chess" className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← Back to chess
        </Link>
      </div>
    );
  }

  const isEmpty = stats.totalAttempted === 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
      {/* Slim header */}
      <div className="flex items-center gap-2">
        <Link
          href="/chess"
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          aria-label="Back to chess"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Stats
        </h1>
      </div>

      {isEmpty && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          No attempts yet.{" "}
          <Link
            href="/chess/puzzles"
            className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Solve a puzzle
          </Link>{" "}
          to start tracking progress.
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Trophy className="h-4 w-4" />}
          label="Solved"
          value={stats.totalSolved.toLocaleString()}
          sub={`of ${stats.totalAttempted.toLocaleString()} attempted`}
          tone="emerald"
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Accuracy"
          value={`${stats.accuracyPct.toFixed(1)}%`}
          sub="successful first solve"
          tone="zinc"
        />
        <StatCard
          icon={<Flame className="h-4 w-4" />}
          label="Streak"
          value={`${stats.streakDays}`}
          sub={stats.streakDays === 1 ? "day" : "days"}
          tone={stats.streakDays > 0 ? "amber" : "zinc"}
        />
        <StatCard
          icon={<CalendarCheck className="h-4 w-4" />}
          label="Today"
          value={`${stats.todayAttempts}`}
          sub={stats.todayAttempts === 1 ? "attempt" : "attempts"}
          tone="zinc"
        />
      </div>

      {/* Two side-by-side panels on desktop */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Weakest themes */}
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <header className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Weakest themes
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Themes you have attempted at least 5 times, sorted by accuracy.
              {" "}
              <Link href="/chess/puzzles" className="text-emerald-600 hover:underline dark:text-emerald-400">
                Practice these.
              </Link>
            </p>
          </header>
          {stats.weakestThemes.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-400">
              Not enough attempts yet — solve at least 5 puzzles tagged with a
              theme to see weakness analysis.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {stats.weakestThemes.map((t) => (
                <li
                  key={t.theme}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <Link
                    href={`/chess/puzzles?themes=${encodeURIComponent(t.theme)}`}
                    className="min-w-0 flex-1 truncate font-medium text-zinc-800 hover:text-emerald-600 dark:text-zinc-200 dark:hover:text-emerald-400"
                  >
                    {t.name}
                  </Link>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {t.solved}/{t.attempted}
                  </span>
                  <span
                    className={`w-12 text-right font-mono text-[12px] font-semibold ${
                      t.accuracyPct < 40
                        ? "text-red-600 dark:text-red-400"
                        : t.accuracyPct < 70
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {t.accuracyPct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent attempts */}
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <header className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Recent attempts
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Last 20. Click any row to revisit the puzzle.
            </p>
          </header>
          {stats.recentAttempts.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-400">
              No attempts yet.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {stats.recentAttempts.map((a, idx) => (
                <li
                  key={`${a.puzzleId}:${a.attemptedAt}:${idx}`}
                  onClick={() =>
                    router.push(`/chess/puzzles/${encodeURIComponent(a.puzzleId)}`)
                  }
                  className="grid cursor-pointer grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${
                      a.solved ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    aria-label={a.solved ? "Solved" : "Failed"}
                  >
                    {a.solved ? (
                      <Check className="h-3 w-3 stroke-[3]" />
                    ) : (
                      <XIcon className="h-3 w-3 stroke-[3]" />
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      LEVEL_COLOR[a.level] ?? "bg-zinc-100 text-zinc-700"
                    }`}
                    title={`Rating ${a.rating}`}
                  >
                    {a.rating}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[11px] text-zinc-700 dark:text-zinc-300">
                      {a.themes.slice(0, 3).join(" · ") || a.puzzleId}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      #{a.puzzleId} · {formatRelativeTime(a.attemptedAt)} · {formatDuration(a.durationMs)}
                      {a.hintsUsed > 0 && (
                        <>
                          {" "}
                          ·{" "}
                          <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                            <Lightbulb className="h-2.5 w-2.5" />
                            {a.hintsUsed}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "amber" | "zinc";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-700 dark:text-zinc-200";
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        <span className={toneCls}>{icon}</span>
        {label}
      </div>
      <div className={`font-mono text-2xl font-bold tabular-nums ${toneCls}`}>
        {value}
      </div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{sub}</div>
    </div>
  );
}
