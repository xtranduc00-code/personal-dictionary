"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type FormEvent,
    type KeyboardEvent,
    type SetStateAction,
} from "react";
import { ChevronDown, ChevronUp, Loader2, MessageSquareText, Send } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { StudyKitChatMarkdown } from "@/components/study-kit-chat-markdown";
import { StudyKitChatTutorBubble } from "@/components/study-kit-chat-tutor-bubble";
import { authFetch, useAuth } from "@/lib/auth-context";
import type { StudyKitChatMsg } from "@/lib/study-kit-chat-types";
import { newStudyKitChatMsgId } from "@/lib/study-kit-chat-types";

type Props = {
    studyContext: string;
    /** Shown on the disclosure control. */
    toggleLabel: string;
    /** Stable id for form fields (e.g. section storage key). */
    instanceId: string;
    messages: StudyKitChatMsg[];
    onMessagesChange: Dispatch<SetStateAction<StudyKitChatMsg[]>>;
    className?: string;
};

export function StudyKitSectionChat({
    studyContext,
    toggleLabel,
    instanceId,
    messages,
    onMessagesChange,
    className = "",
}: Props) {
    const { t } = useI18n();
    const { user, openAuthModal } = useAuth();
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const messagesScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = messagesScrollRef.current;
        if (!el)
            return;
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, [messages, loading]);

    const send = useCallback(
        async (raw: string) => {
            const text = raw.trim();
            if (!text || loading)
                return;
            if (!user) {
                openAuthModal();
                toast.info(t("studyKitChatSignIn"));
                return;
            }
            const userMsg: StudyKitChatMsg = { id: newStudyKitChatMsgId(), role: "user", content: text };
            let priorThread: StudyKitChatMsg[] = [];
            let nextThread: StudyKitChatMsg[] = [];

            setInput("");
            setLoading(true);
            onMessagesChange((prev) => {
                priorThread = prev;
                nextThread = [...prev, userMsg];
                return nextThread;
            });

            try {
                const res = await authFetch("/api/study-kit/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        studyContext,
                        messages: nextThread,
                    }),
                });
                const data = (await res.json()) as { reply?: string; code?: string; detail?: string };
                if (!res.ok) {
                    if (data.detail)
                        console.error("[study-kit/chat]", res.status, data.code, data.detail);
                    toast.error(t("studyKitChatErr"));
                    onMessagesChange(priorThread);
                    return;
                }
                const reply = data.reply?.trim();
                if (reply) {
                    onMessagesChange([...nextThread, { id: newStudyKitChatMsgId(), role: "assistant", content: reply }]);
                }
                else {
                    toast.error(t("studyKitChatErr"));
                }
            }
            catch {
                toast.error(t("studyKitChatErr"));
                onMessagesChange(priorThread);
            }
            finally {
                setLoading(false);
            }
        },
        [user, loading, studyContext, onMessagesChange, openAuthModal, t],
    );

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        void send(input);
    };

    const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== "Enter")
            return;
        if (e.shiftKey || e.nativeEvent.isComposing)
            return;
        e.preventDefault();
        void send(input);
    };

    const fieldId = `study-kit-sec-chat-${instanceId}`;

    return (
        <div
            className={[
                "mt-0 flex min-h-0 flex-col rounded-xl border border-zinc-200/80 bg-zinc-50/40 dark:border-white/10 dark:bg-zinc-900/25",
                className,
            ].join(" ")}
        >
            <h2 className="m-0 flex items-center gap-2 border-b border-zinc-200/80 px-3 py-2.5 text-left text-[12px] font-semibold text-[#334155] dark:border-white/10 dark:text-zinc-200">
                <MessageSquareText
                    className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400"
                    aria-hidden
                />
                <span className="min-w-0 flex-1">{toggleLabel}</span>
                <button
                    type="button"
                    onClick={() => setCollapsed((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200/80 bg-white/80 px-2 py-1 text-[11px] font-semibold text-[#475569] transition hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? t("studyKitPanelExpand") : t("studyKitPanelCollapse")}
                >
                    {collapsed ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    )}
                    <span>{collapsed ? t("studyKitPanelExpand") : t("studyKitPanelCollapse")}</span>
                </button>
            </h2>
            {collapsed ? null : (
                <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
                    <div
                        ref={messagesScrollRef}
                        className="mb-2 max-h-[min(40vh,320px)] min-h-[140px] space-y-2 overflow-y-auto rounded-lg border border-zinc-200/60 bg-white/80 px-2 py-2 dark:border-white/10 dark:bg-zinc-950/40 lg:max-h-[min(52vh,420px)]"
                    >
                        {messages.length === 0 ? (
                            <p className="px-1 text-center text-[11px] text-[#94A3B8] dark:text-zinc-500">
                                {t("studyKitChatEmpty")}
                            </p>
                        ) : (
                            messages.map((m) => (
                                <div
                                    key={m.id}
                                    className={
                                        m.role === "user"
                                            ? "ml-2 rounded-lg bg-blue-50/90 px-2.5 py-1.5 text-[12px] leading-relaxed text-[#1e3a5f] dark:bg-sky-950/40 dark:text-sky-100"
                                            : "mr-1 rounded-lg border border-zinc-200/70 bg-zinc-50/80 px-2.5 py-1.5 text-[12px] leading-relaxed text-[#334155] dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-200"
                                    }
                                >
                                    {m.role === "user" ? (
                                        <>
                                            <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-sky-200/80">
                                                {t("studyKitChatYou")}
                                            </span>
                                            <StudyKitChatMarkdown markdown={m.content} />
                                        </>
                                    ) : (
                                        <StudyKitChatTutorBubble
                                            content={m.content}
                                            onSave={(next) =>
                                                onMessagesChange((prev) =>
                                                    prev.map((x) => (x.id === m.id ? { ...x, content: next } : x)),
                                                )
                                            }
                                            onDelete={() =>
                                                onMessagesChange((prev) => prev.filter((x) => x.id !== m.id))
                                            }
                                        />
                                    )}
                                </div>
                            ))
                        )}
                        {loading ? (
                            <div className="flex items-center gap-2 px-1 text-[11px] text-[#64748B] dark:text-zinc-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                {t("studyKitChatThinking")}
                            </div>
                        ) : null}
                    </div>
                    <form onSubmit={onSubmit} className="space-y-2">
                        <label htmlFor={fieldId} className="sr-only">
                            {t("studyKitChatInputLabel")}
                        </label>
                        <p className="text-[10px] leading-snug text-[#94A3B8] dark:text-zinc-500">
                            {t("studyKitChatEnterHint")}
                        </p>
                        <textarea
                            id={fieldId}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onComposerKeyDown}
                            rows={3}
                            placeholder={t("studyKitChatPlaceholder")}
                            className="w-full resize-y rounded-lg border border-zinc-200/90 bg-white px-2.5 py-2 text-[12px] leading-relaxed text-[#0f172a] outline-none placeholder:text-zinc-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500/50"
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                        >
                            {loading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                                <Send className="h-3.5 w-3.5" aria-hidden />
                            )}
                            {t("studyKitChatSend")}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
