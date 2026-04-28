"use client";

import { useState } from "react";
import { Loader2, Shuffle } from "lucide-react";

type Role = "teacher" | "student";
type Message = { role: Role; text: string };
type Thread = { messages: Message[] };

type Kind = "pretrial_pair" | "trial" | "session2";

type Subject =
  | "english_general"
  | "english_exam"
  | "math"
  | "biology"
  | "chemistry"
  | "physics"
  | "history"
  | "literature"
  | "computer_science"
  | "economics"
  | "geography"
  | "art_music";

const SUBJECT_OPTIONS: { value: Subject; label: string }[] = [
  { value: "english_general", label: "English — general" },
  { value: "english_exam", label: "English — exam prep (IELTS / TOEFL)" },
  { value: "math", label: "Math" },
  { value: "biology", label: "Biology" },
  { value: "chemistry", label: "Chemistry" },
  { value: "physics", label: "Physics" },
  { value: "history", label: "History" },
  { value: "literature", label: "Literature" },
  { value: "computer_science", label: "Computer Science" },
  { value: "economics", label: "Economics" },
  { value: "geography", label: "Geography" },
  { value: "art_music", label: "Art / Music" },
];

async function fetchThread(kind: Kind, subject: Subject): Promise<Thread> {
  const res = await fetch("/api/preply-chat-pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, subject }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error || "Could not generate chat");
  }
  return (await res.json()) as Thread;
}

function MessageBubble({
  message,
  showLabel,
  isLastInGroup,
}: {
  message: Message;
  showLabel: boolean;
  isLastInGroup: boolean;
}) {
  const isTeacher = message.role === "teacher";
  return (
    <div
      className={`flex w-full flex-col ${isTeacher ? "items-start" : "items-end"}`}
    >
      {showLabel ? (
        <span
          className={`mb-1 px-1 text-[11px] font-medium uppercase tracking-wide ${
            isTeacher
              ? "text-zinc-500 dark:text-zinc-400"
              : "text-blue-600 dark:text-blue-400"
          }`}
        >
          {isTeacher ? "Teacher" : "Student"}
        </span>
      ) : null}
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          isTeacher
            ? "rounded-2xl rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            : "rounded-2xl rounded-br-md bg-blue-600 text-white dark:bg-blue-500"
        } ${!isLastInGroup ? "mb-0.5" : "mb-3"}`}
      >
        {message.text}
      </div>
    </div>
  );
}

function ChatThread({ messages }: { messages: Message[] }) {
  return (
    <div className="space-y-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const showLabel = !prev || prev.role !== msg.role;
        const isLastInGroup = !next || next.role !== msg.role;
        return (
          <MessageBubble
            key={i}
            message={msg}
            showLabel={showLabel}
            isLastInGroup={isLastInGroup}
          />
        );
      })}
    </div>
  );
}

function ThreadSection({
  title,
  thread,
  loading,
  error,
  onShuffle,
  buttonLabel,
  buttonClass,
}: {
  title: string;
  thread: Thread | null;
  loading: boolean;
  error: string | null;
  onShuffle: () => void;
  buttonLabel: string;
  buttonClass: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-center text-base font-semibold text-zinc-700 dark:text-zinc-300">
        {title}
      </h2>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onShuffle}
          disabled={loading}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${buttonClass}`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Shuffle className="h-4 w-4" aria-hidden />
          )}
          {buttonLabel}
        </button>
      </div>
      {error ? (
        <p className="text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-sm italic text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          Generating…
        </div>
      ) : thread ? (
        <ChatThread messages={thread.messages} />
      ) : (
        <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-sm italic text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          Click the button to render…
        </div>
      )}
    </section>
  );
}

function useChatLoader(kind: Kind) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    thread,
    loading,
    error,
    load: async (subject: Subject) => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchThread(kind, subject);
        setThread(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generation failed");
      } finally {
        setLoading(false);
      }
    },
  };
}

export function PreplyChatPairs() {
  const [subject, setSubject] = useState<Subject>("english_general");

  const pretrialPair = useChatLoader("pretrial_pair");
  const trial = useChatLoader("trial");
  const session2 = useChatLoader("session2");

  return (
    <section className="mx-auto w-full max-w-3xl space-y-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <h1 className="text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Preply chat playground
      </h1>

      <div className="mx-auto flex w-full max-w-md flex-col gap-2">
        <label
          htmlFor="preply-chat-subject"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Subject
        </label>
        <select
          id="preply-chat-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value as Subject)}
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-300 dark:focus:ring-zinc-300/20"
        >
          {SUBJECT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <ThreadSection
        title="Pre-trial pair"
        thread={pretrialPair.thread}
        loading={pretrialPair.loading}
        error={pretrialPair.error}
        onShuffle={() => pretrialPair.load(subject)}
        buttonLabel="Generate pre-trial pair"
        buttonClass="bg-zinc-700 hover:bg-zinc-800"
      />

      <ThreadSection
        title="Trial lesson"
        thread={trial.thread}
        loading={trial.loading}
        error={trial.error}
        onShuffle={() => trial.load(subject)}
        buttonLabel="Generate trial lesson chat"
        buttonClass="bg-blue-600 hover:bg-blue-700"
      />

      <ThreadSection
        title="Session 2"
        thread={session2.thread}
        loading={session2.loading}
        error={session2.error}
        onShuffle={() => session2.load(subject)}
        buttonLabel="Generate session 2 chat"
        buttonClass="bg-emerald-600 hover:bg-emerald-700"
      />
    </section>
  );
}
