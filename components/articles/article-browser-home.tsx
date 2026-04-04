"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  listSavedArticles,
  saveArticle,
  type SavedArticle,
} from "@/lib/saved-articles";

export function ArticleBrowserHome() {
  const { t } = useI18n();
  const router = useRouter();
  const [urlInput, setUrlInput] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [listTick, setListTick] = useState(0);

  const articles = useMemo(() => {
    void listTick;
    return listSavedArticles();
  }, [listTick]);

  const refreshList = useCallback(() => setListTick((n) => n + 1), []);

  const openArticle = useCallback(
    (id: string) => {
      router.push(`/articles/${id}`);
    },
    [router],
  );

  const handleFetchUrl = async () => {
    const raw = urlInput.trim();
    if (!raw) return;
    let href = raw;
    if (!/^https?:\/\//i.test(href)) {
      href = `https://${href}`;
    }
    setFetchError(null);
    setFetching(true);
    try {
      const res = await fetch("/api/fetch-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: href }),
      });
      const data = (await res.json()) as {
        error?: string;
        title?: string;
        content?: string;
        source?: string;
        url?: string;
      };
      if (!res.ok || !data.title || !data.content) {
        setFetchError(data.error ?? t("articleFetchErrorGeneric"));
        return;
      }
      const saved = saveArticle({
        title: data.title,
        content: data.content,
        sourceUrl: data.url ?? href,
        sourceLabel: data.source ?? new URL(href).hostname,
        difficulty: null,
      });
      refreshList();
      setUrlInput("");
      openArticle(saved.id);
    } catch {
      setFetchError(t("articleFetchErrorGeneric"));
    } finally {
      setFetching(false);
    }
  };

  const handleSavePaste = () => {
    const body = pasteBody.trim();
    if (!body) return;
    const title =
      pasteTitle.trim() ||
      body.split(/\n+/)[0]?.slice(0, 120).trim() ||
      t("articlePastedTitleFallback");
    const saved = saveArticle({
      title,
      content: body,
      sourceUrl: null,
      sourceLabel: t("articleSourcePasted"),
      difficulty: null,
    });
    refreshList();
    setPasteBody("");
    setPasteTitle("");
    openArticle(saved.id);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 md:py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-3xl">
          {t("articleHomeTitle")}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("articleHomeSubtitle")}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          <Link
            href="/portfolio"
            className="underline decoration-zinc-400 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            {t("articleFooterPortfolio")}
          </Link>
          {" · "}
          <Link
            href="/real-time-call"
            className="underline decoration-zinc-400 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            {t("articleFooterAiCallOnly")}
          </Link>
        </p>
      </header>

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {t("articleFromUrlHeading")}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("articleFromUrlHint")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={t("articleUrlPlaceholder")}
            className="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-600"
          />
          <button
            type="button"
            disabled={fetching || !urlInput.trim()}
            onClick={() => void handleFetchUrl()}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {fetching ? t("pleaseWait") : t("articleFetchCta")}
          </button>
        </div>
        {fetchError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {t("articlePasteHeading")}
        </h2>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t("articleTitleOptional")}
        </label>
        <input
          type="text"
          value={pasteTitle}
          onChange={(e) => setPasteTitle(e.target.value)}
          placeholder={t("articleTitleOptionalPlaceholder")}
          className="mb-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <textarea
          value={pasteBody}
          onChange={(e) => setPasteBody(e.target.value)}
          placeholder={t("articlePastePlaceholder")}
          rows={8}
          className="w-full resize-y rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          disabled={!pasteBody.trim()}
          onClick={handleSavePaste}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          {t("articleSaveReadCta")}
        </button>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {t("articleRecentHeading")}
        </h2>
        {articles.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("articleRecentEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {articles.map((a) => (
              <li key={a.id}>
                <ArticleCard article={a} onOpen={() => openArticle(a.id)} t={t} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ArticleCard({
  article,
  onOpen,
  t,
}: {
  article: SavedArticle;
  onOpen: () => void;
  t: (key: import("@/lib/i18n").TranslationKey) => string;
}) {
  let dateLabel: string;
  try {
    dateLabel = format(new Date(article.savedAt), "MMM d, yyyy");
  } catch {
    dateLabel = article.savedAt.slice(0, 10);
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
          {article.title}
        </h3>
        {article.difficulty ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            {article.difficulty}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {article.sourceLabel} · {dateLabel}
      </p>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
        {t("articleCardOpenHint")}
      </p>
    </button>
  );
}
