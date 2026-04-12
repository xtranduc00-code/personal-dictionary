"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EngooReadingTutorPanel } from "@/components/engoo/engoo-reading-tutor-panel";
import { useI18n } from "@/components/i18n-provider";
import { AddFlashcardModal, HighlightToolbar } from "@/components/ielts";
import { storeEngooCallContext } from "@/lib/engoo-call-context";
import { buildGuardianEngooTutorPayload } from "@/lib/guardian-engoo-tutor-payload";
import { GUARDIAN_READ_BODY_CLASS } from "@/lib/guardian-read-body-class";

const GUARDIAN_MARK_CLASS =
  "guardian-highlight bg-yellow-200/80 dark:bg-yellow-500/30 text-inherit rounded px-0.5";

/**
 * Wrap a DOM Range with a <mark> in-place. Falls back to extract/insert when
 * the range spans multiple elements (surroundContents throws in that case).
 */
function wrapRangeWithMark(range: Range): HTMLElement | null {
  const mark = document.createElement("mark");
  mark.className = GUARDIAN_MARK_CLASS;
  try {
    range.surroundContents(mark);
    return mark;
  } catch {
    try {
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
      return mark;
    } catch {
      return null;
    }
  }
}

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/news?src=guardian";
  }
  if (raw === "/") {
    return "/news?src=guardian";
  }
  if (raw.startsWith("/?")) {
    return `/news${raw.slice(1)}`;
  }
  return raw;
}

function GuardianReadInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const urlParam = searchParams.get("url")?.trim() ?? "";
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  const [title, setTitle] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tutorOpen, setTutorOpen] = useState(false);

  const articleBodyRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<
    { x: number; y: number; selectedText: string } | null
  >(null);
  const [flashcardWord, setFlashcardWord] = useState<string | null>(null);

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setToolbar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const root = articleBodyRef.current;
      if (
        !root ||
        (!root.contains(range.startContainer) &&
          !root.contains(range.endContainer))
      ) {
        setToolbar(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setToolbar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setToolbar(null);
        return;
      }
      setToolbar({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        selectedText: text,
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolbar(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleHighlight = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setToolbar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const root = articleBodyRef.current;
    if (!root || !root.contains(range.commonAncestorContainer)) {
      setToolbar(null);
      return;
    }
    wrapRangeWithMark(range);
    sel.removeAllRanges();
    setToolbar(null);
  }, []);

  const handleFlashcard = useCallback((word: string) => {
    setFlashcardWord(word);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }, []);

  useEffect(() => {
    setTutorOpen(false);
  }, [urlParam]);

  const tutorPayload = useMemo(() => {
    if (loading || error || !title || !sourceUrl) return null;
    return buildGuardianEngooTutorPayload({
      title,
      html: html ?? "",
      sourceUrl,
    });
  }, [loading, error, title, html, sourceUrl]);

  const openReadingTutor = useCallback(() => {
    if (!tutorPayload) return;
    storeEngooCallContext(tutorPayload.masterId, tutorPayload);
    setTutorOpen(true);
  }, [tutorPayload]);

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
          `/api/guardian-read?url=${encodeURIComponent(urlParam)}`,
        );
        const text = await res.text();
        const contentType = res.headers.get("content-type") ?? "";
        const trimmed = text.trimStart();
        const looksLikeHtml =
          contentType.includes("text/html") ||
          /^<!DOCTYPE\s+html/i.test(trimmed) ||
          /^<html[\s>]/i.test(trimmed);

        let data: {
          error?: string;
          code?: string;
          title?: string;
          html?: string;
          url?: string;
        };
        try {
          data = JSON.parse(text) as typeof data;
        } catch (parseErr) {
          if (!cancelled) {
            const preview = text.replace(/\s+/g, " ").trim().slice(0, 300);
            console.warn("[guardian-read:client] non-JSON body", {
              status: res.status,
              contentType,
              looksLikeHtml,
              preview,
              parseError:
                parseErr instanceof Error ? parseErr.message : String(parseErr),
            });
            setError(
              (looksLikeHtml
                ? t("guardianReadHostHtmlError")
                : t("guardianReadUnexpectedResponse")
              ).replace("{status}", String(res.status)),
            );
          }
          return;
        }
        if (cancelled) return;
        if (!res.ok) {
          const code =
            typeof data.code === "string" && data.code.length > 0
              ? data.code
              : "";
          // Live blog: show a clean, friendly message without the code suffix.
          if (code === "live_blog_unsupported") {
            setError(t("guardianReadLiveBlogUnsupported"));
            return;
          }
          const msg = data.error ?? "Could not load article.";
          setError(
            code
              ? t("guardianReadErrorWithCode")
                  .replace("{message}", msg)
                  .replace("{code}", code)
              : msg,
          );
          return;
        }
        setTitle(data.title ?? "Article");
        setHtml(data.html ?? "");
        setSourceUrl(data.url ?? urlParam);
        // Auto-detect daily task
        import("@/components/daily-tasks/daily-tasks-auto-detect").then(({ markDailyTask }) => markDailyTask("read_guardian")).catch(() => {});
      } catch {
        if (!cancelled) setError(t("networkErrorTryAgain"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [urlParam, t]);

  if (!urlParam) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">Missing article link.</p>
        <Link
          href={returnTo}
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
        >
          {t("guardianReadBack")}
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`relative min-h-screen w-full bg-zinc-100/90 font-sans text-zinc-900 transition-[padding] duration-200 dark:bg-zinc-950 dark:text-zinc-100 ${
        tutorOpen
          ? "pb-[58vh] md:pb-6 md:pr-[440px]"
          : "pb-20"
      }`}
    >
      <div className="mx-auto max-w-6xl px-3 pt-6 sm:px-4 sm:pt-8">
        <header className="mb-4 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
            <Link
              href={returnTo}
              className="text-sm font-semibold tracking-tight text-zinc-800 underline-offset-2 hover:underline dark:text-zinc-300"
            >
              {t("guardianReadBack")}
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
                  {t("guardianReadOriginal")}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </a>
              </>
            ) : null}
          </div>
        </header>

        <main className="w-full min-w-0">
          {loading ? (
            <div className="py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t("guardianReadLoading")}
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
                  {t("guardianReadOpenInstead")}
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
                  {t("guardianReadKicker")}
                </p>
                <hr className="my-8 border-0 border-t border-zinc-200/80 dark:border-zinc-700/80 sm:my-10" />
                <div
                  ref={articleBodyRef}
                  className={GUARDIAN_READ_BODY_CLASS}
                  dangerouslySetInnerHTML={{ __html: html ?? "" }}
                />
              </article>
            </div>
          )}
        </main>
      </div>

      {!tutorOpen && tutorPayload ? (
        <button
          type="button"
          onClick={openReadingTutor}
          className="fixed bottom-6 right-5 z-[80] flex items-center gap-2 rounded-full bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] md:bottom-8 md:right-8"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </span>
          Start Call
        </button>
      ) : null}

      <EngooReadingTutorPanel
        open={tutorOpen}
        onClose={() => setTutorOpen(false)}
        masterId={tutorPayload?.masterId ?? ""}
        payload={tutorPayload}
      />

      {toolbar ? (
        <HighlightToolbar
          x={toolbar.x}
          y={toolbar.y}
          hasHighlightId={false}
          selectedText={toolbar.selectedText}
          onHighlight={handleHighlight}
          onUnhighlight={() => setToolbar(null)}
          onFlashcard={handleFlashcard}
        />
      ) : null}

      {flashcardWord ? (
        <AddFlashcardModal
          initialWord={flashcardWord}
          onClose={() => setFlashcardWord(null)}
        />
      ) : null}
    </div>
  );
}

export default function GuardianReadPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-100/90 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          {t("guardianReadLoading")}
        </div>
      }
    >
      <GuardianReadInner />
    </Suspense>
  );
}
