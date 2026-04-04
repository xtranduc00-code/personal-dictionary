import { AgentSpeakingAvatar } from "@/features/call-ken/components/agent-speaking-avatar";
import { MessageItem } from "@/features/call-ken/components/application/messaging/messaging";
import { Button } from "@/features/call-ken/components/base/buttons/button";
import { ButtonUtility } from "@/features/call-ken/components/base/buttons/button-utility";
import {
  MessageActionTextarea,
  type CallKenAttachmentPreview,
  type MessageActionTextareaHandle,
} from "@/features/call-ken/components/send-message";
import { createAudio, sounds } from "@/features/call-ken/lib/audio";
import {
  extractTextFromPdfFile,
  PDF_TEXT_MAX_CHARS,
} from "@/features/call-ken/lib/extract-pdf-text";
import { convertFileToBase64 } from "@/features/call-ken/lib/utils";
import { playBeep } from "@/lib/beep";
import { buildArticleLessonSessionOverrides } from "@/lib/article-tutor-session-rules";
import {
  buildEngooTutorInstructionPreamble,
  readEngooCallContext,
} from "@/lib/engoo-call-context";
import type { EngooArticlePayload } from "@/lib/engoo-types";
import {
  buildArticleInstructionPreamble,
  getSavedArticle,
} from "@/lib/saved-articles";
import {
  RealtimeAgent,
  RealtimeItem,
  RealtimeSession,
} from "@openai/agents-realtime";
import { Phone, PhoneCall01, PhoneHangUp, X } from "@untitledui/icons";
import { useI18n } from "@/components/i18n-provider";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function AttachmentPreviewPane({
  preview,
  onClose,
  className,
}: {
  preview: NonNullable<CallKenAttachmentPreview>;
  onClose: () => void;
  className?: string;
}) {
  const title =
    preview.kind === "text" && !preview.fileName
      ? "Attachment"
      : (preview.fileName ?? "Attachment");
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${className ?? ""}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <p className="min-w-0 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {title}
        </p>
        <ButtonUtility
          icon={X}
          size="xs"
          color="tertiary"
          onClick={onClose}
          type="button"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {preview.kind === "image" ? (
          <img
            src={preview.src}
            alt=""
            className="mx-auto max-h-[min(70vh,640px)] w-full object-contain p-2"
          />
        ) : preview.kind === "pdf" ? (
          <iframe
            src={preview.src}
            title={preview.fileName}
            className="h-[min(70vh,640px)] min-h-[280px] w-full border-0 bg-zinc-50 dark:bg-zinc-950 lg:h-[calc(100dvh-8rem)] lg:min-h-[400px]"
          />
        ) : (
          <pre className="whitespace-pre-wrap p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
            {preview.text}
          </pre>
        )}
      </div>
    </div>
  );
}
type SavedMessage = {
  id: string;
  text: string;
  me: boolean;
  name: string;
};
type SavedSession = {
  id: string;
  startedAt: string;
  messages: SavedMessage[];
};
type MessageContentPart = {
  type: string;
  transcript?: string | null;
  text?: string;
};
function extractUserMessageText(content: MessageContentPart[]): string {
  return content
    .map((c) => {
      if (c.type === "input_audio" || c.type === "output_audio") {
        return c.transcript ?? "";
      }
      if (c.type === "input_text" || c.type === "output_text") {
        return c.text ?? "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
/** Prefer full model text over audio transcript so the UI does not drop the last sentence/question. */
function extractAssistantMessageText(content: MessageContentPart[]): string {
  const texts: string[] = [];
  const transcripts: string[] = [];
  for (const c of content) {
    if (c.type === "output_text" && typeof c.text === "string") {
      const t = c.text.trim();
      if (t) texts.push(t);
    }
    if (c.type === "output_audio" && typeof c.transcript === "string") {
      const t = c.transcript.trim();
      if (t) transcripts.push(t);
    }
  }
  const joinedText = texts.join("\n").trim();
  const joinedTranscript = transcripts.join("\n").trim();
  if (!joinedTranscript) return joinedText;
  if (!joinedText) return joinedTranscript;
  if (joinedText.length >= joinedTranscript.length) return joinedText;
  const prefix = joinedText.slice(0, Math.min(48, joinedText.length));
  if (prefix && joinedTranscript.startsWith(prefix)) return joinedTranscript;
  return `${joinedText}\n${joinedTranscript}`.trim();
}
function parseSavedSessions(raw: string): SavedSession[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((session): SavedSession | null => {
      if (!session || typeof session !== "object") return null;
      const candidate = session as Partial<SavedSession>;
      const id =
        typeof candidate.id === "string" ? candidate.id : String(Date.now());
      const startedAt =
        typeof candidate.startedAt === "string"
          ? candidate.startedAt
          : new Date().toISOString();
      const messages = Array.isArray(candidate.messages)
        ? candidate.messages
            .map((message): SavedMessage | null => {
              if (!message || typeof message !== "object") return null;
              const msg = message as Partial<SavedMessage>;
              return {
                id:
                  typeof msg.id === "string"
                    ? msg.id
                    : `${id}-${Math.random().toString(36).slice(2)}`,
                text: typeof msg.text === "string" ? msg.text : "",
                me: typeof msg.me === "boolean" ? msg.me : false,
                name: typeof msg.name === "string" ? msg.name : "Agent",
              };
            })
            .filter((message): message is SavedMessage => Boolean(message))
        : [];
      return { id, startedAt, messages };
    })
    .filter((session): session is SavedSession => Boolean(session));
}
type LearningLevel = "band_4_5" | "band_5_6" | "band_7_plus";
type LearningGoal = "fluency" | "vocabulary" | "pronunciation";
type LearningModeId = "casual" | "correction" | "exam" | "networking";
type LearningMode = {
  id: LearningModeId;
  label: string;
  description: string;
  buildInstructions: (opts: {
    level: LearningLevel;
    goal: LearningGoal;
  }) => string;
};
const FRIEND_TONE = `
You're like a supportive friend who's really good at English — warm, natural, and easy to talk to. Use "you" and "we", contractions (I'm, you're, that's), and a conversational tone. React to what they say (e.g. "Oh nice!", "Yeah that makes sense") instead of sounding like a textbook. Keep it in English only. Don't list rules unless they ask; just chat and help.
`;
const LEARNING_MODES: LearningMode[] = [
  {
    id: "casual",
    label: "Casual chat",
    description: "Relaxed conversation to build confidence.",
    buildInstructions: ({ level, goal }) => `
${FRIEND_TONE}

You're chatting in English with a friend who's around ${level} level and wants to work on ${goal}. Keep replies short (2–4 sentences), ask follow-up questions so it feels like a real conversation, and if you notice a small mistake, weave the correction in naturally instead of making a big deal of it.
`,
  },
  {
    id: "correction",
    label: "Error correction",
    description: "Focus on fixing grammar and word choice.",
    buildInstructions: ({ level, goal }) => `
${FRIEND_TONE}

Your friend (around ${level}, goal: ${goal}) wants you to gently correct their English. First respond to what they said like a normal friend, then give a corrected version and a quick note on what to remember — keep it to 1–2 points so it doesn't feel like a lecture.
`,
  },
  {
    id: "exam",
    label: "Exam practice (IELTS style)",
    description: "Interview-style questions with feedback.",
    buildInstructions: ({ level, goal }) => `
${FRIEND_TONE}

You're helping a friend practice IELTS-style speaking (around ${level}, goal: ${goal}). Ask one question at a time like in a real interview, listen to their answer, then give short, encouraging feedback (vocab, fluency, grammar). Sound like a supportive buddy, not a stiff examiner.
`,
  },
  {
    id: "networking",
    label: "Computer networking study",
    description:
      "Study partner for networking — TCP/IP, layers, routing, transport, all in English.",
    buildInstructions: ({ level, goal }) => {
      const depthByLevel: Record<LearningLevel, string> = {
        band_4_5:
          "Introductory — lead with intuition and everyday examples before formal definitions.",
        band_5_6:
          "Intermediate — balance intuition with correct terminology and typical exam-style detail.",
        band_7_plus:
          "Advanced — be rigorous: trade-offs, edge cases, and how mechanisms behave on real networks.",
      };
      const focusByGoal: Record<LearningGoal, string> = {
        fluency:
          "They should practice explaining concepts aloud in their own words; help them structure answers clearly.",
        vocabulary:
          "Stress precise networking terms; define every acronym and technical term on first use.",
        pronunciation:
          "Help them say protocol names and acronyms clearly; offer a natural spoken form when useful.",
      };
      return `
You are a patient study partner for a Computer Networking course.
The session is entirely in English — you and the learner use English only.

Learner depth (adapt explanations accordingly):
${depthByLevel[level]}

Learner focus this session:
${focusByGoal[goal]}

Core syllabus-style topics (use when relevant): layered models (OSI / TCP-IP); physical and link layers; IP addressing and subnetting; routing and switching; ARP; DNS; transport (TCP vs UDP, three-way handshake, sequence numbers and ACKs, sliding window, retransmission after timeout or duplicate ACKs, flow and congestion control at a conceptual level); application protocols (e.g. HTTP, HTTPS, email).

Networking anchors — you must tie abstract ideas to real traffic:
- Examples to cite: web browsing (HTTP/HTTPS), DNS resolution, video streaming and video calls, online games, file transfer (e.g. FTP or large downloads).
- Whenever transport-layer reliability vs speed matters, compare TCP vs UDP explicitly: TCP is connection-oriented and reliable but slower and heavier; UDP is fast with low overhead but best-effort (no delivery guarantee). Classic examples: TCP — HTTP, FTP; UDP — DNS (many queries), real-time voice/video and many games.
- Explain protocols as step-by-step flows (e.g. handshake: SYN → SYN-ACK → ACK). When it helps, describe the sequence in words as if drawing a simple diagram — who sends what, in what order.

Teaching style:
- Simple example or analogy first, then technical precision.
- Compare related concepts (e.g. connection-oriented vs connectionless) when it clarifies a design choice.

Interaction rules:
- Ask questions frequently; after a brief explanation, end with one clear question and wait for their answer before continuing.
- Encourage them to paraphrase definitions; if they are wrong or incomplete, acknowledge what is right, then correct gently and explain why.
- This is a dialogue, not a lecture — avoid long uninterrupted monologues.

Communication style:
- Default to about 3–6 sentences per turn unless they ask for more detail; then you may go deeper in structured chunks.
- Use short bullet points when listing steps or comparing two options (keep each line easy to say aloud).
- Avoid unexplained jargon; introduce terms with a plain-English gloss first.

Accuracy:
- If an answer depends on their course or textbook version, say what you are assuming.
- Do not invent obscure RFC details or numeric parameters; if unsure, admit it and suggest how they could verify.

Goal: Deepen their networking understanding while they practice clear English explanations.

Tone: supportive peer who knows the material — encouraging, never condescending.
`;
    },
  },
];
const SESSIONS_STORAGE_KEY = "realtime-sessions";
const ONBOARDING_STORAGE_KEY = "realtime-onboarding-dismissed";
export function CallKenPage({
  getApiKey,
  initialArticleId = null,
  initialEngooMasterId = null,
  engooPayloadOverride = null,
  layout = "page",
}: {
  getApiKey: () => Promise<{
    apiKey: string;
  }>;
  /** Saved reading (UUID) from localStorage — generic article discussion. */
  initialArticleId?: string | null;
  /** Engoo lesson master_id — load structured lesson from sessionStorage. */
  initialEngooMasterId?: string | null;
  /** In-page lesson: use live payload so tutor matches the article on screen. */
  engooPayloadOverride?: EngooArticlePayload | null;
  /** `embedded` = right panel / sheet on reading page; `page` = standalone route. */
  layout?: "page" | "embedded";
}) {
  const { t } = useI18n();
  const SPEAKING_OFF_DELAY_MS = 1200;
  const [loading, setLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [modeId, setModeId] = useState<LearningModeId>("casual");
  const [level, setLevel] = useState<LearningLevel>("band_5_6");
  const [goal, setGoal] = useState<LearningGoal>("fluency");
  const [speakingSpeed, setSpeakingSpeed] = useState<
    "slow" | "normal" | "fast"
  >("normal");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [attachmentPreview, setAttachmentPreview] =
    useState<CallKenAttachmentPreview>(null);
  const [discussionArticle, setDiscussionArticle] = useState<{
    id: string;
    title: string;
    content: string;
    sourceUrl: string | null;
    sourceLabel: string;
  } | null>(null);
  const [engooArticle, setEngooArticle] = useState<EngooArticlePayload | null>(
    null,
  );
  const messageInputRef = useRef<MessageActionTextareaHandle>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const speakingOffTimerRef = useRef<number | null>(null);
  const clearSpeakingOffTimer = () => {
    if (speakingOffTimerRef.current !== null) {
      window.clearTimeout(speakingOffTimerRef.current);
      speakingOffTimerRef.current = null;
    }
  };
  const markAgentSpeaking = () => {
    clearSpeakingOffTimer();
    setIsAgentSpeaking(true);
  };
  const markAgentSilent = (delayMs = SPEAKING_OFF_DELAY_MS) => {
    clearSpeakingOffTimer();
    speakingOffTimerRef.current = window.setTimeout(() => {
      setIsAgentSpeaking(false);
      speakingOffTimerRef.current = null;
    }, delayMs);
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (raw) {
        const parsed = parseSavedSessions(raw);
        setSavedSessions(parsed);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!dismissed) {
      setShowOnboarding(true);
    }
  }, []);
  useEffect(() => {
    if (engooPayloadOverride) {
      setEngooArticle(engooPayloadOverride);
      return;
    }
    const mid = initialEngooMasterId?.trim();
    if (!mid) {
      setEngooArticle(null);
      return;
    }
    setEngooArticle(readEngooCallContext(mid));
  }, [initialEngooMasterId, engooPayloadOverride]);

  useEffect(() => {
    if (initialEngooMasterId?.trim() || engooPayloadOverride) {
      setDiscussionArticle(null);
      return;
    }
    if (!initialArticleId?.trim()) {
      setDiscussionArticle(null);
      return;
    }
    const saved = getSavedArticle(initialArticleId.trim());
    if (!saved) {
      setDiscussionArticle(null);
      return;
    }
    setDiscussionArticle({
      id: saved.id,
      title: saved.title,
      content: saved.content,
      sourceUrl: saved.sourceUrl,
      sourceLabel: saved.sourceLabel,
    });
  }, [initialArticleId, initialEngooMasterId, engooPayloadOverride]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    return () => {
      try {
        sessionRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);
  useEffect(() => {
    if (!session) {
      clearSpeakingOffTimer();
      setIsAgentSpeaking(false);
    }
  }, [session]);
  useEffect(() => {
    return () => {
      clearSpeakingOffTimer();
    };
  }, []);
  const persistSessions = (sessions: SavedSession[]) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  };
  const isEmbedded = layout === "embedded";
  const outerShellClass = isEmbedded
    ? "flex h-full min-h-0 w-full min-w-0 flex-col bg-zinc-50 dark:bg-zinc-950"
    : "flex w-full min-w-0 flex-1 flex-col justify-start bg-zinc-50 p-2 pb-24 dark:bg-zinc-950 sm:pb-28";
  const innerRowClass = isEmbedded
    ? "flex h-full min-h-0 w-full min-w-0 flex-col"
    : "mx-auto flex w-full min-w-0 max-w-full flex-col gap-4 lg:max-w-6xl lg:flex-row lg:items-stretch lg:gap-5";
  const mainCardClass = isEmbedded
    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 bg-white dark:bg-zinc-900"
    : "flex min-w-0 flex-1 flex-col rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-4";
  const headerAreaClass = isEmbedded
    ? "relative z-10 flex shrink-0 flex-col items-stretch gap-2.5 rounded-lg border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50"
    : "relative z-10 flex flex-col items-center justify-between gap-4 rounded-lg bg-zinc-50 p-4 sm:p-8 dark:bg-zinc-800/50";
  const embeddedStatusText = loading
    ? "Connecting…"
    : session && isAgentSpeaking
      ? "AI is speaking…"
      : session
        ? "Listening…"
        : "Start speaking about this article";
  return (
    <div className={outerShellClass}>
      <div className={innerRowClass}>
        <div className={mainCardClass}>
        <div className={headerAreaClass}>
          {!isEmbedded ? (
            <h1 className="z-10 text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              English Realtime Tutor
            </h1>
          ) : null}

          {!isEmbedded && engooArticle ? (
            <div className="z-10 w-full max-w-lg rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-center text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
              <span className="font-medium">{t("articleDiscussingBanner")}</span>{" "}
              <span className="line-clamp-2">{engooArticle.title}</span>
              <div className="mt-1">
                <Link
                  href={`/news/${encodeURIComponent(engooArticle.masterId)}`}
                  className="underline decoration-emerald-600/50 underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-200"
                >
                  {t("articleDiscussingOpenReading")}
                </Link>
              </div>
            </div>
          ) : !isEmbedded && discussionArticle ? (
            <div className="z-10 w-full max-w-lg rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-center text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
              <span className="font-medium">{t("articleDiscussingBanner")}</span>{" "}
              <span className="line-clamp-2">{discussionArticle.title}</span>
              <div className="mt-1">
                <Link
                  href={`/articles/${discussionArticle.id}`}
                  className="underline decoration-emerald-600/50 underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-200"
                >
                  {t("articleDiscussingOpenReading")}
                </Link>
              </div>
            </div>
          ) : null}

          {isEmbedded ? (
            <div className="flex w-full items-start gap-3">
              <AgentSpeakingAvatar
                size="compact"
                isSpeaking={isAgentSpeaking}
                isCallActive={Boolean(session)}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
                  Your English Tutor
                </p>
                <p
                  className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400"
                  aria-live="polite"
                >
                  {embeddedStatusText}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="z-10 grid w-full grid-cols-2 gap-2 sm:gap-3 text-xs text-zinc-600 dark:text-zinc-400 md:grid-cols-4">
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-[11px] uppercase tracking-wide">
                    Mode
                  </span>
                  <select
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:ring-1 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    value={modeId}
                    onChange={(e) =>
                      setModeId(e.target.value as LearningModeId)
                    }
                  >
                    {LEARNING_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-medium text-[11px] uppercase tracking-wide">
                    {modeId === "networking" ? "Depth" : "Level (IELTS)"}
                  </span>
                  <select
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:ring-1 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    value={level}
                    onChange={(e) => setLevel(e.target.value as LearningLevel)}
                  >
                    {modeId === "networking" ? (
                      <>
                        <option value="band_4_5">Introductory</option>
                        <option value="band_5_6">Intermediate</option>
                        <option value="band_7_plus">Advanced</option>
                      </>
                    ) : (
                      <>
                        <option value="band_4_5">Band 4.0 – 5.0</option>
                        <option value="band_5_6">Band 5.5 – 6.5</option>
                        <option value="band_7_plus">Band 7.0+</option>
                      </>
                    )}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-medium text-[11px] uppercase tracking-wide">
                    {modeId === "networking" ? "Focus" : "Goal"}
                  </span>
                  <select
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:ring-1 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value as LearningGoal)}
                  >
                    {modeId === "networking" ? (
                      <>
                        <option value="fluency">Explain clearly</option>
                        <option value="vocabulary">Terminology</option>
                        <option value="pronunciation">Say terms aloud</option>
                      </>
                    ) : (
                      <>
                        <option value="fluency">Fluency</option>
                        <option value="vocabulary">Vocabulary</option>
                        <option value="pronunciation">Pronunciation</option>
                      </>
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-[11px] uppercase tracking-wide">
                    Speaking speed
                  </span>
                  <select
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:ring-1 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    value={speakingSpeed}
                    onChange={(e) =>
                      setSpeakingSpeed(
                        e.target.value as "slow" | "normal" | "fast",
                      )
                    }
                  >
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </label>
              </div>

              <p className="z-10 mt-1 text-center text-sm text-zinc-600 dark:text-zinc-400 sm:text-xs">
                {LEARNING_MODES.find((m) => m.id === modeId)?.description ??
                  LEARNING_MODES[0].description}
              </p>

              <div className="z-10 mt-1 flex flex-col items-center gap-2">
                <AgentSpeakingAvatar
                  isSpeaking={isAgentSpeaking}
                  isCallActive={Boolean(session)}
                />
              </div>

              {showOnboarding ? (
                <div className="z-10 mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 text-sm text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-400 sm:text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        Quick start
                      </p>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                        <li>
                          {modeId === "networking"
                            ? "Choose mode, depth, and focus."
                            : "Choose mode, IELTS band, and goal."}
                        </li>
                        <li>Press “Start Call” and speak or type.</li>
                        <li>
                          Review past sessions below and use buttons on messages
                          for corrections.
                        </li>
                      </ol>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      onClick={() => {
                        setShowOnboarding(false);
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem(
                            ONBOARDING_STORAGE_KEY,
                            "1",
                          );
                        }
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {session && !loading ? (
            <Button
              color="primary-destructive"
              className={
                isEmbedded
                  ? "z-10 w-auto max-w-full self-start !rounded-lg !bg-red-600 !px-3 !py-1.5 !text-xs !font-semibold !text-white !shadow-none hover:!bg-red-700 dark:!bg-red-600 dark:hover:!bg-red-700"
                  : "z-10 !rounded-xl !bg-red-600 !px-5 !py-3 !text-sm !font-semibold !text-white hover:!bg-red-700 dark:!bg-red-600 dark:hover:!bg-red-700"
              }
              size={isEmbedded ? "sm" : "lg"}
              onClick={() => {
                session.close();
                setSession(null);
                setIsAgentSpeaking(false);
              }}
              iconLeading={<PhoneHangUp data-icon />}
            >
              {isEmbedded ? "End" : "End Call"}
            </Button>
          ) : (
            <Button
              isDisabled={loading}
              size={isEmbedded ? "sm" : "lg"}
              className={
                isEmbedded
                  ? "z-10 w-auto max-w-full self-start !rounded-lg !bg-zinc-900 !px-3 !py-1.5 !text-xs !font-semibold !text-white !shadow-none !transition hover:!bg-zinc-800 disabled:!opacity-50 dark:!bg-zinc-100 dark:!text-zinc-900 dark:hover:!bg-zinc-200"
                  : "z-10 !rounded-xl !bg-zinc-900 !px-5 !py-3 !text-sm !font-semibold !text-white !transition hover:!bg-zinc-800 disabled:!opacity-50 dark:!bg-zinc-100 dark:!text-zinc-900 dark:hover:!bg-zinc-200"
              }
              onClick={async () => {
                const audio = createAudio(sounds.dialing, { loop: true });
                setRuntimeError(null);
                setLoading(true);
                setIsAgentSpeaking(false);
                audio.play();
                try {
                  if (
                    typeof navigator !== "undefined" &&
                    navigator.mediaDevices
                  ) {
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                      });
                      stream.getTracks().forEach((track) => track.stop());
                    } catch {
                      setRuntimeError(
                        isEmbedded
                          ? "Microphone permission is blocked. Voice input will not work."
                          : "Microphone permission is blocked. You can still type, but voice input will not work.",
                      );
                    }
                  }
                  const sessionId =
                    typeof crypto !== "undefined" && "randomUUID" in crypto
                      ? crypto.randomUUID()
                      : String(Date.now());
                  const startedAt = new Date().toISOString();
                  setSavedSessions((prev) => {
                    const next: SavedSession[] = [
                      ...prev,
                      { id: sessionId, startedAt, messages: [] },
                    ];
                    persistSessions(next);
                    return next;
                  });
                  const selectedMode =
                    LEARNING_MODES.find((m) => m.id === modeId) ??
                    LEARNING_MODES[0];
                  const baseInstructions = selectedMode.buildInstructions({
                    level,
                    goal,
                  });
                  const engooPreamble = engooArticle
                    ? buildEngooTutorInstructionPreamble(engooArticle)
                    : "";
                  const articlePreamble =
                    !engooArticle && discussionArticle
                      ? buildArticleInstructionPreamble({
                          title: discussionArticle.title,
                          content: discussionArticle.content,
                          sourceUrl: discussionArticle.sourceUrl,
                          sourceLabel: discussionArticle.sourceLabel,
                        })
                      : "";
                  const articleLessonOverrides =
                    engooArticle || discussionArticle
                      ? buildArticleLessonSessionOverrides()
                      : "";
                  const instructions = `${engooPreamble}${articlePreamble}${baseInstructions}

When speaking aloud:
- Match this speaking speed: ${speakingSpeed}.
- Wait about 1–2 seconds after the user finishes before you start talking.
- ${
                    modeId === "networking"
                      ? "Keep each turn concise by default (about 3–6 sentences unless they ask for more); ask only one question at a time and wait for their answer."
                      : "Keep answers short (1–3 sentences) and ask only one question at a time."
                  }
- If the user starts speaking while you're talking, immediately stop and let them finish.${articleLessonOverrides}`;
                  const agent = new RealtimeAgent({
                    name: "Agent",
                    instructions,
                    tools: [],
                  });
                  // Keep VAD patience separate from TTS speaking speed: short silence_ms + low threshold
                  // makes rustle/noise look like “user spoke” and steals the turn from the assistant.
                  const silenceDurationMs =
                    speakingSpeed === "slow"
                      ? 2600
                      : speakingSpeed === "normal"
                        ? 2100
                        : 1500;
                  void playBeep(880, 90, 0.02);
                  const session = new RealtimeSession(agent, {
                    config: {
                      audio: {
                        input: {
                          turnDetection: {
                            type: "server_vad",
                            createResponse: true,
                            silenceDurationMs,
                            threshold: 0.68,
                            prefixPaddingMs: 400,
                            interruptResponse: false,
                          },
                          transcription: {
                            model: "whisper-1",
                            language: "en",
                            prompt:
                              modeId === "networking"
                                ? "User speaks English; computer networking and IT vocabulary."
                                : engooArticle
                                  ? "User speaks English; structured Engoo Daily News lesson with vocabulary, article, and discussion questions."
                                  : discussionArticle
                                    ? "User speaks English; discussing a reading or news article with the tutor."
                                    : "User speaks English.",
                          },
                        },
                      },
                    },
                  });
                  setSession(session);
                  const sessionAny = session as unknown as {
                    on: (
                      eventName: string,
                      listener: (...args: unknown[]) => void,
                    ) => void;
                  };
                  session.on("error", (event) => {
                    const details =
                      event?.error instanceof Error
                        ? event.error.message
                        : typeof event?.error === "string"
                          ? event.error
                          : JSON.stringify(event?.error ?? event);
                    setRuntimeError(`Realtime error: ${details}`);
                  });
                  session.on("audio_start", () => {
                    markAgentSpeaking();
                  });
                  session.on("audio_stopped", () => {
                    markAgentSilent();
                  });
                  session.on("audio_interrupted", () => {
                    markAgentSilent(0);
                  });
                  session.on("transport_event", (event: unknown) => {
                    if (!event || typeof event !== "object") return;
                    const payload = event as Record<string, unknown>;
                    const type =
                      typeof payload.type === "string" ? payload.type : "";
                    const speakingStartTypes = new Set([
                      "response.output_audio.delta",
                      "response.audio.delta",
                      "output_audio_buffer.started",
                    ]);
                    const speakingStopTypes = new Set([
                      "response.output_audio.done",
                      "response.audio.done",
                      "output_audio_buffer.stopped",
                      "response.cancelled",
                    ]);
                    if (speakingStartTypes.has(type)) {
                      markAgentSpeaking();
                      return;
                    }
                    if (speakingStopTypes.has(type)) {
                      markAgentSilent();
                    }
                  });
                  session.on("history_updated", (event) => {
                    setHistory(event);
                    const messages: SavedMessage[] = event
                      .filter((item) => item.type === "message")
                      .map((item) => {
                        const content = item.content as MessageContentPart[];
                        const extractedText =
                          item.role === "assistant"
                            ? extractAssistantMessageText(content)
                            : extractUserMessageText(content);
                        return {
                          id: item.itemId,
                          text: item.role === "user" ? "" : extractedText,
                          me: item.role === "user",
                          name: item.role === "user" ? "You" : "Agent",
                        };
                      });
                    setSavedSessions((prev) => {
                      const next = [...prev];
                      const idx = next.findIndex((s) => s.id === sessionId);
                      if (idx === -1) return prev;
                      next[idx] = { ...next[idx], messages };
                      persistSessions(next);
                      return next;
                    });
                  });
                  await session.connect({
                    apiKey: (await getApiKey()).apiKey,
                  });
                  createAudio(sounds.connected, { volume: 0.7 }).play();
                } catch (error) {
                  setRuntimeError(
                    error instanceof Error
                      ? error.message
                      : "Could not start the realtime session.",
                  );
                  markAgentSilent(0);
                } finally {
                  setLoading(false);
                  audio.stop();
                }
              }}
              iconLeading={
                loading ? <PhoneCall01 data-icon /> : <Phone data-icon />
              }
            >
              {loading
                ? isEmbedded
                  ? "Connecting…"
                  : "Calling..."
                : isEmbedded
                  ? "Start speaking"
                  : "Start Call"}
            </Button>
          )}

          {runtimeError && (
            <p className="z-10 text-xs text-red-600 dark:text-red-400">
              {runtimeError}
            </p>
          )}
        </div>

        {!isEmbedded && attachmentPreview ? (
          <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700 lg:hidden">
            <AttachmentPreviewPane
              preview={attachmentPreview}
              onClose={() => messageInputRef.current?.clearAttachment()}
              className="max-h-[min(48vh,440px)]"
            />
          </div>
        ) : null}

        <ol
          className={
            isEmbedded
              ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3 md:px-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800"
              : "flex flex-col gap-4 px-4 py-4 md:px-6 md:py-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800"
          }
        >
          {isEmbedded &&
          !(session?.history ?? []).some((item) => item.type === "message") ? (
            <li className="list-none rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
              Conversation transcript will appear here as you speak with the
              tutor.
            </li>
          ) : null}
          {session?.history.map((item) => {
            if (item.type === "message") {
              const content = item.content as MessageContentPart[];
              const extractedText =
                item.role === "assistant"
                  ? extractAssistantMessageText(content)
                  : extractUserMessageText(content);
              const text = item.role === "user" ? "" : extractedText;
              return (
                <MessageItem
                  key={item.itemId}
                  msg={{
                    id: item.itemId,
                    text,
                    user: {
                      me: item.role === "user",
                      name: item.role === "user" ? "You" : "Agent",
                    },
                  }}
                  onCorrect={
                    item.role === "user" && session
                      ? () => {
                          session.sendMessage({
                            role: "user",
                            type: "message",
                            content: [
                              {
                                type: "input_text",
                                text: `Please correct my sentence and explain briefly: "${extractedText}".`,
                              },
                            ],
                          });
                        }
                      : undefined
                  }
                  onSimplify={
                    item.role !== "user" && session
                      ? () => {
                          session.sendMessage({
                            role: "user",
                            type: "message",
                            content: [
                              {
                                type: "input_text",
                                text: `Please rewrite your last answer in simpler English suitable for a learner around ${level} IELTS speaking band.`,
                              },
                            ],
                          });
                        }
                      : undefined
                  }
                />
              );
            } else {
              return (
                <div
                  key={item.itemId}
                  className="rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs p-2 overflow-x-scroll text-zinc-900 dark:text-zinc-100"
                >
                  <pre>{JSON.stringify(item, null, 2)}</pre>
                </div>
              );
            }
          })}
        </ol>

        {!isEmbedded && savedSessions.length > 0 && (
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <h2 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Past sessions
            </h2>

            <div className="flex max-h-60 flex-col gap-2 overflow-y-auto text-xs">
              {[...savedSessions]
                .slice()
                .reverse()
                .map((savedSession) => (
                  <details
                    key={savedSession.id}
                    className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2"
                  >
                    <summary className="cursor-pointer text-zinc-600 dark:text-zinc-300">
                      {new Date(savedSession.startedAt).toLocaleString()} ·{" "}
                      {savedSession.messages.length} messages
                    </summary>

                    {savedSession.messages.length > 0 && (
                      <ol className="mt-2 flex flex-col gap-2">
                        {savedSession.messages.map((msg) => (
                          <MessageItem
                            key={msg.id}
                            msg={{
                              id: msg.id,
                              text: msg.text,
                              user: {
                                me: msg.me,
                                name: msg.name,
                              },
                            }}
                          />
                        ))}
                      </ol>
                    )}
                  </details>
                ))}
            </div>
          </div>
        )}

        {!isEmbedded ? (
        <MessageActionTextarea
          ref={messageInputRef}
          onAttachmentPreviewChange={setAttachmentPreview}
          onSubmit={async (message, file) => {
            if (!session) return;
            if (message.trim()) {
              session.sendMessage({
                role: "user",
                type: "message",
                content: [{ type: "input_text", text: message }],
              });
            }
            if (file) {
              if (file.type.startsWith("image/")) {
                session.sendMessage({
                  role: "user",
                  type: "message",
                  content: [
                    {
                      type: "input_image",
                      image: await convertFileToBase64(file),
                    },
                  ],
                });
              } else if (
                file.type.startsWith("text/") ||
                file.type === "application/json" ||
                /\.(txt|csv|md|json)$/i.test(file.name)
              ) {
                const text = await file.text();
                session.sendMessage({
                  role: "user",
                  type: "message",
                  content: [
                    {
                      type: "input_text",
                      text: `Here is my vocabulary or notes:\n\n${text}`,
                    },
                  ],
                });
              } else if (
                file.type === "application/pdf" ||
                file.name.toLowerCase().endsWith(".pdf")
              ) {
                setRuntimeError(null);
                try {
                  const {
                    text,
                    truncated,
                    pagesIncluded,
                    totalPages,
                  } = await extractTextFromPdfFile(file);
                  const meaningful = text
                    .replace(/^--- Page \d+ ---\s*/gm, "")
                    .trim();
                  if (!meaningful) {
                    session.sendMessage({
                      role: "user",
                      type: "message",
                      content: [
                        {
                          type: "input_text",
                          text: `[PDF "${file.name}" — no selectable text was extracted (often scanned/image-only pages). Describe what you want to practice, or paste text from the document.]`,
                        },
                      ],
                    });
                  } else {
                    const metaParts = [
                      `${totalPages} page(s)`,
                      ...(pagesIncluded < totalPages || truncated
                        ? [`text from ${pagesIncluded} page(s) included`]
                        : []),
                      ...(truncated
                        ? [`truncated to ~${PDF_TEXT_MAX_CHARS} characters`]
                        : []),
                    ];
                    const head = `The following is text extracted from PDF "${file.name}" (${metaParts.join("; ")}):\n\n`;
                    session.sendMessage({
                      role: "user",
                      type: "message",
                      content: [{ type: "input_text", text: head + text }],
                    });
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  setRuntimeError(
                    `Could not read this PDF. It may be password-protected or corrupted. (${msg})`,
                  );
                }
              }
            }
          }}
        />
        ) : null}
        </div>

        {!isEmbedded && attachmentPreview ? (
          <aside className="hidden min-h-0 w-full shrink-0 lg:flex lg:w-[min(42vw,520px)] lg:min-w-[280px] lg:max-w-[520px] lg:flex-col lg:self-start">
            <AttachmentPreviewPane
              preview={attachmentPreview}
              onClose={() => messageInputRef.current?.clearAttachment()}
              className="sticky top-4 max-h-[calc(100dvh-5rem)] min-h-[320px] flex-1"
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
