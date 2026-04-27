"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useChat, useLocalParticipant } from "@livekit/components-react";
import {
    ExternalLink,
    File as FileIcon,
    FileSpreadsheet,
    FileText,
    Image as ImageIcon,
    Loader2,
    MessageCircle,
    Paperclip,
} from "lucide-react";
import { toast } from "react-toastify";
import { authFetch } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";

export type CallChatPanelVariant = "meet" | "watch";

type Props = {
    roomDisplayName: string;
    className?: string;
    /** `meet`: dark panel (calls). `watch`: white card (watch together / Speaking-like). */
    variant?: CallChatPanelVariant;
    /** Called when the user clicks "Hide chat" — parent controls visibility. */
    onToggle?: () => void;
};

type ChatMsgLike = {
    timestamp?: number;
    from?: { identity?: string; name?: string };
    message?: string;
};

const URL_RE = /https?:\/\/[^\s<]+/g;

/**
 * File messages travel through LiveKit data channel as plain text in a
 * fixed shape so any client (current or future) can parse them with a
 * regex — no separate `attachments` field on the chat protocol.
 *
 *   📎 <original filename>\n<url>\n[<size in bytes>]
 *
 * The `[<bytes>]` line is optional so older messages (before size was
 * encoded) still parse and render cleanly without it.
 */
const FILE_MSG_RE = /^📎 (.+)\n(https?:\/\/\S+)(?:\n\[(\d+)\])?\s*$/;

interface ParsedFileMessage {
    name: string;
    url: string;
    size?: number;
}

function parseFileMessage(text: string): ParsedFileMessage | null {
    const m = text.match(FILE_MSG_RE);
    if (!m) return null;
    return {
        name: m[1],
        url: m[2],
        size: m[3] ? Number(m[3]) : undefined,
    };
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic"]);
const SHEET_EXTS = new Set(["xls", "xlsx", "csv", "tsv", "ods", "numbers"]);
const DOC_EXTS = new Set(["pdf", "doc", "docx", "txt", "rtf", "md", "pages"]);

function pickFileIcon(ext: string) {
    if (IMAGE_EXTS.has(ext)) return ImageIcon;
    if (SHEET_EXTS.has(ext)) return FileSpreadsheet;
    if (DOC_EXTS.has(ext)) return FileText;
    return FileIcon;
}

/**
 * Middle-ellipsis filename. Two flex spans:
 *   ┌─────────────────────────┬─────────────┐
 *   │ head (truncate)         │ tail (full) │
 *   │ "DUY - IELTS - MARCH"…  │ "31-2.docx" │
 *   └─────────────────────────┴─────────────┘
 * The tail (last ~10 chars + extension) never shrinks, so the user
 * always sees what kind of file it is and any version suffix. End-
 * ellipsis would hide the extension, which is the worst part to lose.
 */
function MiddleTruncatedName({
    name,
    className,
}: {
    name: string;
    className?: string;
}) {
    const TAIL_RESERVE = 10; // characters of the basename to always show
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot) : "";
    const base = dot > 0 ? name.slice(0, dot) : name;
    const tailLen = Math.min(TAIL_RESERVE, base.length);
    const head = base.slice(0, base.length - tailLen);
    const tail = base.slice(base.length - tailLen) + ext;
    return (
        <span className={`flex min-w-0 max-w-full ${className ?? ""}`} title={name}>
            {/* `min-w-0` on the head is the key bit — without it, flex's
                default `min-width: auto` keeps the span at its content
                width, so truncation never fires and the tail wraps off-card.
                With `min-w-0` the ellipsis only shows when the name truly
                doesn't fit; otherwise the full name renders.            */}
            <span className="min-w-0 truncate">{head}</span>
            <span className="shrink-0 whitespace-pre">{tail}</span>
        </span>
    );
}

/**
 * The single, canonical render for a file message — one tap-target,
 * file icon by extension, original filename truncated to one line, a
 * dim metadata strip with `EXT · SIZE`. The raw URL and any UUIDs are
 * never shown; the whole card is the link.
 */
