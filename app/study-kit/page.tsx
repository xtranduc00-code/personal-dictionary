"use client";

import Link from "next/link";
import { FileText, NotebookText } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

const cardClass =
  "flex w-full items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white px-5 py-4 text-left text-base font-medium text-zinc-900 shadow-sm transition hover:border-blue-200/80 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-sky-500/35";

const iconClass = "h-5 w-5 shrink-0 text-blue-600 dark:text-sky-400";

export default function StudyKitPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t("studyKit")}
      </h1>

      <ul className="flex flex-col gap-3">
        <li>
          <Link href="/flashcards" className={cardClass}>
            <NotebookText className={iconClass} aria-hidden />
            <span>{t("ieltsVocabNotes")}</span>
          </Link>
        </li>
        <li>
          <Link href="/notes" className={cardClass}>
            <FileText className={iconClass} aria-hidden />
            <span>{t("notes")}</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
