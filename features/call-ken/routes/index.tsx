import { useEffect, useRef, useState } from "react";
import { Button } from "@/features/call-ken/components/base/buttons/button";
import { Phone, PhoneCall01, PhoneHangUp } from "@untitledui/icons";
import { createAudio, sounds } from "@/features/call-ken/lib/audio";
import { RealtimeAgent, RealtimeItem, RealtimeSession, tool, } from "@openai/agents-realtime";
import { MessageItem } from "@/features/call-ken/components/application/messaging/messaging";
import { AgentSpeakingAvatar } from "@/features/call-ken/components/agent-speaking-avatar";
import { MessageActionTextarea } from "@/features/call-ken/components/send-message";
import { convertFileToBase64 } from "@/features/call-ken/lib/utils";
import { playBeep } from "@/lib/beep";
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
            if (t)
                texts.push(t);
        }
        if (c.type === "output_audio" && typeof c.transcript === "string") {
            const t = c.transcript.trim();
            if (t)
                transcripts.push(t);
        }
    }
    const joinedText = texts.join("\n").trim();
    const joinedTranscript = transcripts.join("\n").trim();
    if (!joinedTranscript)
        return joinedText;
    if (!joinedText)
        return joinedTranscript;
    if (joinedText.length >= joinedTranscript.length)
        return joinedText;
    const prefix = joinedText.slice(0, Math.min(48, joinedText.length));
    if (prefix && joinedTranscript.startsWith(prefix))
        return joinedTranscript;
    return `${joinedText}\n${joinedTranscript}`.trim();
}
function parseSavedSessions(raw: string): SavedSession[] {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed))
        return [];
    return parsed
        .map((session): SavedSession | null => {
        if (!session || typeof session !== "object")
            return null;
        const candidate = session as Partial<SavedSession>;
        const id = typeof candidate.id === "string" ? candidate.id : String(Date.now());
        const startedAt = typeof candidate.startedAt === "string"
            ? candidate.startedAt
            : new Date().toISOString();
        const messages = Array.isArray(candidate.messages)
            ? candidate.messages
                .map((message): SavedMessage | null => {
                if (!message || typeof message !== "object")
                    return null;
                const msg = message as Partial<SavedMessage>;
                return {
                    id: typeof msg.id === "string"
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
type LearningModeId = "casual" | "correction" | "exam";
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
];
const SESSIONS_STORAGE_KEY = "realtime-sessions";
const ONBOARDING_STORAGE_KEY = "realtime-onboarding-dismissed";
export function CallKenPage({ getApiKey, }: {
    getApiKey: () => Promise<{
        apiKey: string;
    }>;
}) {
    const SPEAKING_OFF_DELAY_MS = 1200;
    const [loading, setLoading] = useState(false);
    const [runtimeError, setRuntimeError] = useState<string | null>(null);
    const [session, setSession] = useState<RealtimeSession | null>(null);
    const [history, setHistory] = useState<RealtimeItem[]>([]);
    const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
    const [modeId, setModeId] = useState<LearningModeId>("casual");
    const [level, setLevel] = useState<LearningLevel>("band_5_6");
    const [goal, setGoal] = useState<LearningGoal>("fluency");
    const [speakingSpeed, setSpeakingSpeed] = useState<"slow" | "normal" | "fast">("normal");
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
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
        if (typeof window === "undefined")
            return;
        try {
            const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
            if (raw) {
                const parsed = parseSavedSessions(raw);
                setSavedSessions(parsed);
            }
        }
        catch {
        }
    }, []);
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        const dismissed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!dismissed) {
            setShowOnboarding(true);
        }
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
        if (typeof window === "undefined")
            return;
        window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    };
    return (<div className="p-2 min-h-full pb-20 sm:pb-24 flex items-center justify-center w-full bg-zinc-50 dark:bg-zinc-950">
      <div className="p-3 sm:p-4 rounded-2xl border border-zinc-200 shadow-sm mx-auto max-w-full w-full sm:w-xl bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative flex justify-between flex-col rounded-lg p-4 sm:p-8 items-center gap-4 bg-zinc-50 dark:bg-zinc-800/50">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 z-10 text-center">
            English Realtime Tutor
          </h1>

          <div className="z-10 grid w-full grid-cols-2 gap-2 sm:gap-3 text-xs text-zinc-600 dark:text-zinc-400 md:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-[11px] uppercase tracking-wide">
                Mode
              </span>
              <select className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:ring-1 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-600" value={modeId} onChange={(e) => setModeId(e.target.value as LearningModeId)}>
                {LEARNING_MODES.map((mode) => (<option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-[11px] uppercase tracking-wide">
                Level (IELTS)
              </span>
              <select className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:ring-1 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-600" value={level} onChange={(e) => setLevel(e.target.value as LearningLevel)}>
                <option value="band_4_5">Band 4.0 – 5.0</option>
                <option value="band_5_6">Band 5.5 – 6.5</option>
                <option value="band_7_plus">Band 7.0+</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-[11px] uppercase tracking-wide">
                Goal
              </span>
              <select className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:ring-1 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-600" value={goal} onChange={(e) => setGoal(e.target.value as LearningGoal)}>
                <option value="fluency">Fluency</option>
                <option value="vocabulary">Vocabulary</option>
                <option value="pronunciation">Pronunciation</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-[11px] uppercase tracking-wide">
                Speaking speed
              </span>
              <select className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:ring-1 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-600" value={speakingSpeed} onChange={(e) => setSpeakingSpeed(e.target.value as "slow" | "normal" | "fast")}>
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            </label>
          </div>

          <p className="z-10 mt-1 text-sm sm:text-xs text-zinc-600 dark:text-zinc-400 text-center">
            {LEARNING_MODES.find((m) => m.id === modeId)?.description ??
            LEARNING_MODES[0].description}
          </p>

          <div className="z-10 mt-1 flex flex-col items-center gap-2">
            <AgentSpeakingAvatar isSpeaking={isAgentSpeaking} isCallActive={Boolean(session)}/>
          </div>

          {showOnboarding && (<div className="z-10 mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 text-sm sm:text-xs text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-400">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    Quick start
                  </p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                    <li>Choose mode, IELTS band, and goal.</li>
                    <li>Press “Start Call” and speak or type.</li>
                    <li>
                      Review past sessions below and use buttons on messages for
                      corrections.
                    </li>
                  </ol>
                </div>
                <button type="button" className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200" onClick={() => {
                setShowOnboarding(false);
                if (typeof window !== "undefined") {
                    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
                }
            }}>
                  Dismiss
                </button>
              </div>
            </div>)}

          {session && !loading ? (<Button color="primary-destructive" className="z-10 !rounded-xl !bg-red-600 !px-5 !py-3 !text-sm !font-semibold !text-white hover:!bg-red-700 dark:!bg-red-600 dark:hover:!bg-red-700" size="lg" onClick={() => {
                session.close();
                setSession(null);
                setIsAgentSpeaking(false);
            }} iconLeading={<PhoneHangUp data-icon/>}>
              End Call
            </Button>) : (<Button isDisabled={loading} size="lg" className="z-10 !rounded-xl !bg-zinc-900 !px-5 !py-3 !text-sm !font-semibold !text-white !transition hover:!bg-zinc-800 disabled:!opacity-50 dark:!bg-zinc-100 dark:!text-zinc-900 dark:hover:!bg-zinc-200" onClick={async () => {
                const audio = createAudio(sounds.dialing, { loop: true });
                setRuntimeError(null);
                setLoading(true);
                setIsAgentSpeaking(false);
                audio.play();
                try {
                    if (typeof navigator !== "undefined" &&
                        navigator.mediaDevices) {
                        try {
                            const stream = await navigator.mediaDevices.getUserMedia({
                                audio: true,
                            });
                            stream.getTracks().forEach((track) => track.stop());
                        }
                        catch {
                            setRuntimeError("Microphone permission is blocked. You can still type, but voice input will not work.");
                        }
                    }
                    const sessionId = typeof crypto !== "undefined" && "randomUUID" in crypto
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
                    const selectedMode = LEARNING_MODES.find((m) => m.id === modeId) ??
                        LEARNING_MODES[0];
                    const baseInstructions = selectedMode.buildInstructions({
                        level,
                        goal,
                    });
                    const instructions = `${baseInstructions}

When speaking aloud:
- Match this speaking speed: ${speakingSpeed}.
- Wait about 1–2 seconds after the user finishes before you start talking.
- Keep answers short (1–3 sentences) and ask only one question at a time.
- If the user starts speaking while you're talking, immediately stop and let them finish.`;
                    const agent = new RealtimeAgent({
                        name: "Agent",
                        instructions,
                        tools: [
                            tool({
                                name: "Test Tool",
                                description: "This is a test tool. Use this at the start of a conversation to test the tool.",
                                execute: async () => { },
                                parameters: {
                                    type: "object",
                                    properties: {},
                                    required: [],
                                    additionalProperties: true,
                                },
                                strict: false,
                            }),
                        ],
                    });
                    // Keep VAD patience separate from TTS speaking speed: short silence_ms + low threshold
                    // makes rustle/noise look like “user spoke” and steals the turn from the assistant.
                    const silenceDurationMs = speakingSpeed === "slow"
                        ? 2200
                        : speakingSpeed === "normal"
                            ? 1700
                            : 1300;
                    void playBeep(880, 90, 0.02);
                    const session = new RealtimeSession(agent, {
                        config: {
                            audio: {
                                input: {
                                    turnDetection: {
                                        type: "server_vad",
                                        createResponse: true,
                                        silenceDurationMs,
                                        threshold: 0.62,
                                        prefixPaddingMs: 350,
                                    },
                                    transcription: {
                                        model: "whisper-1",
                                        language: "en",
                                        prompt: "User speaks English.",
                                    },
                                },
                            },
                        },
                    });
                    setSession(session);
                    const sessionAny = session as unknown as {
                        on: (eventName: string, listener: (...args: unknown[]) => void) => void;
                    };
                    session.on("error", (event) => {
                        const details = event?.error instanceof Error
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
                        if (!event || typeof event !== "object")
                            return;
                        const payload = event as Record<string, unknown>;
                        const type = typeof payload.type === "string" ? payload.type : "";
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
                            const extractedText = item.role === "assistant"
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
                            if (idx === -1)
                                return prev;
                            next[idx] = { ...next[idx], messages };
                            persistSessions(next);
                            return next;
                        });
                    });
                    await session.connect({
                        apiKey: (await getApiKey()).apiKey,
                    });
                    createAudio(sounds.connected, { volume: 0.7 }).play();
                }
                catch (error) {
                    setRuntimeError(error instanceof Error
                        ? error.message
                        : "Could not start the realtime session.");
                    markAgentSilent(0);
                }
                finally {
                    setLoading(false);
                    audio.stop();
                }
            }} iconLeading={loading ? <PhoneCall01 data-icon/> : <Phone data-icon/>}>
              {loading ? "Calling..." : "Start Call"}
            </Button>)}

          {runtimeError && (<p className="z-10 text-xs text-red-600 dark:text-red-400">
              {runtimeError}
            </p>)}
        </div>

        
        <ol className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-6 md:px-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800">
          {session?.history.map((item) => {
            if (item.type === "message") {
                const content = item.content as MessageContentPart[];
                const extractedText = item.role === "assistant"
                    ? extractAssistantMessageText(content)
                    : extractUserMessageText(content);
                const text = item.role === "user" ? "" : extractedText;
                return (<MessageItem key={item.itemId} msg={{
                        id: item.itemId,
                        text,
                        user: {
                            me: item.role === "user",
                            name: item.role === "user" ? "You" : "Agent",
                        },
                    }} onCorrect={item.role === "user" && session
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
                        : undefined} onSimplify={item.role !== "user" && session
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
                        : undefined}/>);
            }
            else {
                return (<div key={item.itemId} className="rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs p-2 overflow-x-scroll text-zinc-900 dark:text-zinc-100">
                  <pre>{JSON.stringify(item, null, 2)}</pre>
                </div>);
            }
        })}
        </ol>

        {session && session.history.length > 0 && (<div className="px-4">
            <Button size="sm" color="secondary" className="!rounded-xl !border-zinc-300 !bg-zinc-50 !text-zinc-700 hover:!bg-zinc-100 dark:!border-zinc-600 dark:!bg-zinc-800 dark:!text-zinc-200 dark:hover:!bg-zinc-700" onClick={() => {
                if (!session)
                    return;
                session.sendMessage({
                    role: "user",
                    type: "message",
                    content: [
                        {
                            type: "input_text",
                            text: `Before we finish, please give me a brief end-of-session summary: 1) 3 main topics we discussed, 2) 3–5 common mistakes I made, 3) what I should practice next time. Keep it under 6 sentences.`,
                        },
                    ],
                });
            }}>
              Summarize this session
            </Button>
          </div>)}

        {savedSessions.length > 0 && (<div className="mt-4 border-t border-zinc-200 dark:border-zinc-700 pt-4">
            <h2 className="text-sm font-medium mb-2 text-zinc-900 dark:text-zinc-100">
              Past sessions
            </h2>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto text-xs">
              {[...savedSessions]
                .slice()
                .reverse()
                .map((savedSession) => (<details key={savedSession.id} className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2">
                    <summary className="cursor-pointer text-zinc-600 dark:text-zinc-300">
                      {new Date(savedSession.startedAt).toLocaleString()} ·{" "}
                      {savedSession.messages.length} messages
                    </summary>

                    {savedSession.messages.length > 0 && (<ol className="mt-2 flex flex-col gap-2">
                        {savedSession.messages.map((msg) => (<MessageItem key={msg.id} msg={{
                            id: msg.id,
                            text: msg.text,
                            user: {
                                me: msg.me,
                                name: msg.name,
                            },
                        }}/>))}
                      </ol>)}
                  </details>))}
            </div>
          </div>)}

        
        <MessageActionTextarea onSubmit={async (message, file) => {
            if (!session)
                return;
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
                }
                else if (file.type.startsWith("text/") ||
                    file.type === "application/json" ||
                    /\.(txt|csv|md|json)$/i.test(file.name)) {
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
                }
            }
        }}/>
      </div>
    </div>);
}
