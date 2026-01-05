"use client";

import { useEffect, useRef, useState } from "react";
import {
  addPracticeAttempt,
  getPracticeRecord,
  saveDraft,
  type SpeakingQuestion,
} from "@/lib/ielts-speaking-storage";
import { ChevronDown, ChevronRight, Mic, Timer, X } from "lucide-react";

const PART2_PREP_SEC = 60;
const PART2_SPEAK_SEC = 120;

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PracticeModal({
  question,
  onClose,
  examMode = false,
}: {
  question: SpeakingQuestion;
  onClose: () => void;
  /** When true: no "Get score" button, no History; score only after whole exam. */
  examMode?: boolean;
}) {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [improveLoading, setImproveLoading] = useState(false);
  const [result, setResult] = useState<{ score: number; feedback: string; improvedAnswer?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ answer: string; score?: number; feedback?: string; improvedAnswer?: string; practicedAt: string }[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

  const isPart2 = question.part === "2";
  const [part2Phase, setPart2Phase] = useState<"prep" | "speaking" | "done" | null>(() => (question.part === "2" ? "prep" : null));
  const [countdownSeconds, setCountdownSeconds] = useState(() => (question.part === "2" ? PART2_PREP_SEC : 0));
  const part2PhaseRef = useRef(part2Phase);
  part2PhaseRef.current = part2Phase;

  useEffect(() => {
    let cancelled = false;
    getPracticeRecord(question.id).then((data) => {
      if (!cancelled) {
        setTranscript(data.draft ?? "");
        setHistory(data.history ?? []);
        setResult(null);
        setError(null);
        setExpandedHistoryId(null);
      }
    });
    return () => { cancelled = true; };
  }, [question.id]);

  useEffect(() => {
    if (part2Phase !== "prep" && part2Phase !== "speaking") return;
    const id = setInterval(() => {
      setCountdownSeconds((s) => {
        if (s <= 1) {
          const p = part2PhaseRef.current;
          if (p === "prep") {
            setPart2Phase("speaking");
            setRecording(true);
            return PART2_SPEAK_SEC;
          }
          setPart2Phase("done");
          setRecording(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [part2Phase]);
  const recognitionRef = useRef<{
    start: () => void;
    stop: () => void;
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: (e: unknown) => void;
    onend: () => void;
  } | null>(null);
  const recordingRef = useRef(false);
  const voiceSessionRef = useRef("");
  const lastResultLengthRef = useRef(0);
  const interimRef = useRef("");
  const [, setVoiceTick] = useState(0);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    interimRef.current = interimTranscript;
  }, [interimTranscript]);

  useEffect(() => {
    if (!recording) return;
    voiceSessionRef.current = "";
    lastResultLengthRef.current = 0;
    setInterimTranscript("");
    interimRef.current = "";
    setError(null);
    const Win = typeof window !== "undefined" ? (window as Window & { webkitSpeechRecognition?: new () => typeof recognitionRef.current; SpeechRecognition?: new () => typeof recognitionRef.current }) : undefined;
    const SpeechRecognition = Win?.webkitSpeechRecognition ?? Win?.SpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice not supported. Use Chrome or Edge.");
      setRecording(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: unknown) => {
      const ev = e as { results: { length: number; [i: number]: { isFinal?: boolean; 0?: { transcript?: string }; item?(i: number): { transcript?: string } } } };
      const results = ev.results;
      if (!results?.length) return;
      let full = "";
      let interim = "";
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        const isFinal = !!item?.isFinal;
        const alt = (item as { 0?: { transcript?: string } })[0] ?? (item as { item?(i: number): { transcript?: string } })?.item?.(0);
        const t = (alt?.transcript ?? "").trim();
        if (!t) continue;
        if (isFinal) full += (full ? " " : "") + t;
        else interim = t;
      }
      const fromResults = full + (interim ? (full ? " " : "") + interim : "");
      if (results.length < lastResultLengthRef.current && fromResults) {
        voiceSessionRef.current += (voiceSessionRef.current ? " " : "") + fromResults;
      } else if (fromResults) {
        voiceSessionRef.current = full + (interim ? " " + interim : "");
      }
      lastResultLengthRef.current = results.length;
      setInterimTranscript(interim);
      interimRef.current = interim;
      setVoiceTick((n) => n + 1);
    };
    recognition.onend = () => {
      if (recordingRef.current) {
        try {
          recognition.start();
        } catch {
          setRecording(false);
        }
      } else {
        const rest = (voiceSessionRef.current + (interimRef.current ? " " + interimRef.current : "")).trim();
        if (rest) {
          setTranscript((prev) => (prev ? `${prev} ${rest}` : rest));
        }
        voiceSessionRef.current = "";
        lastResultLengthRef.current = 0;
        setInterimTranscript("");
        interimRef.current = "";
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError("Could not start microphone.");
      setRecording(false);
    }
    return () => {
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
  }, [recording]);

  async function handleGetScore() {
    const answer = displayTranscript.trim();
    if (!answer) {
      setError("Record or type your answer first.");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ielts-speak-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.text, answer }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not get score.");
        return;
      }
      const score = data.score ?? 0;
      const feedback = data.feedback ?? "";
      let improvedAnswer: string | undefined;
      if (score < 6) {
        setImproveLoading(true);
        try {
          const improveRes = await fetch("/api/ielts-speak-improve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: question.text, answer }),
          });
          const improveData = await improveRes.json();
          if (improveRes.ok && improveData.improvedAnswer) {
            improvedAnswer = improveData.improvedAnswer;
          }
        } catch {
          /* ignore */
        } finally {
          setImproveLoading(false);
        }
      }
      setResult({ score, feedback, improvedAnswer });
      await addPracticeAttempt(question.id, {
        answer,
        score,
        feedback,
        improvedAnswer,
        practicedAt: new Date().toISOString(),
      });
      const next = await getPracticeRecord(question.id);
      setHistory(next.history);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const displayTranscript = transcript + (voiceSessionRef.current ? " " + voiceSessionRef.current : "") + (interimTranscript ? " " + interimTranscript : "");

  async function handleClose() {
    await saveDraft(question.id, displayTranscript.trim());
    onClose();
  }

  const showPart2Prep = isPart2 && part2Phase === "prep";
  const showPart2Speaking = isPart2 && part2Phase === "speaking";
  const showPart2Done = isPart2 && part2Phase === "done";
  const part2AnswerDisabled = isPart2 && part2Phase === "prep";
  const showAnswerForm = true;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => void handleClose()} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {examMode ? "Answer" : "Practice"} {isPart2 ? "(Part 2 – Cue card)" : ""}
          </h3>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Question</p>
        <p className="mt-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {question.text}
        </p>

        {showPart2Prep && (
          <div className="mt-6 rounded-xl border-2 border-amber-200 bg-amber-50/80 p-6 text-center dark:border-amber-800 dark:bg-amber-950/50">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Preparation time</p>
            <p className="mt-2 flex items-center justify-center gap-2 text-3xl font-mono font-bold text-amber-900 dark:text-amber-100">
              <Timer className="h-8 w-8" />
              {formatCountdown(countdownSeconds)}
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">1 minute — then 2 minutes speaking</p>
          </div>
        )}

        {showPart2Speaking && (
          <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50/80 p-4 text-center dark:border-red-800 dark:bg-red-950/50">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Speaking time</p>
            <p className="mt-1 flex items-center justify-center gap-2 text-2xl font-mono font-bold text-red-900 dark:text-red-100">
              <Timer className="h-6 w-6" />
              {formatCountdown(countdownSeconds)}
            </p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">Speak now — recording</p>
          </div>
        )}

        {showPart2Done && (
          <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">Time’s up. Review your answer and get a score below.</p>
        )}

        {showAnswerForm && (
          <>
            <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Your answer (voice or type)</p>
            {part2AnswerDisabled && (
              <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">Available when speaking starts — same as Part 1.</p>
            )}
            <textarea
              placeholder={part2AnswerDisabled ? "Preparation time — type or use mic when speaking starts" : "Click the mic to speak, or type here..."}
              value={displayTranscript}
              onChange={(e) => {
                setTranscript(e.target.value);
                setInterimTranscript("");
                voiceSessionRef.current = "";
              }}
              rows={4}
              disabled={part2AnswerDisabled}
              className="mt-1 w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={part2AnswerDisabled}
                onClick={() => {
                  if (recording) recordingRef.current = false;
                  setRecording((r) => !r);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  recording
                    ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
                title={recording ? "Stop recording" : "Start voice input"}
              >
                <Mic className="h-4 w-4" />
                {recording ? "Stop" : "Voice"}
              </button>
              {!examMode && (
                <button
                  type="button"
                  onClick={handleGetScore}
                  disabled={loading || !displayTranscript.trim() || part2AnswerDisabled}
                  className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {loading ? "Scoring..." : "Get score (AI)"}
                </button>
              )}
            </div>
          </>
        )}
        {!examMode && error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!examMode && result && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Score: {result.score} / 9
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                {result.feedback}
              </p>
            </div>
            {result.score < 6 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  Improvement (target band 6.5–7)
                </p>
                {improveLoading ? (
                  <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">Generating...</p>
                ) : result.improvedAnswer ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-emerald-800 dark:text-emerald-200">
                    {result.improvedAnswer}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {!examMode && history.length > 0 && (
          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">History</p>
            <ul className="mt-2 space-y-2">
              {history.map((attempt, idx) => (
                <li
                  key={attempt.practicedAt + idx}
                  className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedHistoryId(expandedHistoryId === idx ? null : idx)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                  >
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {new Date(attempt.practicedAt).toLocaleString()}
                    </span>
                    {attempt.score != null && (
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        Band {attempt.score}
                      </span>
                    )}
                    {expandedHistoryId === idx ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                    )}
                  </button>
                  {expandedHistoryId === idx && (
                    <div className="border-t border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
                      <p className="font-medium text-zinc-700 dark:text-zinc-300">Your answer</p>
                      <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                        {attempt.answer}
                      </p>
                      {attempt.feedback && (
                        <>
                          <p className="mt-2 font-medium text-zinc-700 dark:text-zinc-300">Feedback</p>
                          <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                            {attempt.feedback}
                          </p>
                        </>
                      )}
                      {attempt.improvedAnswer && (
                        <>
                          <p className="mt-2 font-medium text-emerald-700 dark:text-emerald-300">
                            Improvement (band 6.5–7)
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                            {attempt.improvedAnswer}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
