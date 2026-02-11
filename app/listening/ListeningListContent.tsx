"use client";
import Link from "next/link";
import { ListMusic } from "lucide-react";
import { listeningSets } from "@/lib/listening-data";
import { hasTestContent } from "@/lib/listening-part-content";
import { useI18n } from "@/components/i18n-provider";
export function ListeningListContent() {
    const { t } = useI18n();
    return (<section className="space-y-4">
      <div className="flex items-center gap-2">
        <ListMusic className="h-5 w-5 text-zinc-500 dark:text-zinc-400"/>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {t("cambridgeTestSets")}
        </h2>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {listeningSets.map((set) => (<li key={set.id} className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {set.examLabel}
              </p>
              <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {set.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t("testsAvailable")
                .replace("{count}", String(set.tests.filter((te) => hasTestContent(set.id, te.id)).length))
                .replace("{total}", String(set.tests.length))}
              </p>
            </div>
            <div className="mt-4 space-y-2">
              {set.tests.map((test) => {
                const enabled = hasTestContent(set.id, test.id);
                return enabled ? (<Link key={test.id} href={`/listening/${set.id}/${test.id}`} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
                    <span>
                      {set.examLabel} – {test.label}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t("start")}
                    </span>
                  </Link>) : (<div key={test.id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-100/80 px-3 py-2 text-sm font-medium text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-500">
                    <span>
                      {set.examLabel} – {test.label}
                    </span>
                    <span className="text-xs">{t("none")}</span>
                  </div>);
            })}
            </div>
          </li>))}
      </ul>
    </section>);
}
