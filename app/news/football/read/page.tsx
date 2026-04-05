"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { FOOTBALL_READ_BODY_CLASS } from "@/lib/football-read-body-class";

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/news?src=guardian&gtab=sport";
  }
  if (raw === "/") {
    return "/news?src=guardian&gtab=sport";
  }
  if (raw.startsWith("/?")) {
    return `/news${raw.slice(1)}`;
  }
  return raw;
}

function FootballReadInner() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get("url")?.trim() ?? "";
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  const [title, setTitle] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!urlParam) {
      setError("No article URL provided.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setTitle(null);
    setHtml(null);
    setSourceUrl(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/bbc-read?url=${encodeURIComponent(urlParam)}`,
        );
        const data = (await res.json()) as {
          error?: string;
          title?: string;
          html?: string;
          url?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load article.");
          return;
        }
        setTitle(data.title ?? "Article");
        setHtml(data.html ?? "");
        setSourceUrl(data.url ?? urlParam);
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [urlParam]);

  if (!urlParam) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">Missing article link.</p>
        <Link
          href={returnTo}
          className="mt-4 inline-block text-sm font-medium text-rose-700 underline-offset-2 hover:underline dark:text-rose-300"
        >
          ← Back
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-zinc-100/90 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl px-3 pb-20 pt-6 sm:px-4 sm:pt-8">
        <header className="mb-4 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
            <Link
              href={returnTo}
              className="text-sm font-semibold tracking-tight text-rose-800 underline-offset-2 hover:underline dark:text-rose-300"
            >
              ← Football headlines
            </Link>
            {sourceUrl ? (
              <>
                <span
                  className="hidden text-zinc-300 sm:inline dark:text-zinc-600"
                  aria-hidden
                >
                  ·
                </span>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Original on BBC
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </a>
              </>
            ) : null}
          </div>
        </header>

        <main className="w-full min-w-0">
          {loading ? (
            <div className="py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Loading article…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-8 text-center text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              <p>{error}</p>
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block font-medium underline"
                >
                  Open on BBC instead
                </a>
              ) : null}
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white px-5 py-8 shadow-[0_4px_32px_-8px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-900/85 sm:px-8 sm:py-10">
              <article className="w-full min-w-0">
                <h1 className="text-balance text-[1.65rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                  {title}
                </h1>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                  Reader view · BBC Sport
                </p>
                <hr className="my-8 border-0 border-t border-zinc-200/80 dark:border-zinc-700/80 sm:my-10" />
                <div
                  className={FOOTBALL_READ_BODY_CLASS}
                  dangerouslySetInnerHTML={{ __html: html ?? "" }}
                />
              </article>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function FootballReadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-100/90 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          Loading…
        </div>
      }
    >
      <FootballReadInner />
    </Suspense>
  );
}
