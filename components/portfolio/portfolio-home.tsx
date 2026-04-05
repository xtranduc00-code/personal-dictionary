"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/lib/auth-context";
const PortfolioParticles = dynamic(() => import("@/components/portfolio/portfolio-particles").then((m) => m.PortfolioParticles), { ssr: false });
const SOCIAL: {
    href: string;
    icon: LucideIcon;
    label: string;
}[] = [];
export function PortfolioHome() {
    const { t } = useI18n();
    const { user, openAuthModal } = useAuth();
    return (<div className="relative flex min-h-[100svh] w-full flex-1 flex-col bg-gradient-to-b from-zinc-50 via-white to-zinc-100 text-zinc-900 md:h-full md:min-h-0 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950 dark:text-zinc-100">
      <div className="relative flex min-h-[100svh] w-full flex-1 flex-col overflow-hidden md:h-full md:min-h-0">
        <PortfolioParticles />

        <div className="pointer-events-none absolute inset-0 flex justify-evenly opacity-[0.35] dark:opacity-[0.08]" aria-hidden>
          {[0, 1, 2, 3].map((i) => (<div key={i} className="w-px bg-zinc-300/80 dark:bg-zinc-100"/>))}
        </div>

        <div className="relative z-10 flex min-h-[100svh] flex-1 flex-col items-center justify-center px-6 py-16 text-center md:h-full md:min-h-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
            {t("portfolioKicker")}
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl md:text-6xl dark:text-white">
            {t("portfolioHiIm")}{" "}
            
            <span className="text-zinc-800 dark:bg-gradient-to-r dark:from-white dark:to-zinc-300 dark:bg-clip-text dark:text-transparent">
              Duy Tran
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-zinc-600 sm:text-lg dark:max-w-xl dark:text-zinc-400">
            {t("portfolioHeroDegree")}
          </p>

          {SOCIAL.length > 0 && (<div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {SOCIAL.map(({ href, icon: Icon, label }) => (<a key={href} href={href} target="_blank" rel="noopener noreferrer" className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-zinc-300 text-zinc-600 transition hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-zinc-300 dark:hover:text-white" aria-label={label}>
                  <Icon className="h-5 w-5"/>
                </a>))}
            </div>)}

          <div className={`mx-auto grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 ${SOCIAL.length > 0 ? "mt-12" : "mt-10"}`}>
            {!user ? (<button type="button" onClick={() => openAuthModal()} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-zinc-900/10 transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:shadow-none dark:hover:bg-zinc-200">
                {t("portfolioCtaWorkspace")}
              </button>) : (<Link href="/dictionary" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-zinc-900/10 transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:shadow-none dark:hover:bg-zinc-200">
                {t("portfolioCtaWorkspace")}
              </Link>)}
            <Link href="/contact" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white/90 px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-white dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-900/70">
              {t("portfolioCtaContact")}
            </Link>
          </div>
        </div>
      </div>
    </div>);
}
