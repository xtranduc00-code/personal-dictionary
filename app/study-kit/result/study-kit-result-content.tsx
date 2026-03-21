"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type SetStateAction,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { StudyKitResultActions } from "@/components/study-kit-result-actions";
import { StudyKitResultSheetWithChats } from "@/components/study-kit-result-sheet-with-chats";
import { StudyKitSectionChat } from "@/components/study-kit-section-chat";
import { StudyKitSessionHistoryAside } from "@/components/study-kit-session-history-aside";
import { normalizeStudyKitSheetMarkdown } from "@/lib/study-kit-markdown-normalize";
import { splitMarkdownByTopLevelH2 } from "@/lib/study-kit-section";
import type { StudyKitChatMsg } from "@/lib/study-kit-chat-types";
import { STUDY_KIT_WIP_META_KEY } from "@/lib/study-kit-session-meta";
import { authFetch, useAuth } from "@/lib/auth-context";

const STORAGE_KEY = "study-kit-result";
const STORAGE_TRUNCATED_KEY = "study-kit-truncated";

function sectionThreadsStorageKey(sessionId: string | null): string {
    return `study-kit-sec-threads:${sessionId ?? "anon"}`;
}

const pageShell =
    "-mx-4 w-[calc(100%+2rem)] bg-[#F6F7F9] pb-20 pt-1 antialiased md:-mx-8 md:w-[calc(100%+4rem)] md:pb-24 dark:bg-[#0a0a0b]";