function FileMessageCard({
    file,
    variant,
}: {
    file: ParsedFileMessage;
    variant: CallChatPanelVariant;
}) {
    const isWatch = variant === "watch";
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const Icon = pickFileIcon(ext);
    const meta = [
        ext ? ext.toUpperCase() : null,
        file.size ? formatBytes(file.size) : null,
    ]
        .filter(Boolean)
        .join(" · ");

    // Tighter horizontal rhythm than the previous gap-3/px-3 — claws back
    // ~14px for the filename column so middle-truncation has room to show
    // useful characters before falling back to ellipsis. Stronger border
    // + bg makes the card stand out from the panel surface (the previous
    // border was almost invisible against bg-[#1f2937]).
    return (
        <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            title={file.name}
            className={`group flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                isWatch
                    ? "border-zinc-300 bg-white hover:bg-zinc-50"
                    : "border-zinc-500/70 bg-zinc-950/60 hover:bg-zinc-900/80"
            }`}
        >
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isWatch ? "bg-zinc-100" : "bg-zinc-800"
                }`}
                aria-hidden
            >
                <Icon
                    className={`h-4 w-4 ${isWatch ? "text-zinc-700" : "text-zinc-200"}`}
                    strokeWidth={2}
                />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <MiddleTruncatedName
                    name={file.name}
                    className={`text-sm font-medium ${
                        isWatch ? "text-zinc-900" : "text-zinc-100"
                    }`}
                />
                {meta ? (
                    <span
                        className={`truncate text-[11px] ${
                            isWatch ? "text-zinc-500" : "text-zinc-400"
                        }`}
                    >
                        {meta}
                    </span>
                ) : null}
            </span>
            <ExternalLink
                className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
                    isWatch ? "text-zinc-400" : "text-zinc-500"
                } opacity-60 group-hover:opacity-100`}
                aria-hidden
            />
        </a>
    );
}

/** Render message text with clickable links. File messages bypass this
 *  branch entirely and render as a single card via `FileMessageCard`. */
function ChatMessageContent({
    text,
    variant,
}: {
    text: string;
    variant: CallChatPanelVariant;
}) {
    const file = parseFileMessage(text);
    if (file) {
        return <FileMessageCard file={file} variant={variant} />;
    }

    const isWatch = variant === "watch";
    const parts: (string | { type: "url"; url: string })[] = [];
    let lastIndex = 0;
    for (const match of text.matchAll(URL_RE)) {
        const url = match[0];
        const idx = match.index;
        if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
        parts.push({ type: "url", url });
        lastIndex = idx + url.length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));

    return (
        <p
            className={`whitespace-pre-wrap break-words text-sm ${
                isWatch ? "text-zinc-800" : "text-zinc-100"
            }`}
        >
            {parts.map((part, i) =>
                typeof part === "string" ? (
                    <span key={i}>{part}</span>
                ) : (
                    <a
                        key={i}
                        href={part.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`underline break-all ${
                            isWatch
                                ? "text-blue-600 hover:text-blue-700"
                                : "text-blue-400 hover:text-blue-300"
                        }`}
                    >
                        {part.url}
                    </a>
                ),
            )}
        </p>
    );
}

/** List only — avoids re-rendering bubbles while the draft input changes. */
const MeetChatMessageList = memo(function MeetChatMessageList({
    messages,
    localIdentity,
    variant,
}: {
    messages: readonly ChatMsgLike[];
    localIdentity: string;
    variant: CallChatPanelVariant;
}) {
    const { t } = useI18n();

    if (messages.length === 0) {
        if (variant === "watch") {
            return (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                    <div
                        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/90"
                        aria-hidden
                    >
                        <MessageCircle className="h-7 w-7 text-zinc-500" strokeWidth={1.75} />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-zinc-900">{t("meetsChatStartConversation")} 👋</p>
                        <p className="text-xs leading-relaxed text-zinc-500">{t("meetsChatStartHint")}</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10"
                    aria-hidden
                >
                    <MessageCircle className="h-7 w-7 text-zinc-400" strokeWidth={1.75} />
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-zinc-100">{t("meetsChatStartConversation")} 👋</p>
                    <p className="text-xs leading-relaxed text-zinc-500">{t("meetsChatStartHint")}</p>
                </div>
            </div>
        );
    }

    return (
        <>
            {messages.map((msg) => {
                const mine = msg.from?.identity === localIdentity;
                const label =
                    (mine ? t("meetsChatYou") : msg.from?.name) || msg.from?.identity || t("meetsChatAnonymous");
                const time =
                    typeof msg.timestamp === "number"
                        ? new Date(msg.timestamp).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                          })
                        : "";
                // max-w-[95%] keeps long content from spanning the whole
                // panel; min-w-0 lets the inner truncate/break-words actually
                // kick in (without it flex children won't shrink below their
                // intrinsic content width).
                if (variant === "watch") {
                    return (
                        <div
                            key={`${msg.timestamp}-${msg.from?.identity}-${msg.message?.slice(0, 12)}`}
                            className={`min-w-0 max-w-[95%] rounded-xl px-3 py-2 ${
                                mine
                                    ? "ml-2 bg-zinc-50 text-zinc-900 ring-1 ring-zinc-200/80"
                                    : "mr-2 bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/90"
                            }`}
                        >
                            <div className="mb-px flex items-baseline justify-between gap-2 text-[11px] leading-tight text-zinc-500/80">
                                <span className="truncate font-medium opacity-70">{label}</span>
                                {time ? <span className="shrink-0 tabular-nums opacity-70">{time}</span> : null}
                            </div>
                            <div className="mt-1">
                                <ChatMessageContent text={msg.message ?? ""} variant="watch" />
                            </div>
                        </div>
                    );
                }
                return (
                    <div
                        key={`${msg.timestamp}-${msg.from?.identity}-${msg.message?.slice(0, 12)}`}
                        className={`min-w-0 max-w-[95%] rounded-xl px-3 py-2 ${
                            mine
                                ? "ml-2 bg-zinc-700/50 text-zinc-50 ring-1 ring-zinc-600/30"
                                : "mr-2 bg-zinc-800/90 text-zinc-100 ring-1 ring-white/10"
                        }`}
                    >
                        <div className="mb-px flex items-baseline justify-between gap-2 text-[11px] leading-tight text-zinc-400/80">
                            <span className="truncate font-medium opacity-70">{label}</span>
                            {time ? <span className="shrink-0 tabular-nums opacity-70">{time}</span> : null}
                        </div>
                        <div className="mt-1">
                            <ChatMessageContent text={msg.message ?? ""} variant={variant} />
                        </div>
                    </div>
                );
            })}
        </>
    );
});

