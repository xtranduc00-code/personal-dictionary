"use client";
import { useI18n } from "@/components/i18n-provider";
export function PageLoading() {
    const { t } = useI18n();
    return (<div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("loading")}</span>
    </div>);
}
