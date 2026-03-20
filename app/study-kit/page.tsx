"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, useAuth } from "@/lib/auth-context";
import type { TranslationKey } from "@/lib/i18n";
import {
    STUDY_FOCUS_LEVELS,
    STUDY_PRESETS,
    type StudyFocusLevel,
    type StudyPreset,
} from "@/lib/study-kit-prompt";

type SummarizeResponse = {
    summary?: string;
    truncated?: boolean;
    fileName?: string;
    code?: string;
};

const PRESET_LABEL: Record<StudyPreset, TranslationKey> = {
    summary_bullets: "studyKitPresetSummaryBullets",
    exam_notes: "studyKitPresetExamNotes",
    quiz: "studyKitPresetQuiz",
    flashcards: "studyKitPresetFlashcards",
    definitions: "studyKitPresetDefinitions",
};

const FOCUS_LABEL: Record<StudyFocusLevel, TranslationKey> = {
    general: "studyKitFocusGeneral",
    important: "studyKitFocusImportant",
    exam: "studyKitFocusExam",
};

const PRESET_PREVIEW: Record<StudyPreset, TranslationKey> = {
    summary_bullets: "studyKitPvBulletSummary",
    exam_notes: "studyKitPvExamNotes",
    quiz: "studyKitPvQuiz",
    flashcards: "studyKitPvFlashcards",
    definitions: "studyKitPvDefinitions",
};

const FOCUS_PREVIEW: Record<StudyFocusLevel, TranslationKey> = {
    general: "studyKitPvFocusGeneral",
    important: "studyKitPvFocusImportant",
    exam: "studyKitPvFocusExam",
};