/** Dark — đồng bộ với vùng video trong cuộc gọi Meet. */
const PANEL_SHELL_MEET =
    "flex max-h-[min(50vh,420px)] min-h-[240px] flex-col rounded-2xl border border-zinc-700/80 bg-[#1f2937] text-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.35)] ring-1 ring-black/20 lg:max-h-none lg:min-h-0 lg:rounded-2xl lg:shadow-[0_12px_40px_rgba(0,0,0,0.4)]";

/** Light card — cùng ngôn ngữ với Speaking / workspace. */
const PANEL_SHELL_WATCH =
    "flex max-h-[min(50vh,420px)] min-h-[240px] flex-col rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-sm lg:max-h-none lg:min-h-0 lg:rounded-2xl";

/** In-meet chat: dark surfaces aligned with call stage; watch: light card */
export const CallChatPanel = memo(function CallChatPanel({
    roomDisplayName,
    className = "",
    variant = "meet",
    onToggle,
}: Props) {
    const { t } = useI18n();
    const { chatMessages, send, isSending } = useChat();
    const { localParticipant } = useLocalParticipant();
    const [draft, setDraft] = useState("");
    const [fileUploading, setFileUploading] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Tracks IME composition (Vietnamese telex/VNI etc.). Enter while
    // composing must NOT submit — the user is still building a glyph.
    const isComposingRef = useRef(false);

    const shell = variant === "watch" ? PANEL_SHELL_WATCH : PANEL_SHELL_MEET;

    useEffect(() => {
        const el = listRef.current;
        if (!el) {
            return;
        }
        el.scrollTop = el.scrollHeight;
    }, [chatMessages.length]);

    // Auto-grow the textarea on every keystroke. We collapse to `auto` first
    // so the new scrollHeight reflects the actual content (otherwise the
    // height ratchets up and never shrinks when the user deletes lines).
    // Capped at ~6 lines (144 px) — beyond that the textarea scrolls
    // internally so the chat panel never grows unbounded.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        const MAX = 144;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, MAX)}px`;
    }, [draft]);

    const submit = useCallback(async () => {
        const text = draft.trim();
        if (!text || isSending) {
            return;
        }
        setDraft("");
        try {
            await send(text);
            const persist = await authFetch("/api/meets/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room: roomDisplayName, message: text }),
            });
            if (!persist.ok && persist.status !== 503) {
                toast.warning(t("meetsChatSaveFailed"));
            }
        }
        catch {
            setDraft(text);
        }
    }, [draft, isSending, roomDisplayName, send, t]);

    const uploadFile = useCallback(async (file: File) => {
        if (fileUploading) return;
        setFileUploading(true);
        try {
            const presignRes = await authFetch("/api/r2/chat-presign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileName: file.name,
                    contentType: file.type || "application/octet-stream",
                    size: file.size,
                }),
            });
            if (!presignRes.ok) {
                const err = await presignRes.json().catch(() => ({}));
                toast.error(err.error || "Upload failed");
                return;
            }
            const { uploadUrl, url } = await presignRes.json();
            const putRes = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type || "application/octet-stream" },
                body: file,
            });
            if (!putRes.ok) {
                toast.error("Upload failed");
                return;
            }
            const msg = `📎 ${file.name}\n${url}\n[${file.size}]`;
            await send(msg);
            void authFetch("/api/meets/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room: roomDisplayName, message: msg }),
            });
        } catch {
            toast.error("Upload failed");
        } finally {
            setFileUploading(false);
        }
    }, [fileUploading, roomDisplayName, send]);

    const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void uploadFile(file);
        e.target.value = "";
    }, [uploadFile]);

    const headerClass =
        variant === "watch"
            ? "shrink-0 border-b border-zinc-200 bg-zinc-50/90 px-4 py-2.5"
            : "shrink-0 border-b border-zinc-600/60 bg-zinc-900/40 px-4 py-3";
    const titleClass = variant === "watch" ? "text-sm font-semibold tracking-tight text-zinc-900" : "text-sm font-semibold tracking-tight text-zinc-50";
    // items-end so the attach + send buttons stay glued to the bottom edge
    // of the textarea while it auto-grows; otherwise flex's default `stretch`
    // pulls them up to fill the form's vertical space.
    const formClass =
        variant === "watch"
            ? "flex shrink-0 items-end gap-2 border-t border-zinc-200 bg-white p-3 sm:p-4"
            : "flex shrink-0 items-end gap-2 border-t border-zinc-600/60 bg-zinc-900/30 p-3 sm:p-4";
    // resize-none turns off the browser's grab-handle (we drive height
    // ourselves). leading-snug + min-h matches the previous single-line
    // input height so the form doesn't pop taller on first paint.
    const inputClass =
        variant === "watch"
            ? "min-h-[40px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-zinc-200 bg-white pl-4 pr-3 py-2 text-sm leading-snug text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
            : "min-h-[40px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-zinc-600/70 bg-zinc-950/80 pl-4 pr-3 py-2 text-sm leading-snug text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-white/15";
    const sendClass =
        variant === "watch"
            ? "shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-45"
            : "shrink-0 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-200 disabled:opacity-45";

    return (
        <div className={`${shell} ${className}`}>
            <div className={headerClass}>
                <div className="flex items-center justify-between">
                    <h2 className={titleClass}>{t("meetsChatTitle")}</h2>
                    {onToggle && (
                        <button
                            type="button"
                            onClick={onToggle}
                            className={`text-[11px] font-medium transition-colors ${
                                variant === "watch"
                                    ? "text-zinc-400 hover:text-zinc-600"
                                    : "text-zinc-500 hover:text-zinc-300"
                            }`}
                        >
                            {t("meetsToggleChatHide")}
                        </button>
                    )}
                </div>
            </div>
            <div
                ref={listRef}
                className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm sm:px-4"
            >
                <MeetChatMessageList
                    messages={chatMessages}
                    localIdentity={localParticipant.identity}
                    variant={variant}
                />
            </div>
            <form
                className={formClass}
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.png,.jpg,.jpeg,.gif,.webp"
                    className="sr-only"
                    onChange={onFileInputChange}
                />
                <button
                    type="button"
                    disabled={fileUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className={`shrink-0 rounded-xl p-2 transition ${
                        variant === "watch"
                            ? "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    } disabled:opacity-40`}
                    title="Attach file"
                >
                    {fileUploading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Paperclip className="h-4 w-4" />}
                </button>
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onCompositionStart={() => {
                        isComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                        isComposingRef.current = false;
                    }}
                    onKeyDown={(e) => {
                        // IME-aware Enter: while a Vietnamese / CJK
                        // composition is in flight (telex, VNI, pinyin…),
                        // Enter commits the composition — never the message.
                        // `isComposing` covers most browsers; Safari leaks
                        // keyCode 229 instead so we check both.
                        if (
                            isComposingRef.current ||
                            e.nativeEvent.isComposing ||
                            e.keyCode === 229
                        ) {
                            return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void submit();
                        }
                    }}
                    placeholder={t("meetsChatPlaceholder")}
                    autoComplete="off"
                    className={inputClass}
                />
                <button
                    type="submit"
                    disabled={isSending || !draft.trim()}
                    className={sendClass}
                >
                    {t("meetsChatSend")}
                </button>
            </form>
        </div>
    );
});
