"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getSavedArticle, type SavedArticle } from "@/lib/saved-articles";
import { Phone } from "lucide-react";

export function ArticleReadView({ articleId }: { articleId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [article, setArticle] = useState<SavedArticle | null | undefined>(
    undefined,
  );

  useEffect(() => {
    setArticle(getSavedArticle(articleId) ?? null);
  }, [articleId]);

  if (article === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500 dark:text-zinc-400">
        {t("loading")}
      </div>
    );
  }

  if (article === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">{t("articleNotFound")}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          {t("articleBackHome")}
        </Link>
      </div>
    );
  }

  let dateLabel: string;
  try {
    dateLabel = format(new Date(article.savedAt), "MMMM d, yyyy");
  } catch {
    dateLabel = article.savedAt.slice(0, 10);
  }

  const startDiscuss = () => {
    router.push(`/real-time-call?article=${encodeURIComponent(article.id)}`);
  };

  return (
    <div className="relative mx-auto max-w-3xl px-4 pb-32 pt-8 md:pb-24 md:pt-12">
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/"
          className="text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {t("articleBackHome")}
        </Link>
      </div>

      <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:font-semibold prose-p:text-zinc-700 dark:prose-p:text-zinc-300">
        <h1 className="text-balance text-2xl md:text-3xl">{article.title}</h1>
        <p className="not-prose text-sm text-zinc-500 dark:text-zinc-400">
          {article.sourceLabel} · {dateLabel}
          {article.sourceUrl ? (
            <>
              {" · "}
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-700 underline dark:text-zinc-300"
              >
                {t("articleOpenSource")}
              </a>
            </>
          ) : null}
        </p>
        <div className="not-prose mt-8 whitespace-pre-wrap text-base leading-relaxed text-zinc-800 dark:text-zinc-200">
          {article.content}
        </div>
      </article>

      <div
        className="fixed bottom-6 right-4 z-40 flex flex-col items-end gap-2 md:bottom-8 md:right-8"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        <button
          type="button"
          onClick={startDiscuss}
          className="flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {t("articleTalkAboutThis")}
        </button>
        <Link
          href="/real-time-call"
          className="text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          {t("articleAiCallWithoutArticle")}
        </Link>
      </div>
    </div>
  );
}