function stripHtmlToText(s: string): string {
    return s
        .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function toastForCode(t: (key: TranslationKey) => string, code: string | undefined) {
    const map: Record<string, TranslationKey> = {
        NO_FILE: "studyKitErrNoFile",
        NO_PASTE: "studyKitErrNoPaste",
        UNSUPPORTED_TYPE: "studyKitErrBadType",
        EMPTY_TEXT: "studyKitErrEmpty",
        FILE_TOO_LARGE: "studyKitErrLarge",
        EXTRACT_FAILED: "studyKitErrExtract",
    };
    const translationKey: TranslationKey =
        code && map[code] ? map[code]! : "studyKitErrGeneric";
    toast.error(t(translationKey));
}

const segBtn =
    "flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const segBtnOn =
    "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50";
const segBtnOff =
    "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";

const choiceBase =
    "cursor-pointer rounded-2xl border px-3 py-3 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500";
const choiceOff =
    "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:border-zinc-500";
const choiceOn =
    "border-blue-500 bg-blue-50/80 ring-1 ring-blue-500/30 dark:border-sky-500 dark:bg-sky-950/40 dark:ring-sky-500/25";

const fieldClass =
    "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500/40 dark:focus:ring-sky-500/20";

const labelClass = "mb-2 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

export default function StudyKitPage() {
    const { t } = useI18n();
    const { user, openAuthModal } = useAuth();
    const [inputMode, setInputMode] = useState<"file" | "paste">("file");
    const [file, setFile] = useState<File | null>(null);
    const [pastedText, setPastedText] = useState("");
    const [preset, setPreset] = useState<StudyPreset>("summary_bullets");
    const [focus, setFocus] = useState<StudyFocusLevel>("general");
    const [optQuiz, setOptQuiz] = useState(false);
    const [optHighlight, setOptHighlight] = useState(true);
    const [optStripFluff, setOptStripFluff] = useState(false);
    const [summary, setSummary] = useState("");
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (preset === "quiz")
            setOptQuiz(false);
    }, [preset]);

    const previewItems = useMemo((): TranslationKey[] => {
        const out: TranslationKey[] = [PRESET_PREVIEW[preset], FOCUS_PREVIEW[focus]];
        if (optQuiz && preset !== "quiz")
            out.push("studyKitPvExtraQuiz");
        if (optHighlight)
            out.push("studyKitPvBold");
        if (optStripFluff)
            out.push("studyKitPvStrip");
        return out;
    }, [preset, focus, optQuiz, optHighlight, optStripFluff]);

    const onSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            openAuthModal();
            toast.info(t("studyKitSignInCta"));
            return;
        }
        if (inputMode === "file") {
            if (!file) {
                toast.error(t("studyKitErrNoFile"));
                return;
            }
        }
        else {
            const plain = stripHtmlToText(pastedText);
            if (!plain) {
                toast.error(t("studyKitErrNoPaste"));
                return;
            }
        }
        setLoading(true);
        setSummary("");
        setTruncated(false);
        try {
            const fd = new FormData();
            fd.set("inputMode", inputMode);
            fd.set("preset", preset);
            fd.set("focus", focus);
            fd.set("optQuiz", optQuiz ? "true" : "false");
            fd.set("optHighlight", optHighlight ? "true" : "false");
            fd.set("optStripFluff", optStripFluff ? "true" : "false");
            if (inputMode === "file" && file)
                fd.set("file", file);
            if (inputMode === "paste")
                fd.set("pastedText", stripHtmlToText(pastedText));
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
    }, [
        user,
        inputMode,
        file,
        pastedText,
        preset,
        focus,
        optQuiz,
        optHighlight,
        optStripFluff,
        openAuthModal,
        t,
    ]);

    return (<div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t("studyKit")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {t("studyKitHeroHint")}
      </p>

      {!user ? (<p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
          {t("studyKitSignInCta")}{" "}
          <button type="button" onClick={() => openAuthModal()} className="font-semibold text-amber-900 underline hover:no-underline dark:text-amber-50">
            {t("logIn")}
          </button>
        </p>) : null}

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-8">
        <div>
          <span className={labelClass}>{t("studyKitSectionInput")}</span>
          <div className="flex rounded-2xl border border-zinc-200 bg-zinc-100/90 p-1 dark:border-zinc-700 dark:bg-zinc-800/80">
            <button type="button" onClick={() => setInputMode("file")} className={[segBtn, inputMode === "file" ? segBtnOn : segBtnOff].join(" ")}>
              {t("studyKitInputModeFile")}
            </button>
            <button type="button" onClick={() => setInputMode("paste")} className={[segBtn, inputMode === "paste" ? segBtnOn : segBtnOff].join(" ")}>
              {t("studyKitInputModePaste")}
            </button>
          </div>

          {inputMode === "file" ? (<div className="mt-4">
              <label htmlFor="study-kit-file" className={labelClass}>
                {t("studyKitFileLabel")}
              </label>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{t("studyKitFileHint")}</p>
              <input id="study-kit-file" type="file" accept=".txt,.pdf,.pptx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
            }} className="block w-full cursor-pointer rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-900/50 dark:file:bg-zinc-200 dark:file:text-zinc-900"/>
              {file ? (<p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden/>
                  <span className="truncate">{file.name}</span>
                </p>) : null}
            </div>) : (<div className="mt-4">
              <label htmlFor="study-kit-paste" className={labelClass}>
                {t("studyKitPasteLabel")}
              </label>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{t("studyKitPasteHint")}</p>
              <textarea id="study-kit-paste" value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder={t("studyKitPastePlaceholder")} rows={10} className={`${fieldClass} min-h-[200px] resize-y font-mono text-[13px] leading-relaxed`}/>
            </div>)}
        </div>

        <fieldset className="min-w-0 border-0 p-0">
          <legend className={labelClass}>{t("studyKitSectionFormat")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {STUDY_PRESETS.map((p) => (<label key={p} className={[choiceBase, preset === p ? choiceOn : choiceOff].join(" ")}>
                <input type="radio" name="study-preset" value={p} checked={preset === p} onChange={() => setPreset(p)} className="sr-only"/>
                <span>{t(PRESET_LABEL[p])}</span>
              </label>))}
          </div>
        </fieldset>

        <fieldset className="min-w-0 border-0 p-0">
          <legend className={labelClass}>{t("studyKitSectionFocus")}</legend>
          <div className="flex flex-wrap gap-2">
            {STUDY_FOCUS_LEVELS.map((f) => (<label key={f} className={[choiceBase, focus === f ? choiceOn : choiceOff].join(" ")}>
                <input type="radio" name="study-focus" value={f} checked={focus === f} onChange={() => setFocus(f)} className="sr-only"/>
                <span>{t(FOCUS_LABEL[f])}</span>
              </label>))}
          </div>
        </fieldset>

        <div>
          <span className={labelClass}>{t("studyKitSectionBoosters")}</span>
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" checked={optQuiz} disabled={preset === "quiz"} onChange={(e) => setOptQuiz(e.target.checked)}/>
              <span>{t("studyKitOptQuiz")}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" checked={optHighlight} onChange={(e) => setOptHighlight(e.target.checked)}/>
              <span>{t("studyKitOptHighlight")}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" checked={optStripFluff} onChange={(e) => setOptStripFluff(e.target.checked)}/>
              <span>{t("studyKitOptStripFluff")}</span>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 px-4 py-3 dark:border-sky-500/25 dark:bg-sky-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-sky-200">
            {t("studyKitOutputPreviewTitle")}
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
            {previewItems.map((key, i) => (<li key={`${String(key)}-${i}`}>{t(key)}</li>))}
          </ul>
        </div>

        <button type="submit" disabled={loading || !user} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
          {loading ? (<>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden/>
              {t("studyKitProcessing")}
            </>) : t("studyKitGenerateCta")}
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
