"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    AlignLeft,
    Brain,
    FileText,
    FileUp,
    Link2,
    ListChecks,
    Loader2,
    Sparkles,
    UploadCloud,
    X,
    type LucideIcon,
} from "lucide-react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, useAuth } from "@/lib/auth-context";
import type { TranslationKey } from "@/lib/i18n";
import { parseSourceUrlList } from "@/lib/study-kit-extract";
import {
    PRESET_OUTPUT_ORDER,
    STUDY_QUIZ_DEPTHS,
    type StudyPreset,
    type StudyQuizDepth,
    parseStudyQuizDepth,
} from "@/lib/study-kit-prompt";
import {
    STUDY_KIT_WIP_META_KEY,
    buildSessionMetaV1,
    isStudyKitSessionMetaV1,
    stringifyMetaSafe,
} from "@/lib/study-kit-session-meta";

type SummarizeResponse = {
    summary?: string;
    truncated?: boolean;
    fileName?: string;
    code?: string;
    detail?: string;
    jobId?: string;
    async?: boolean;
};

type JobPollResponse = {
    status: string;
    summary?: string;
    truncated?: boolean;
    fileName?: string;
    code?: string;
    detail?: string;
};

const ASYNC_POLL_MS = 2000;
const ASYNC_MAX_POLLS = 450;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_SOURCES = 10;

const PRESET_LABEL: Record<StudyPreset, TranslationKey> = {
    summary_bullets: "studyKitPresetSummaryBullets",
    mindmap: "studyKitPresetMindmap",
    quiz: "studyKitPresetQuiz",
};

const QUIZ_DEPTH_LABEL: Record<StudyQuizDepth, TranslationKey> = {
    review: "studyKitQuizDepthReview",
    exam: "studyKitQuizDepthExam",
    adaptive: "studyKitQuizDepthAdaptive",
};

const PRESET_ICON: Record<StudyPreset, LucideIcon> = {
    summary_bullets: FileText,
    mindmap: Brain,
    quiz: ListChecks,
};

const STUDY_KIT_MAX_FILE_BYTES = 8 * 1024 * 1024;

const STUDY_KIT_DROPZONE_ACCEPT = {
    "text/plain": [".txt"],
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/webp": [".webp"],
    "image/gif": [".gif"],
} as const;

type SourceRow =
    | { id: string; kind: "file"; file: File }
    | { id: string; kind: "url"; url: string }
    | { id: string; kind: "paste"; text: string }
    | { id: string; kind: "file_stub"; name: string; size: number };

function newSourceId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
        return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultFormats(): Record<StudyPreset, boolean> {
    return {
        summary_bullets: true,
        mindmap: false,
        quiz: false,
    };
}

