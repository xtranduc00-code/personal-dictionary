"use client";
import dynamic from "next/dynamic";
import { Headphones } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
const ListeningListContent = dynamic(() => import("./ListeningListContent").then((m) => ({ default: m.ListeningListContent })), { ssr: false, loading: () => <ListeningListSkeleton /> });
function ListeningListSkeleton() {
    return (<section className="space-y-4">
      <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"/>
      <ul className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (<li key={i} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"/>
            <div className="h-5 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"/>
            <div className="mt-2 space-y-2">
              {[1, 2, 3, 4].map((j) => (<div key={j} className="h-10 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"/>))}
            </div>
          </li>))}
      </ul>
    </section>);
}
export default function ListeningHomePage() {
    const { t } = useI18n();
    return (<div className="mx-auto max-w-4xl space-y-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Headphones className="h-6 w-6 text-zinc-600 dark:text-zinc-400"/>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t("ieltsListening")}
          </h1>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t("ieltsListeningIntro")}
        </p>
      </section>

      <ListeningListContent />
    </div>);
}