export function StudyKitResultContent() {
    const { t } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlSessionId = searchParams.get("session");
    const { user } = useAuth();
    const [summary, setSummary] = useState("");
    const [truncated, setTruncated] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sectionThreads, setSectionThreads] = useState<Record<string, StudyKitChatMsg[]>>({});
    const [sheetMode, setSheetMode] = useState<"view" | "edit">("view");
    const [quizDisplayCount, setQuizDisplayCount] = useState(30);
    /** Right-rail section chat targets the `##` block most in view (or clicked). */
    const [activeSectionIdx, setActiveSectionIdx] = useState(0);
    const loadGen = useRef(0);
    const summaryBaselineRef = useRef("");
    const threadsBaselineRef = useRef("");
    const anonThreadsHydrated = useRef(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        summaryBaselineRef.current = summary;
    }, [sessionId]);

    useEffect(() => {
        if (!summary.trim())
            return;
        try {
            sessionStorage.setItem(STORAGE_KEY, summary);
        }
        catch {
            /* quota */
        }
    }, [summary]);

    useEffect(() => {
        if (!sessionId || !user)
            return;
        if (summary === summaryBaselineRef.current)
            return;
        const handle = window.setTimeout(() => {
            void authFetch(`/api/study-kit/sessions/${encodeURIComponent(sessionId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ summary }),
            })
                .then((r) => {
                    if (r.ok)
                        summaryBaselineRef.current = summary;
                    else
                        toast.error(t("studyKitSessionSaveErr"));
                })
                .catch(() => {
                    toast.error(t("studyKitSessionSaveErr"));
                });
        }, 1200);
        return () => window.clearTimeout(handle);
    }, [summary, sessionId, user, t]);

    const storageKeyForThreads = sectionThreadsStorageKey(sessionId);

    /** Anonymous result: load threads from sessionStorage once (no `?session=`). */
    useEffect(() => {
        if (!mounted || urlSessionId || anonThreadsHydrated.current)
            return;
        anonThreadsHydrated.current = true;
        try {
            const raw = sessionStorage.getItem(sectionThreadsStorageKey(null));
            if (raw) {
                const parsed = JSON.parse(raw) as unknown;
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                    setSectionThreads(parsed as Record<string, StudyKitChatMsg[]>);
            }
        }
        catch {
            /* ignore */
        }
    }, [mounted, urlSessionId]);

    useEffect(() => {
        try {
            sessionStorage.setItem(storageKeyForThreads, JSON.stringify(sectionThreads));
        }
        catch {
            /* quota */
        }
    }, [sectionThreads, storageKeyForThreads]);

    useEffect(() => {
        if (!sessionId || !user)
            return;
        const ser = JSON.stringify(sectionThreads);
        if (ser === threadsBaselineRef.current)
            return;
        const handle = window.setTimeout(() => {
            void authFetch(`/api/study-kit/sessions/${encodeURIComponent(sessionId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sectionThreads }),
            })
                .then((r) => {
                    if (r.ok)
                        threadsBaselineRef.current = ser;
                    else
                        toast.error(t("studyKitSessionSaveErr"));
                })
                .catch(() => {
                    toast.error(t("studyKitSessionSaveErr"));
                });
        }, 1200);
        return () => window.clearTimeout(handle);
    }, [sectionThreads, sessionId, user, t]);

    useEffect(() => {
        if (!mounted)
            return;
        const gen = ++loadGen.current;
        let cancelled = false;

        async function run() {
            if (urlSessionId) {
                if (!user) {
                    router.replace("/study-kit");
                    return;
                }
                const res = await authFetch(`/api/study-kit/sessions/${encodeURIComponent(urlSessionId)}`);
                if (cancelled || gen !== loadGen.current)
                    return;
                if (!res.ok) {
                    toast.error(t("studyKitHistoryLoadErr"));
                    router.replace("/study-kit");
                    return;
                }
                const data = (await res.json()) as {
                    session?: {
                        id: string;
                        summary: string;
                        truncated: boolean;
                        sectionThreads?: Record<string, StudyKitChatMsg[]>;
                    };
                };
                const s = data.session;
                if (!s || cancelled)
                    return;
                setSummary(s.summary);
                setTruncated(Boolean(s.truncated));
                setSessionId(s.id);
                const threads = s.sectionThreads && typeof s.sectionThreads === "object" ? s.sectionThreads : {};
                setSectionThreads(threads);
                const ser = JSON.stringify(threads);
                threadsBaselineRef.current = ser;
                try {
                    sessionStorage.setItem(sectionThreadsStorageKey(s.id), ser);
                }
                catch {
                    /* quota */
                }
                return;
            }

            const stored = sessionStorage.getItem(STORAGE_KEY);
            if (!stored) {
                router.replace("/study-kit");
                return;
            }
            if (cancelled || gen !== loadGen.current)
                return;
            setSummary(stored);
            setTruncated(sessionStorage.getItem(STORAGE_TRUNCATED_KEY) === "true");
            setSessionId(null);

            const fresh = sessionStorage.getItem("study-kit-result-fresh") === "1";
            if (fresh)
                sessionStorage.removeItem("study-kit-result-fresh");

            if (!user || !fresh)
                return;

            const latestSummary =
                sessionStorage.getItem(STORAGE_KEY)?.trim() || stored;

            let meta: Record<string, unknown> = {};
            try {
                const m = sessionStorage.getItem(STUDY_KIT_WIP_META_KEY);
                if (m)
                    meta = JSON.parse(m) as Record<string, unknown>;
            }
            catch {
                /* ignore */
            }
            sessionStorage.removeItem(STUDY_KIT_WIP_META_KEY);

            let sectionThreadsPayload: Record<string, StudyKitChatMsg[]> = {};
            try {
                const tr = sessionStorage.getItem(sectionThreadsStorageKey(null));
                if (tr) {
                    const p = JSON.parse(tr) as unknown;
                    if (p && typeof p === "object" && !Array.isArray(p))
                        sectionThreadsPayload = p as Record<string, StudyKitChatMsg[]>;
                }
            }
            catch {
                /* ignore */
            }

            const res = await authFetch("/api/study-kit/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    summary: latestSummary,
                    truncated: sessionStorage.getItem(STORAGE_TRUNCATED_KEY) === "true",
                    meta,
                    sectionThreads: sectionThreadsPayload,
                }),
            });
            if (cancelled || gen !== loadGen.current)
                return;
            if (!res.ok) {
                toast.error(t("studyKitSessionSaveErr"));
                return;
            }
            const data = (await res.json()) as { session?: { id?: string } };
            const id = data.session?.id;
            if (typeof id === "string" && id) {
                setSessionId(id);
                threadsBaselineRef.current = JSON.stringify(sectionThreadsPayload);
                try {
                    sessionStorage.setItem(sectionThreadsStorageKey(id), JSON.stringify(sectionThreadsPayload));
                }
                catch {
                    /* quota */
                }
                router.replace(`/study-kit/result?session=${encodeURIComponent(id)}`, {
                    scroll: false,
                });
            }
        }

        void run();
        return () => {
            cancelled = true;
        };
    }, [mounted, urlSessionId, user, router, t]);

    const onSelectHistorySession = useCallback(
        (id: string) => {
            router.push(`/study-kit/result?session=${encodeURIComponent(id)}`, { scroll: false });
        },
        [router],
    );

    const hasSavedChats = useMemo(
        () => Object.values(sectionThreads).some((thread) => thread.length > 0),
        [sectionThreads],
    );

    const normalizedSummary = useMemo(() => normalizeStudyKitSheetMarkdown(summary), [summary]);

    const sheetHasH2Sections = useMemo(
        () => splitMarkdownByTopLevelH2(normalizedSummary).sections.length > 0,
        [normalizedSummary],
    );

    const viewSectionTitles = useMemo(
        () => splitMarkdownByTopLevelH2(normalizedSummary).sections.map((s) => s.title),
        [normalizedSummary],
    );

    useEffect(() => {
        setActiveSectionIdx((i) => {
            if (viewSectionTitles.length === 0)
                return 0;
            return Math.min(Math.max(0, i), viewSectionTitles.length - 1);
        });
    }, [viewSectionTitles.length]);

    const onSectionThreadMessagesChange = useCallback((action: SetStateAction<StudyKitChatMsg[]>) => {
        setSectionThreads((map) => {
            const key = String(activeSectionIdx);
            const cur = map[key] ?? [];
            const next = typeof action === "function" ? action(cur) : action;
            return { ...map, [key]: next };
        });
    }, [activeSectionIdx]);

    const onWholeSheetMessagesChange = useCallback((action: SetStateAction<StudyKitChatMsg[]>) => {
        setSectionThreads((map) => {
            const cur = map.whole ?? [];
            const next = typeof action === "function" ? action(cur) : action;
            return { ...map, whole: next };
        });
    }, []);

    if (!mounted || !summary)
        return null;

    return (
        <div
            className={pageShell}
            style={{ minHeight: "calc(100dvh - 3.5rem)" }}
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <header className="mb-6 pt-4 sm:pt-6">
                    <h1 className="sr-only">{t("studyKit")}</h1>
                    <button
                        type="button"
                        onClick={() => router.push("/study-kit")}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 text-sm font-medium text-[#475569] transition hover:border-zinc-300 hover:bg-zinc-50/80 hover:text-[#334155] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-white/15 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        {t("studyKitBackToForm")}
                    </button>
                </header>

                {truncated ? (
                    <div
                        className="mb-4 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100"
                    >
                        {t("studyKitTruncatedBanner")}
                    </div>
                ) : null}

                <StudyKitResultActions summary={summary} truncated={truncated} />

                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex shrink-0 rounded-lg border border-zinc-200/80 bg-zinc-50/80 p-0.5 dark:border-white/10 dark:bg-zinc-900/50">
                        <button
                            type="button"
                            onClick={() => setSheetMode("view")}
                            className={[
                                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                                sheetMode === "view"
                                    ? "bg-white text-[#0f172a] shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                                    : "text-[#64748B] hover:text-[#334155] dark:text-zinc-400 dark:hover:text-zinc-200",
                            ].join(" ")}
                        >
                            {t("studyKitSheetViewMode")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setSheetMode("edit")}
                            className={[
                                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                                sheetMode === "edit"
                                    ? "bg-white text-[#0f172a] shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                                    : "text-[#64748B] hover:text-[#334155] dark:text-zinc-400 dark:hover:text-zinc-200",
                            ].join(" ")}
                        >
                            {t("studyKitSheetEditMode")}
                        </button>
                    </div>
                    <p className="max-w-xl text-[11px] leading-snug text-[#64748B] dark:text-zinc-400">
                        {sheetMode === "edit" ? t("studyKitSheetEditHint") : null}
                    </p>
                </div>

                {sheetMode === "edit" && hasSavedChats ? (
                    <div
                        role="status"
                        className="mb-3 rounded-xl border border-sky-200/85 bg-sky-50/90 px-3 py-2.5 text-[11px] leading-snug text-sky-950 dark:border-sky-500/25 dark:bg-sky-950/35 dark:text-sky-100"
                    >
                        {t("studyKitResultSavedChatsUsePreview")}
                    </div>
                ) : null}

                <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:items-start lg:gap-8">
                    <div className="min-h-0 min-w-0">
                        {sheetMode === "view" ? (
                            <StudyKitResultSheetWithChats
                                markdown={normalizedSummary}
                                onSectionFocus={sheetHasH2Sections ? setActiveSectionIdx : undefined}
                                activeSectionIndex={sheetHasH2Sections ? activeSectionIdx : undefined}
                            />
                        ) : (
                            <div className="rounded-xl border border-zinc-200/60 bg-white/80 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-zinc-950/40 dark:shadow-none">
                                <label htmlFor="study-kit-sheet-md" className="sr-only">
                                    {t("studyKitSheetEditMode")}
                                </label>
                                <textarea
                                    id="study-kit-sheet-md"
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                    spellCheck
                                    className="min-h-[min(62vh,560px)] w-full resize-y rounded-xl bg-transparent px-4 py-4 font-mono text-[13px] leading-relaxed text-[#0f172a] outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-zinc-100"
                                />
                            </div>
                        )}
                    </div>
                    <div className="mt-8 flex min-h-0 min-w-0 flex-col gap-6 lg:mt-0">
                        {sheetMode === "view" && sheetHasH2Sections ? (
                            <div className="min-h-0 shrink-0 lg:sticky lg:top-24 lg:z-10 lg:max-h-[min(72vh,520px)] lg:overflow-y-auto lg:pr-1">
                                <StudyKitSectionChat
                                    studyContext={normalizedSummary}
                                    sectionTitle={viewSectionTitles[activeSectionIdx] ?? null}
                                    toggleLabel={t("studyKitSectionChatToggle")}
                                    hint={t("studyKitSectionChatHint")}
                                    instanceId={String(activeSectionIdx)}
                                    messages={sectionThreads[String(activeSectionIdx)] ?? []}
                                    onMessagesChange={onSectionThreadMessagesChange}
                                />
                            </div>
                        ) : sheetMode === "view" && !sheetHasH2Sections ? (
                            <div className="min-h-0 shrink-0 lg:sticky lg:top-24 lg:z-10 lg:max-h-[min(72vh,520px)] lg:overflow-y-auto lg:pr-1">
                                <StudyKitSectionChat
                                    studyContext={normalizedSummary}
                                    sectionTitle={null}
                                    toggleLabel={t("studyKitSheetChatToggle")}
                                    hint={t("studyKitSheetChatHint")}
                                    instanceId="whole"
                                    messages={sectionThreads.whole ?? []}
                                    onMessagesChange={onWholeSheetMessagesChange}
                                />
                            </div>
                        ) : null}
                        <StudyKitSessionHistoryAside
                            sessionId={sessionId}
                            onSelectSession={onSelectHistorySession}
                            className="min-h-0 shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)]"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