function stripHtmlToText(s: string): string {
    return s
        .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function pastePreview(text: string, max = 72): string {
    const one = text.replace(/\s+/g, " ").trim();
    if (!one)
        return "";
    return one.length > max ? `${one.slice(0, max)}…` : one;
}

function toastForCode(t: (key: TranslationKey) => string, code: string | undefined) {
    const map: Record<string, TranslationKey> = {
        NO_FILE: "studyKitErrNoFile",
        NO_PASTE: "studyKitErrNoPaste",
        NO_URL: "studyKitErrNoUrl",
        URL_INVALID: "studyKitErrUrlInvalid",
        URL_BLOCKED: "studyKitErrUrlBlocked",
        URL_TOO_LARGE: "studyKitErrUrlTooLarge",
        URL_FETCH_FAILED: "studyKitErrUrlFetch",
        TOO_MANY_SOURCES: "studyKitErrTooManySources",
        NO_SOURCES: "studyKitErrNoSources",
        UNSUPPORTED_TYPE: "studyKitErrBadType",
        EMPTY_TEXT: "studyKitErrEmpty",
        PDF_NO_TEXT: "studyKitErrPdfNoText",
        FILE_TOO_LARGE: "studyKitErrLarge",
        EXTRACT_FAILED: "studyKitErrExtract",
        OCR_FAILED: "studyKitErrOcrFailed",
        SERVER_CONFIG: "studyKitErrServerConfig",
        UNAUTHORIZED: "studyKitErrUnauthorized",
        SUMMARIZE_FAILED: "studyKitErrAiFailed",
        JOB_CREATE_FAILED: "studyKitErrJobEnqueue",
        STORAGE_UPLOAD_FAILED: "studyKitErrStorageUpload",
        NOT_FOUND: "studyKitErrGeneric",
    };
    const translationKey: TranslationKey =
        code && map[code] ? map[code]! : "studyKitErrGeneric";
    toast.error(t(translationKey));
}

const pageShell =
    "-mx-4 w-[calc(100%+2rem)] bg-[#F6F7F9] pb-20 pt-1 antialiased md:-mx-8 md:w-[calc(100%+4rem)] md:pb-24 dark:bg-[#0a0a0b]";
const surfaceCard =
    "rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] sm:p-8 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] dark:backdrop-blur-sm";
const innerPanel =
    "rounded-xl border border-[#E5E7EB]/80 bg-[#F6F7F9]/80 p-4 sm:p-6 dark:border-white/[0.08] dark:bg-zinc-900/40";
const badgePill =
    "mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200/90 bg-blue-50/90 px-3.5 py-1.5 text-xs font-semibold text-blue-800 shadow-[0_1px_2px_rgba(59,130,246,0.12)] dark:border-sky-500/25 dark:bg-sky-950/40 dark:text-sky-200 dark:shadow-none";
const hintText = "text-xs leading-relaxed text-[#64748B] dark:text-zinc-400";
const segWrap =
    "flex rounded-xl border border-[#E5E7EB] bg-[#EEF0F3] p-1 dark:border-white/10 dark:bg-white/[0.06]";
const segBtn =
    "relative flex-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:px-3 sm:text-sm";
const segBtnOn =
    "z-[1] bg-white text-[#0f172a] shadow-[0_2px_10px_rgba(0,0,0,0.07)] ring-2 ring-blue-500/50 ring-offset-2 ring-offset-[#EEF0F3] dark:bg-zinc-800 dark:text-zinc-50 dark:ring-sky-400/50 dark:ring-offset-zinc-900/90";
const segBtnOff =
    "text-[#64748B] hover:text-[#0f172a] dark:text-zinc-400 dark:hover:text-zinc-100";
const fieldClass =
    "w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5 text-sm text-[#111827] shadow-none outline-none ring-0 placeholder:text-[#9CA3AF] focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-black/30 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/25 dark:focus:ring-1 dark:focus:ring-white/20";
const labelClass = "mb-2 block text-sm font-semibold text-[#0f172a] dark:text-zinc-100";
const choiceBase =
    "cursor-pointer rounded-xl border px-3.5 py-3 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/35";
const choiceOff =
    "border-[#E5E7EB] bg-white hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-[0_2px_8px_rgba(59,130,246,0.08)] dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-sky-500/30 dark:hover:bg-sky-950/25";
const choiceOn =
    "border-blue-400 bg-blue-50/90 shadow-[0_2px_8px_rgba(59,130,246,0.12)] ring-2 ring-blue-500/20 dark:border-sky-500/50 dark:bg-sky-950/35 dark:ring-sky-500/25";
const primaryCta =
    "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_6px_22px_-4px_rgba(59,130,246,0.55)] transition hover:bg-blue-500 hover:shadow-[0_8px_28px_-4px_rgba(59,130,246,0.52)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F7F9] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:bg-sky-600 dark:shadow-[0_6px_24px_-6px_rgba(14,165,233,0.5)] dark:hover:bg-sky-500 dark:focus-visible:ring-sky-400/50 dark:focus-visible:ring-offset-[#0a0a0b]";
const sectionRule = "border-t border-[#E5E7EB] pt-8 mt-8 dark:border-white/10";
const trayClass =
    "mt-5 rounded-2xl border border-blue-200/85 bg-gradient-to-b from-blue-50/80 to-blue-50/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-sky-500/25 dark:from-sky-950/40 dark:to-sky-950/15 dark:shadow-none";
const outputSectionShell =
    "rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/55 via-white to-white p-4 sm:p-5 dark:border-sky-500/25 dark:from-sky-950/30 dark:via-zinc-950/45 dark:to-zinc-950/25";
const sourceCardClass =
    "flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2.5 text-left dark:border-white/10 dark:bg-zinc-900/50";

const MAX_CUSTOM_SCOPE_CHARS = 3000;

const STORAGE_KEY = "study-kit-result";
const STORAGE_TRUNCATED_KEY = "study-kit-truncated";

function StudyKitPageInner() {
    const { t } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const resumeId = searchParams.get("resume");
    const { user, openAuthModal } = useAuth();
    const [inputTab, setInputTab] = useState<"file" | "paste" | "url">("file");
    const [sources, setSources] = useState<SourceRow[]>([]);
    const [urlDraft, setUrlDraft] = useState("");
    const [pasteDraft, setPasteDraft] = useState("");
    const [customScope, setCustomScope] = useState("");
    const [formats, setFormats] = useState<Record<StudyPreset, boolean>>(defaultFormats);
    const [quizDepth, setQuizDepth] = useState<StudyQuizDepth>("review");
    const [loading, setLoading] = useState(false);
    const submitGenRef = useRef(0);

    useEffect(() => {
        return () => {
            submitGenRef.current += 1;
        };
    }, []);

    useEffect(() => {
        if (!resumeId || !user)
            return;
        let cancelled = false;
        void (async () => {
            const res = await authFetch(`/api/study-kit/sessions/${encodeURIComponent(resumeId)}`);
            if (cancelled)
                return;
            if (!res.ok) {
                toast.error(t("studyKitHistoryLoadErr"));
                router.replace("/study-kit", { scroll: false });
                return;
            }
            const data = (await res.json()) as { session?: { meta?: unknown } };
            const meta = data.session?.meta;
            if (!isStudyKitSessionMetaV1(meta)) {
                toast.info(t("studyKitResumeNoMeta"));
                router.replace("/study-kit", { scroll: false });
                return;
            }
            setInputTab(meta.inputTab);
            setCustomScope(meta.customScope);
            const nextFormats = defaultFormats();
            for (const p of PRESET_OUTPUT_ORDER) {
                const v = (meta.formats as Record<string, unknown>)[p];
                if (typeof v === "boolean")
                    nextFormats[p] = v;
            }
            setFormats(nextFormats);
            setQuizDepth(
                meta.quizDepth !== undefined
                    ? parseStudyQuizDepth(meta.quizDepth)
                    : "review",
            );
            const rows: SourceRow[] = [];
            for (const s of meta.sources) {
                if (s.k === "url")
                    rows.push({ id: newSourceId(), kind: "url", url: s.url });
                else if (s.k === "paste")
                    rows.push({ id: newSourceId(), kind: "paste", text: s.text });
                else
                    rows.push({
                        id: newSourceId(),
                        kind: "file_stub",
                        name: s.name,
                        size: s.size,
                    });
            }
            setSources(rows);
            toast.success(t("studyKitResumeFormLoaded"));
            router.replace("/study-kit", { scroll: false });
        })();
        return () => {
            cancelled = true;
        };
    }, [resumeId, user, router, t]);

    const toggleFormat = useCallback((p: StudyPreset) => {
        setFormats((prev) => {
            const nSelected = PRESET_OUTPUT_ORDER.filter((x) => prev[x]).length;
            if (prev[p] && nSelected <= 1) {
                queueMicrotask(() => {
                    toast.error(t("studyKitKeepOneFormat"));
                });
                return prev;
            }
            return { ...prev, [p]: !prev[p] };
        });
    }, [t]);

    const ingestFiles = useCallback(
        (picked: File[]) => {
            if (picked.length === 0)
                return;
            setSources((prev) => {
                const room = MAX_SOURCES - prev.length;
                if (room <= 0) {
                    queueMicrotask(() => {
                        toast.error(t("studyKitErrTooManySources"));
                    });
                    return prev;
                }
                const oversized = picked.filter((f) => f.size > STUDY_KIT_MAX_FILE_BYTES);
                if (oversized.length > 0) {
                    queueMicrotask(() => {
                        toast.error(t("studyKitErrLarge"));
                    });
                }
                const ok = picked.filter((f) => f.size <= STUDY_KIT_MAX_FILE_BYTES);
                if (ok.length === 0)
                    return prev;
                const take = ok.slice(0, room);
                if (ok.length > room) {
                    queueMicrotask(() => {
                        toast.info(t("studyKitSourcesTrimmed"));
                    });
                }
                const next: SourceRow[] = take.map((file) => ({
                    id: newSourceId(),
                    kind: "file",
                    file,
                }));
                return [...prev, ...next];
            });
        },
        [t],
    );

    const onDropRejected = useCallback(
        (rejections: FileRejection[]) => {
            const tooBig = rejections.some((r) =>
                r.errors.some((e) => e.code === "file-too-large"),
            );
            const badType = rejections.some((r) =>
                r.errors.some((e) => e.code === "file-invalid-type"),
            );
            if (tooBig)
                toast.error(t("studyKitErrLarge"));
            else if (badType)
                toast.error(t("studyKitErrBadType"));
        },
        [t],
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: ingestFiles,
        onDropRejected,
        accept: STUDY_KIT_DROPZONE_ACCEPT,
        maxSize: STUDY_KIT_MAX_FILE_BYTES,
        multiple: true,
        disabled: !user || loading,
        noKeyboard: true,
    });

    const confirmUrls = useCallback(() => {
        const list = parseSourceUrlList(urlDraft);
        if (list.length === 0) {
            toast.error(t("studyKitErrNoUrl"));
            return;
        }
        for (const u of list) {
            try {
                const parsed = new URL(u);
                if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                    toast.error(t("studyKitErrUrlInvalid"));
                    return;
                }
            }
            catch {
                toast.error(t("studyKitErrUrlInvalid"));
                return;
            }
        }
        let cleared = false;
        setSources((prev) => {
            const existing = new Set(
                prev.filter((s): s is SourceRow & { kind: "url" } => s.kind === "url").map((s) => s.url),
            );
            const novel = list.filter((u) => !existing.has(u));
            if (novel.length === 0) {
                queueMicrotask(() => {
                    toast.info(t("studyKitSourceDuplicateUrl"));
                });
                return prev;
            }
            const room = MAX_SOURCES - prev.length;
            if (room <= 0) {
                queueMicrotask(() => {
                    toast.error(t("studyKitErrTooManySources"));
                });
                return prev;
            }
            const take = novel.slice(0, room);
            if (novel.length > room) {
                queueMicrotask(() => {
                    toast.info(t("studyKitSourcesTrimmed"));
                });
            }
            const added: SourceRow[] = take.map((url) => ({
                id: newSourceId(),
                kind: "url",
                url,
            }));
            cleared = true;
            return [...prev, ...added];
        });
        if (cleared)
            setUrlDraft("");
    }, [urlDraft, t]);

    const confirmPaste = useCallback(() => {
        const plain = stripHtmlToText(pasteDraft);
        if (!plain) {
            toast.error(t("studyKitErrNoPaste"));
            return;
        }
        let cleared = false;
        setSources((prev) => {
            if (prev.length >= MAX_SOURCES) {
                queueMicrotask(() => {
                    toast.error(t("studyKitErrTooManySources"));
                });
                return prev;
            }
            cleared = true;
            return [...prev, { id: newSourceId(), kind: "paste", text: plain }];
        });
        if (cleared)
            setPasteDraft("");
    }, [pasteDraft, t]);

    const removeSource = useCallback((id: string) => {
        setSources((prev) => prev.filter((s) => s.id !== id));
    }, []);

    const onSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!user) {
                openAuthModal();
                toast.info(t("studyKitSignInCta"));
                return;
            }
            const presets = PRESET_OUTPUT_ORDER.filter((p) => formats[p]);
            if (presets.length === 0) {
                toast.error(t("studyKitErrNoFormat"));
                return;
            }
            const usableSources = sources.filter(
                (s): s is Exclude<SourceRow, { kind: "file_stub" }> => s.kind !== "file_stub",
            );
            if (usableSources.length === 0) {
                toast.error(t("studyKitErrNoSources"));
                return;
            }
            if (sources.length > MAX_SOURCES) {
                toast.error(t("studyKitErrTooManySources"));
                return;
            }
            setLoading(true);
            const gen = ++submitGenRef.current;
            try {
                const applyResultAndGo = (summaryText: string, isTruncated: boolean) => {
                    const text = summaryText.trim();
                    if (!text) {
                        toast.error(t("studyKitErrGeneric"));
                        return;
                    }
                    sessionStorage.setItem(STORAGE_KEY, text);
                    sessionStorage.setItem(STORAGE_TRUNCATED_KEY, String(isTruncated));
                    sessionStorage.setItem("study-kit-result-fresh", "1");
                    router.push("/study-kit/result");
                };
                try {
                    sessionStorage.setItem(
                        STUDY_KIT_WIP_META_KEY,
                        stringifyMetaSafe(
                            buildSessionMetaV1(inputTab, sources, formats, customScope, quizDepth),
                        ),
                    );
                }
                catch {
                    /* quota */
                }

                const fd = new FormData();
                fd.set("inputMode", "mixed");
                fd.set("presets", presets.join(","));
                fd.set("quizDepth", quizDepth);
                const fileRows = usableSources.filter((s): s is SourceRow & { kind: "file" } => s.kind === "file");
                const urlRows = usableSources.filter((s): s is SourceRow & { kind: "url" } => s.kind === "url");
                const pasteRows = usableSources.filter((s): s is SourceRow & { kind: "paste" } => s.kind === "paste");
                for (const s of fileRows)
                    fd.append("file", s.file);
                fd.set("sourceUrls", urlRows.map((s) => s.url).join("\n"));
                for (const s of pasteRows)
                    fd.append("pastedChunk", s.text);
                if (customScope.trim())
                    fd.set("customScope", customScope.trim().slice(0, MAX_CUSTOM_SCOPE_CHARS));
                const res = await authFetch("/api/study-kit/summarize", {
                    method: "POST",
                    body: fd,
                });
                const raw = await res.text();
                let data: SummarizeResponse = {};
                if (raw) {
                    try {
                        data = JSON.parse(raw) as SummarizeResponse;
                    }
                    catch {
                        console.error("[study-kit/summarize] non-json body", res.status, raw.slice(0, 400));
                        toast.error(t("studyKitErrUnexpectedReply"));
                        return;
                    }
                }
                if (res.status === 202 && data.jobId) {
                    toast.info(t("studyKitAsyncStarted"));
                    for (let poll = 0; poll < ASYNC_MAX_POLLS; poll++) {
                        await sleep(ASYNC_POLL_MS);
                        if (gen !== submitGenRef.current)
                            return;
                        const jr = await authFetch(
                            `/api/study-kit/summarize/jobs/${encodeURIComponent(data.jobId!)}`,
                        );
                        const rawJ = await jr.text();
                        let job: JobPollResponse = { status: "unknown" };
                        if (rawJ) {
                            try {
                                job = JSON.parse(rawJ) as JobPollResponse;
                            }
                            catch {
                                console.error("[study-kit/job] non-json body", jr.status, rawJ.slice(0, 400));
                                toast.error(t("studyKitErrUnexpectedReply"));
                                return;
                            }
                        }
                        if (!jr.ok) {
                            if (job.detail)
                                console.error("[study-kit/job] error", job.code, job.detail);
                            toastForCode(t, job.code);
                            return;
                        }
                        if (job.status === "completed") {
                            applyResultAndGo(job.summary ?? "", Boolean(job.truncated));
                            return;
                        }
                        if (job.status === "failed") {
                            if (job.detail)
                                console.error("[study-kit/job] failed", job.code, job.detail);
                            toastForCode(t, job.code);
                            return;
                        }
                    }
                    toast.error(t("studyKitJobTimeout"));
                    return;
                }

                if (!res.ok) {
                    if (data.detail)
                        console.error("[study-kit/summarize] error", data.code, data.detail);
                    toastForCode(t, data.code);
                    return;
                }
                applyResultAndGo(data.summary ?? "", Boolean(data.truncated));
            }
            catch (e) {
                console.error("[study-kit/summarize] submit", e);
                toast.error(t("studyKitErrGeneric"));
            }
            finally {
                setLoading(false);
            }
        },
        [user, sources, customScope, formats, quizDepth, inputTab, openAuthModal, t, router],
    );

    return (
        <div
            className={pageShell}
            style={{ minHeight: "calc(100dvh - 3.5rem)" }}
        >
            <div className="mx-auto max-w-4xl px-4 sm:px-6">
                <header className="mb-8 text-center sm:text-left">
                    <div className={badgePill}>
                        <Sparkles
                            className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400"
                            strokeWidth={2}
                            aria-hidden
                        />
                        {t("studyKitBadge")}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0f172a] dark:text-white">
                        {t("studyKit")}
                    </h1>
                    <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#64748B] dark:text-zinc-400">
                        {t("studyKitHeroHint")}
                    </p>
                </header>

                {!user ? (
                    <p
                        className="mb-8 rounded-xl border border-blue-200/90 bg-blue-50/90 px-4 py-3 text-sm text-blue-950 dark:border-sky-500/25 dark:bg-sky-950/35 dark:text-sky-100"
                    >
                        {t("studyKitSignInCta")}{" "}
                        <button
                            type="button"
                            onClick={() => openAuthModal()}
                            className="font-semibold text-blue-800 underline decoration-blue-800/30 underline-offset-2 hover:no-underline dark:text-sky-200 dark:decoration-sky-200/30"
                        >
                            {t("logIn")}
                        </button>
                    </p>
                ) : null}

                <section className={surfaceCard}>
                    <form onSubmit={onSubmit} className="flex flex-col">
                        <div className={innerPanel}>
                            <span className={labelClass}>{t("studyKitSectionInput")}</span>
                            <p className={`mt-2 ${hintText}`}>{t("studyKitInputStackHint")}</p>

                            <div className={`${segWrap} mt-4`}>
                                <button
                                    type="button"
                                    onClick={() => setInputTab("file")}
                                    className={[segBtn, inputTab === "file" ? segBtnOn : segBtnOff].join(" ")}
                                >
                                    {t("studyKitInputModeFile")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInputTab("paste")}
                                    className={[segBtn, inputTab === "paste" ? segBtnOn : segBtnOff].join(" ")}
                                >
                                    {t("studyKitInputModePaste")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInputTab("url")}
                                    className={[segBtn, inputTab === "url" ? segBtnOn : segBtnOff].join(" ")}
                                >
                                    {t("studyKitInputModeUrl")}
                                </button>
                            </div>

                            <div className="mt-4 min-h-[200px]">
                                {inputTab === "file" ? (
                                    <div>
                                        <p className={`mb-3 ${hintText}`}>{t("studyKitFileHint")}</p>
                                        <div
                                            {...getRootProps({
                                                className: [
                                                    "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-blue-500/40",
                                                    isDragActive
                                                        ? "border-blue-500 bg-blue-50/80 shadow-[0_0_0_3px_rgba(59,130,246,0.15)] dark:border-sky-400 dark:bg-sky-950/45 dark:shadow-[0_0_0_3px_rgba(14,165,233,0.2)]"
                                                        : "border-[#94A3B8] bg-white hover:border-blue-400 hover:bg-blue-50/45 dark:border-white/30 dark:bg-white/[0.03] dark:hover:border-sky-500/55 dark:hover:bg-sky-950/25",
                                                    !user || loading ? "pointer-events-none opacity-45" : "",
                                                ].join(" "),
                                            })}
                                        >
                                            <input {...getInputProps()} />
                                            <UploadCloud
                                                className={`h-11 w-11 shrink-0 transition-transform duration-200 ${isDragActive ? "scale-110 text-blue-600 dark:text-sky-300" : "text-blue-500 dark:text-sky-400"}`}
                                                strokeWidth={1.65}
                                                aria-hidden
                                            />
                                            <p className="mt-3 text-sm font-semibold text-[#0f172a] dark:text-zinc-100">
                                                {t("studyKitFileDropTitle")}
                                            </p>
                                            <p className="mt-1 max-w-xs text-sm text-[#64748B] dark:text-zinc-400">
                                                {t("studyKitFileDropSubtitle")}
                                            </p>
                                        </div>
                                    </div>
                                ) : inputTab === "paste" ? (
                                    <div className="space-y-3">
                                        <p className={hintText}>{t("studyKitPasteHint")}</p>
                                        <textarea
                                            id="study-kit-paste"
                                            value={pasteDraft}
                                            onChange={(e) => setPasteDraft(e.target.value)}
                                            placeholder={t("studyKitPastePlaceholder")}
                                            rows={8}
                                            className={`${fieldClass} min-h-[160px] resize-y font-mono text-[13px] leading-relaxed`}
                                        />
                                        <button
                                            type="button"
                                            onClick={confirmPaste}
                                            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                        >
                                            {t("studyKitAddPasteCta")}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <p className={hintText}>{t("studyKitUrlHint")}</p>
                                        <textarea
                                            id="study-kit-url"
                                            value={urlDraft}
                                            onChange={(e) => setUrlDraft(e.target.value)}
                                            placeholder={t("studyKitUrlPlaceholder")}
                                            rows={5}
                                            className={`${fieldClass} min-h-[120px] resize-y font-mono text-[13px] leading-relaxed`}
                                        />
                                        <button
                                            type="button"
                                            onClick={confirmUrls}
                                            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                        >
                                            {t("studyKitAddLinksCta")}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className={trayClass}>
                                <p className="mb-3 px-0.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                                    {t("studyKitSourcesTrayTitle")}
                                    <span className="ml-1.5 tabular-nums font-medium text-zinc-500 dark:text-zinc-400">
                                        ({sources.length}/{MAX_SOURCES})
                                    </span>
                                </p>
                                {sources.length === 0 ? (
                                    <p className="px-1 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
                                        {t("studyKitSourcesTrayEmpty")}
                                    </p>
                                ) : (
                                    <ul className="flex max-h-[min(40vh,320px)] flex-col gap-2 overflow-y-auto pr-0.5">
                                        {sources.map((s) => (
                                            <li key={s.id} className={sourceCardClass}>
                                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:ring-white/10">
                                                    {s.kind === "file" ? (
                                                        <FileUp className="h-4 w-4 text-blue-600 dark:text-sky-400" aria-hidden />
                                                    ) : s.kind === "file_stub" ? (
                                                        <FileUp className="h-4 w-4 text-zinc-400 dark:text-zinc-500" aria-hidden />
                                                    ) : s.kind === "url" ? (
                                                        <Link2 className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
                                                    ) : (
                                                        <AlignLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                                    )}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                                        {s.kind === "file"
                                                            ? s.file.name
                                                            : s.kind === "file_stub"
                                                              ? s.name
                                                              : s.kind === "url"
                                                                ? s.url
                                                                : t("studyKitSourcePasteLabel")}
                                                    </p>
                                                    {s.kind === "paste" ? (
                                                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                                                            {pastePreview(s.text)}
                                                        </p>
                                                    ) : s.kind === "file" ? (
                                                        <p className="mt-0.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                                                            {(s.file.size / 1024).toFixed(1)} KB
                                                        </p>
                                                    ) : s.kind === "file_stub" ? (
                                                        <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/90">
                                                            {t("studyKitFileStubHint")}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeSource(s.id)}
                                                    className="shrink-0 rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                                    aria-label={t("studyKitSourceRemoveAria")}
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        <div className={sectionRule}>
                            <div className={outputSectionShell}>
                                <fieldset className="min-w-0 border-0 p-0">
                                    <legend className="mb-2 block text-lg font-bold tracking-tight text-[#0f172a] sm:text-xl dark:text-zinc-50">
                                        {t("studyKitSectionOutput")}
                                    </legend>
                                    <p className={`mb-4 ${hintText}`}>{t("studyKitSectionOutputHint")}</p>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {PRESET_OUTPUT_ORDER.map((preset) => {
                                            const Icon = PRESET_ICON[preset];
                                            return (
                                                <label
                                                    key={preset}
                                                    className={[
                                                        choiceBase,
                                                        "flex cursor-pointer items-start gap-3 text-left text-[#334155] dark:text-zinc-200",
                                                        formats[preset] ? choiceOn : choiceOff,
                                                    ].join(" ")}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="mt-2 h-4 w-4 shrink-0 rounded border-[#CBD5E1] text-blue-600 focus:ring-blue-500 dark:border-white/20 dark:text-sky-500"
                                                        checked={formats[preset]}
                                                        onChange={() => toggleFormat(preset)}
                                                    />
                                                    <span
                                                        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100/90 bg-blue-50/90 text-blue-700 dark:border-sky-500/25 dark:bg-sky-950/50 dark:text-sky-200"
                                                        aria-hidden
                                                    >
                                                        <Icon className="h-4 w-4" strokeWidth={2} />
                                                    </span>
                                                    <span className="min-w-0 flex-1 pt-1 text-[13px] leading-snug sm:text-sm">
                                                        {t(PRESET_LABEL[preset])}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {formats.quiz ? (
                                        <div className="mt-5 rounded-xl border border-blue-100/90 bg-blue-50/50 p-3.5 dark:border-sky-500/20 dark:bg-sky-950/25">
                                            <span className="mb-1 block text-sm font-semibold text-[#0f172a] dark:text-zinc-100">
                                                {t("studyKitQuizDepthLabel")}
                                            </span>
                                            <p className={`mb-3 text-xs leading-relaxed ${hintText}`}>
                                                {t("studyKitQuizDepthHint")}
                                            </p>
                                            <div className={`${segWrap} flex-col sm:flex-row`}>
                                                {STUDY_QUIZ_DEPTHS.map((d) => (
                                                    <button
                                                        key={d}
                                                        type="button"
                                                        onClick={() => setQuizDepth(d)}
                                                        className={[
                                                            segBtn,
                                                            quizDepth === d ? segBtnOn : segBtnOff,
                                                        ].join(" ")}
                                                    >
                                                        {t(QUIZ_DEPTH_LABEL[d])}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </fieldset>
                            </div>
                        </div>

                        <div className={sectionRule}>
                            <label htmlFor="study-kit-custom-scope" className={labelClass}>
                                {t("studyKitCustomScopeLabel")}
                            </label>
                            <p className={`mb-2 ${hintText}`}>{t("studyKitCustomScopeHint")}</p>
                            <textarea
                                id="study-kit-custom-scope"
                                value={customScope}
                                maxLength={MAX_CUSTOM_SCOPE_CHARS}
                                onChange={(e) => setCustomScope(e.target.value)}
                                placeholder={t("studyKitCustomScopePlaceholder")}
                                rows={3}
                                className={`${fieldClass} min-h-[88px] resize-y text-[13px] leading-relaxed`}
                            />
                            <p className="mt-1.5 text-right text-xs tabular-nums text-[#94A3B8] dark:text-zinc-500">
                                {customScope.length}/{MAX_CUSTOM_SCOPE_CHARS}
                            </p>
                        </div>

                        <button type="submit" disabled={loading || !user} className={primaryCta}>
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                    {t("studyKitProcessing")}
                                </>
                            ) : (
                                t("studyKitGenerateCta")
                            )}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
}

export default function StudyKitPage() {
    return (
        <Suspense
            fallback={
                <div className={pageShell} style={{ minHeight: "calc(100dvh - 3.5rem)" }}>
                    <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        …
                    </div>
                </div>
            }
        >
            <StudyKitPageInner />
        </Suspense>
    );
}
