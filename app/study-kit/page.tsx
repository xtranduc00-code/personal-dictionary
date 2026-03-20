"use client";

import Link from "next/link";
import { FileText, NotebookText, Sparkles } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export default function StudyKitPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-sm dark:bg-zinc-200 dark:text-zinc-900">
          <Sparkles className="h-7 w-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("studyKit")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t("studyKitPageSubtitle")}
          </p>
        </div>
      </div>

      <ul className="mt-10 flex flex-col gap-3">
        <li>
          <Link
            href="/flashcards"
            className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-base font-medium text-zinc-900 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/60 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:border-sky-500/30 dark:hover:bg-sky-950/30"
          >
            <NotebookText className="h-5 w-5 shrink-0 text-blue-600 dark:text-sky-400" />
            {t("ieltsVocabNotes")}
          </Link>
        </li>
        <li>
          <Link
            href="/notes"
            className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-base font-medium text-zinc-900 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/60 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:border-sky-500/30 dark:hover:bg-sky-950/30"
          >
            <FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-sky-400" />
            {t("notes")}
          </Link>
        </li>
      </ul>
    </div>
  );
}
