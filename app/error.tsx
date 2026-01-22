"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { Home, RefreshCw } from "lucide-react";
export default function Error({ error, reset, }: {
    error: Error & {
        digest?: string;
    };
    reset: () => void;
}) {
    const { t } = useI18n();
    useEffect(() => {
        console.error(error);
    }, [error]);
    return (<div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        {t("somethingWentWrong")}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {t("pageNotFoundDescription")}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
          <RefreshCw className="h-4 w-4"/>
          {t("tryAgain")}
        </button>
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
          <Home className="h-4 w-4"/>
          {t("backToHome")}
        </Link>
      </div>
    </div>);
}
