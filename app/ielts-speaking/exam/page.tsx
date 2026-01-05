"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { addPracticeAttempt, getAllQuestionsByPart, getPracticeRecord, type SpeakingPart, type SpeakingQuestionWithTopic } from "@/lib/ielts-speaking-storage";
import { PracticeModal } from "@/components/ielts-speaking/practice-modal";
import { ArrowLeft, FileText, Mic, Shuffle, Timer, X } from "lucide-react";

const PARTS: { id: SpeakingPart; label: string }[] = [
  { id: "1", label: "Part 1" },
  { id: "2", label: "Part 2" },
  { id: "3", label: "Part 3" },
];

/** Shuffle and take up to `count` items. */
function randomPick<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

type GeneratedExam = {
  part1: SpeakingQuestionWithTopic[];
  part2: SpeakingQuestionWithTopic[];
  part3: SpeakingQuestionWithTopic[];
};

export default function IeltsExamPage() {
  const [part1, setPart1] = useState<SpeakingQuestionWithTopic[]>([]);
  const [part2, setPart2] = useState<SpeakingQuestionWithTopic[]>([]);
  const [part3, setPart3] = useState<SpeakingQuestionWithTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [practiceQuestion, setPracticeQuestion] = useState<SpeakingQuestionWithTopic | null>(null);
  const [examPopupOpen, setExamPopupOpen] = useState(false);
  const [generatedExam, setGeneratedExam] = useState<GeneratedExam | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewScores, setReviewScores] = useState<Record<string, { score?: number; feedback?: string; answer?: string }>>({});
  const [reviewLoading, setReviewLoading] = useState(false);

  function generateMockExam(): GeneratedExam {
    // Real IELTS: Part 1 ~4–6 questions, Part 2 one cue card, Part 3 ~4–6 follow-ups
    return {
      part1: randomPick(part1, 6),
      part2: randomPick(part2, 1),
      part3: randomPick(part3, 6),
    };
  }

  function openExamPopup() {
    setGeneratedExam(generateMockExam());
    setExamPopupOpen(true);
    setReviewOpen(false);
    setReviewScores({});
  }

  const openPractice = useCallback((q: SpeakingQuestionWithTopic) => {
    setPracticeQuestion(q);
  }, []);

  async function openReviewAndScore() {
    if (!generatedExam) return;
    setReviewLoading(true);
    setReviewOpen(true);
    const allQuestions: SpeakingQuestionWithTopic[] = [
      ...generatedExam.part1,
      ...generatedExam.part2,
      ...generatedExam.part3,
    ];
    const next: Record<string, { score?: number; feedback?: string; answer?: string }> = {};
    for (const q of allQuestions) {
      try {
        const data = await getPracticeRecord(q.id);
        const answer = (data.draft ?? "").trim();
        if (answer) {
          const res = await fetch("/api/ielts-speak-score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: q.text, answer }),
          });
          const result = await res.json();
          if (res.ok && result != null) {
            const score = result.score ?? 0;
            const feedback = result.feedback ?? "";
            await addPracticeAttempt(q.id, {
              answer,
              score,
              feedback,
              improvedAnswer: result.improvedAnswer,
              practicedAt: new Date().toISOString(),
            });
            next[q.id] = { score, feedback, answer };
          }
        }
      } catch {
        /* skip */
      }
    }
    for (const q of allQuestions) {
      if (next[q.id]) continue;
      try {
        const data = await getPracticeRecord(q.id);
        const last = data.history?.[data.history.length - 1];
        if (last) next[q.id] = { score: last.score, feedback: last.feedback, answer: last.answer };
      } catch {
        /* skip */
      }
    }
    setReviewScores(next);
    setReviewLoading(false);
  }

  async function refresh() {
    setLoading(true);
    try {
      const data = await getAllQuestionsByPart();
      setPart1(data.part1);
      setPart2(data.part2);
      setPart3(data.part3);
    } catch {
      setPart1([]);
      setPart2([]);
      setPart3([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const total = part1.length + part2.length + part3.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {practiceQuestion && (
        <PracticeModal
          question={practiceQuestion}
          onClose={() => setPracticeQuestion(null)}
          examMode={examPopupOpen}
        />
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/ielts-speaking"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Topics
        </Link>
        <div className="flex items-center gap-2">
          <Mic className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Exam
          </h1>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Questions from all your topics, grouped by part. Click a question to practice (voice + AI score).
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : total === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
          No questions yet. Add topics and questions in Topics first.
        </p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {PARTS.map(({ id, label }) => {
              const questions = id === "1" ? part1 : id === "2" ? part2 : part3;
              return (
                <section
                  key={id}
                  className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {label}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {questions.length} question{questions.length !== 1 ? "s" : ""}
                  </p>

                  <ul className="mt-3 space-y-2">
                    {questions.length === 0 ? (
                      <li className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                        No questions in this part yet.
                      </li>
                    ) : (
                      questions.map((q) => (
                        <li
                          key={q.id}
                          className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <button
                            type="button"
                            onClick={() => setPracticeQuestion(q)}
                            className="min-w-0 flex-1 cursor-pointer rounded-lg text-left text-sm leading-relaxed text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                          >
                            {q.text}
                          </button>
                          {q.topicName ? (
                            <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {q.topicName}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setPracticeQuestion(q)}
                            className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                            title="Practice (voice + AI score)"
                            aria-label="Practice"
                          >
                            <Mic className="h-4 w-4" />
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={openExamPopup}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Shuffle className="h-5 w-5" />
              Render mock exam
            </button>
          </div>
        </>
      )}

      {examPopupOpen && generatedExam && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setExamPopupOpen(false)}
            aria-hidden
          />
          <div
            className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                IELTS Speaking – Mock exam
              </h3>
              <button
                type="button"
                onClick={() => setExamPopupOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Random questions from your topics. Click a question to practice. Part 2 has a 1‑min prep + 2‑min speaking countdown; then get an AI score.
            </p>

            <div className="mt-6 space-y-6">
              <div>
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Part 1</h4>
                <ul className="mt-2 space-y-2">
                  {generatedExam.part1.length === 0 ? (
                    <li className="text-sm text-zinc-500 dark:text-zinc-400">No Part 1 questions in pool.</li>
                  ) : (
                    generatedExam.part1.map((q, i) => (
                      <li key={q.id} className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <span className="shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">{i + 1}.</span>
                        <button
                          type="button"
                          onClick={() => openPractice(q)}
                          className="min-w-0 flex-1 cursor-pointer text-left text-sm text-zinc-800 hover:underline dark:text-zinc-200"
                        >
                          {q.text}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openPractice(q); }}
                          className="shrink-0 cursor-pointer rounded p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                          aria-label="Practice"
                        >
                          <Mic className="h-4 w-4" />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Part 2 (Cue card)</h4>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">1 min preparation + 2 min speaking</p>
                {generatedExam.part2.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No Part 2 questions in pool.</p>
                ) : (
                  <>
                    {generatedExam.part2.map((q) => (
                      <div key={q.id} className="mt-2 space-y-2">
                        <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                          <button
                            type="button"
                            onClick={() => openPractice(q)}
                            className="min-w-0 flex-1 cursor-pointer text-left text-sm text-zinc-800 hover:underline dark:text-zinc-200"
                          >
                            {q.text}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openPractice(q); }}
                            className="shrink-0 cursor-pointer rounded p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                            aria-label="Practice"
                          >
                            <Mic className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openPractice(q); }}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/50"
                        >
                          <Timer className="h-4 w-4" />
                          Start Part 2 timer (1 min prep + 2 min speak)
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div>
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Part 3</h4>
                <ul className="mt-2 space-y-2">
                  {generatedExam.part3.length === 0 ? (
                    <li className="text-sm text-zinc-500 dark:text-zinc-400">No Part 3 questions in pool.</li>
                  ) : (
                    generatedExam.part3.map((q, i) => (
                      <li key={q.id} className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <span className="shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">{i + 1}.</span>
                        <button
                          type="button"
                          onClick={() => openPractice(q)}
                          className="min-w-0 flex-1 cursor-pointer text-left text-sm text-zinc-800 hover:underline dark:text-zinc-200"
                        >
                          {q.text}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openPractice(q); }}
                          className="shrink-0 cursor-pointer rounded p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                          aria-label="Practice"
                        >
                          <Mic className="h-4 w-4" />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void openReviewAndScore()}
                disabled={reviewLoading}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <FileText className="h-4 w-4" />
                {reviewLoading ? "Loading..." : "Review & overall score"}
              </button>
              <button
                type="button"
                onClick={() => setExamPopupOpen(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                Close
              </button>
            </div>

            {reviewOpen && (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/80">
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Review & scores</h4>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Latest practice score per question</p>
                {(() => {
                  const scores = [
                    ...generatedExam.part1,
                    ...generatedExam.part2,
                    ...generatedExam.part3,
                  ].map((q) => reviewScores[q.id]?.score).filter((s): s is number => s != null && typeof s === "number");
                  const overall = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
                  return (
                    <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Overall: {overall != null ? `Band ${overall}` : "Not scored yet"}
                    </p>
                  );
                })()}
                <h5 className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">History (question + score + your answer)</h5>
                <ul className="mt-3 space-y-4">
                  {generatedExam.part1.map((q, i) => (
                    <li key={q.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800/50">
                      <p className="text-sm">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Part 1 · {i + 1}.</span>{" "}
                        <span className="text-zinc-600 dark:text-zinc-400">{q.text}</span>
                        {reviewScores[q.id]?.score != null ? (
                          <span className="ml-2 font-semibold text-zinc-900 dark:text-zinc-100">— Band {reviewScores[q.id].score}</span>
                        ) : (
                          <span className="ml-2 text-zinc-400 dark:text-zinc-500">— Not scored yet</span>
                        )}
                      </p>
                      {reviewScores[q.id]?.feedback && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500 dark:text-zinc-400">{reviewScores[q.id].feedback}</p>
                      )}
                      {reviewScores[q.id]?.answer != null && reviewScores[q.id].answer !== "" && (
                        <p className="mt-2 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-600">
                          <span className="font-medium text-zinc-600 dark:text-zinc-400">Your answer:</span>{" "}
                          <span className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{reviewScores[q.id].answer}</span>
                        </p>
                      )}
                    </li>
                  ))}
                  {generatedExam.part2.map((q) => (
                    <li key={q.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800/50">
                      <p className="text-sm">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Part 2.</span>{" "}
                        <span className="text-zinc-600 dark:text-zinc-400">{q.text}</span>
                        {reviewScores[q.id]?.score != null ? (
                          <span className="ml-2 font-semibold text-zinc-900 dark:text-zinc-100">— Band {reviewScores[q.id].score}</span>
                        ) : (
                          <span className="ml-2 text-zinc-400 dark:text-zinc-500">— Not scored yet</span>
                        )}
                      </p>
                      {reviewScores[q.id]?.feedback && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500 dark:text-zinc-400">{reviewScores[q.id].feedback}</p>
                      )}
                      {reviewScores[q.id]?.answer != null && reviewScores[q.id].answer !== "" && (
                        <p className="mt-2 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-600">
                          <span className="font-medium text-zinc-600 dark:text-zinc-400">Your answer:</span>{" "}
                          <span className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{reviewScores[q.id].answer}</span>
                        </p>
                      )}
                    </li>
                  ))}
                  {generatedExam.part3.map((q, i) => (
                    <li key={q.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800/50">
                      <p className="text-sm">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Part 3 · {i + 1}.</span>{" "}
                        <span className="text-zinc-600 dark:text-zinc-400">{q.text}</span>
                        {reviewScores[q.id]?.score != null ? (
                          <span className="ml-2 font-semibold text-zinc-900 dark:text-zinc-100">— Band {reviewScores[q.id].score}</span>
                        ) : (
                          <span className="ml-2 text-zinc-400 dark:text-zinc-500">— Not scored yet</span>
                        )}
                      </p>
                      {reviewScores[q.id]?.feedback && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500 dark:text-zinc-400">{reviewScores[q.id].feedback}</p>
                      )}
                      {reviewScores[q.id]?.answer != null && reviewScores[q.id].answer !== "" && (
                        <p className="mt-2 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-600">
                          <span className="font-medium text-zinc-600 dark:text-zinc-400">Your answer:</span>{" "}
                          <span className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{reviewScores[q.id].answer}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
