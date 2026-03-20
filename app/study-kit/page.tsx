"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, useAuth } from "@/lib/auth-context";
import type { TranslationKey } from "@/lib/i18n";

type SummarizeResponse = {
    summary?: string;
    truncated?: boolean;
    fileName?: string;
    code?: string;
};

function toastForCode(t: (key: TranslationKey) => string, code: string | undefined) {
    const map: Record<string, TranslationKey> = {
        NO_FILE: "studyKitErrNoFile",
        UNSUPPORTED_TYPE: "studyKitErrBadType",
        EMPTY_TEXT: "studyKitErrEmpty",
        FILE_TOO_LARGE: "studyKitErrLarge",
        EXTRACT_FAILED: "studyKitErrExtract",
    };
    const translationKey: TranslationKey =
        code && map[code] ? map[code]! : "studyKitErrGeneric";
    toast.error(t(translationKey));
}

const fieldClass =
    "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500/40 dark:focus:ring-sky-500/20";

const labelClass = "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function StudyKitPage() {
    const { t } = useI18n();
    const { user, openAuthModal } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [customPrompt, setCustomPrompt] = useState("");
    const [summary, setSummary] = useState("");
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(false);

    const onSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            openAuthModal();
            toast.info(t("studyKitSignInCta"));
            return;
        }
        if (!file) {
            toast.error(t("studyKitErrNoFile"));
            return;
        }
        setLoading(true);
        setSummary("");
        setTruncated(false);
        try {
            const fd = new FormData();
            fd.set("file", file);
            if (customPrompt.trim())
                fd.set("customPrompt", customPrompt.trim());
            const res = await authFetch("/api/study-kit/summarize", {
                method: "POST",
                body: fd,
            });
            const data = (await res.json()) as SummarizeResponse;
            if (!res.ok) {
                toastForCode(t, data.code);
                return;
            }
            setSummary(data.summary ?? "");
            setTruncated(Boolean(data.truncated));
        }
        catch {
            toast.error(t("studyKitErrGeneric"));
        }
        finally {
            setLoading(false);
        }
    }, [user, file, customPrompt, openAuthModal, t]);

    return (<div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t("studyKit")}
      </h1>

      {!user ? (<p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
          {t("studyKitSignInCta")}{" "}
          <button type="button" onClick={() => openAuthModal()} className="font-semibold text-amber-900 underline hover:no-underline dark:text-amber-50">
            {t("logIn")}
          </button>
        </p>) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="study-kit-file" className={labelClass}>
            {t("studyKitFileLabel")}
          </label>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{t("studyKitFileHint")}</p>
          <div className="relative">
            <input id="study-kit-file" type="file" accept=".txt,.pdf,.pptx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
            }} className="block w-full cursor-pointer rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-900/50 dark:file:bg-zinc-200 dark:file:text-zinc-900"/>
          </div>
          {file ? (<p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden/>
              <span className="truncate">{file.name}</span>
            </p>) : null}
        </div>

        <div>
          <label htmlFor="study-kit-prompt" className={labelClass}>
            {t("studyKitCustomPromptLabel")}
          </label>
          <textarea id="study-kit-prompt" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder={t("studyKitCustomPromptPlaceholder")} rows={4} className={`${fieldClass} min-h-[100px] resize-y`}/>
        </div>

        <button type="submit" disabled={loading || !user} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
          {loading ? (<>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden/>
              {t("studyKitProcessing")}
            </>) : t("studyKitSummarizeCta")}
        </button>
      </form>

      {summary ? (<section className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-700">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {t("studyKitResultHeading")}
          </h2>
          {truncated ? (<p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-100">
              {t("studyKitTruncatedBanner")}
            </p>) : null}
          <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          </div>
        </section>) : null}
    </div>);
}
