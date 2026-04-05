"use client";
import { useState } from "react";
import { toast } from "react-toastify";
import { Copy, ExternalLink } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ScrollReveal } from "@/components/portfolio/scroll-reveal";
const CONTACT_EMAIL = "tranduy10a@gmail.com";
const GITHUB_HREF = "https://github.com/xtranduc00-code";
const GITHUB_DISPLAY = "github.com/xtranduc00-code";
const LINKEDIN_HREF = "https://www.linkedin.com/in/kentuckytran/";
const LINKEDIN_DISPLAY = "linkedin.com/in/kentuckytran";
export default function ContactPage() {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);
    async function copyEmail() {
        try {
            await navigator.clipboard.writeText(CONTACT_EMAIL);
            setCopied(true);
            toast.success(t("toastEmailCopiedContact"), { position: "top-center" });
            window.setTimeout(() => setCopied(false), 2000);
        }
        catch {
            toast.error(t("toastCouldNotCopyContact"), { position: "top-center" });
        }
    }
    return (<div className="mx-auto max-w-2xl">
      <ScrollReveal as="section" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:p-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-3xl">
            {t("contactTitle")}
          </h1>
          <p className="mt-2 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            {t("contactGetInTouch")}
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t("contactIntro")}
          </p>
        </div>

        <ul className="mt-8 space-y-4 text-base text-zinc-800 dark:text-zinc-200">
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="shrink-0" aria-hidden>
              📧
            </span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="break-all font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 transition hover:decoration-zinc-600 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:decoration-zinc-400">
              {CONTACT_EMAIL}
            </a>
          </li>
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="shrink-0" aria-hidden>
              💻
            </span>
            <a href={GITHUB_HREF} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 transition hover:decoration-zinc-600 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:decoration-zinc-400">
              {GITHUB_DISPLAY}
            </a>
          </li>
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="shrink-0" aria-hidden>
              🔗
            </span>
            <a href={LINKEDIN_HREF} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 transition hover:decoration-zinc-600 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:decoration-zinc-400">
              {LINKEDIN_DISPLAY}
            </a>
          </li>
        </ul>

        <div className="mt-10 flex flex-wrap gap-3">
          <button type="button" onClick={() => void copyEmail()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
            <Copy className="h-4 w-4"/>
            {copied ? t("contactCopiedState") : t("contactCopyEmail")}
          </button>
          <a href={LINKEDIN_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            <ExternalLink className="h-4 w-4"/>
            {t("contactOpenLinkedIn")}
          </a>
        </div>
      </ScrollReveal>
    </div>);
}
