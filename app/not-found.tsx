"use client";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { Home } from "lucide-react";
export default function NotFound() {
    const { t } = useI18n();
    return (<div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-8xl font-bold text-zinc-200 dark:text-zinc-700">
        404
      </p>
      <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        {t("pageNotFound")}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {t("pageNotFoundDescription")}
      </p>
      <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
        <Home className="h-4 w-4"/>
        {t("backToHome")}
      </Link>
    </div>);
}
