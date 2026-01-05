"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  addQuestions,
  addTopicVocabItem,
  deleteQuestion,
  getQuestions,
  getTopic,
  getTopicVocab,
  removeTopicVocabItem,
  updateQuestion,
  type SpeakingPart,
  type SpeakingQuestion,
  type Topic,
  type VocabItem,
} from "@/lib/ielts-speaking-storage";
import { PracticeModal } from "@/components/ielts-speaking/practice-modal";
import { ArrowLeft, BookOpen, Mic, Pencil, Plus, Trash2, X } from "lucide-react";

const PARTS: { id: SpeakingPart; label: string }[] = [
  { id: "1", label: "Part 1" },
  { id: "2", label: "Part 2" },
  { id: "3", label: "Part 3" },
];

function AddQuestionsModal({
  topicId,
  onClose,
  onAdded,
}: {
  topicId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [part, setPart] = useState<SpeakingPart>("1");
  const [text, setText] = useState("");

  async function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const count = await addQuestions(topicId, part, trimmed);
    setText("");
    onAdded();
    if (count > 0) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Add questions</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Choose part, then paste or type questions (one per line).
        </p>
        <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Part</label>
        <select
          value={part}
          onChange={(e) => setPart(e.target.value as SpeakingPart)}
          className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="1">Part 1</option>
          <option value="2">Part 2</option>
          <option value="3">Part 3</option>
        </select>
        <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Questions (one per line)</label>
        <textarea
          placeholder="Paste or type one or more questions..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="mt-1 w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!text.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add to Part {part}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function VocabularyModal({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [word, setWord] = useState("");
  const [explanation, setExplanation] = useState("");

  useEffect(() => {
    let cancelled = false;
    getTopicVocab(topicId).then((data) => {
      if (!cancelled) setVocab(data);
    });
    return () => { cancelled = true; };
  }, [topicId]);

  async function refreshVocab() {
    const data = await getTopicVocab(topicId);
    setVocab(data);
  }

  async function handleAdd() {
    const w = word.trim();
    const e = explanation.trim();
    if (!w) return;
    await addTopicVocabItem(topicId, w, e);
    setWord("");
    setExplanation("");
    await refreshVocab();
  }

  async function handleRemove(index: number) {
    await removeTopicVocabItem(topicId, index);
    await refreshVocab();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Vocabulary & explanation
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Review before speaking. Add words and short explanations for this topic.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Word / phrase</label>
            <input
              type="text"
              placeholder="e.g. take up a hobby"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAdd())}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Explanation</label>
            <input
              type="text"
              placeholder="e.g. to start doing a hobby"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAdd())}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!word.trim()}
            className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Add
          </button>
        </div>

        {vocab.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            No vocabulary yet. Add words above to review before speaking.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {vocab.map((item, idx) => (
              <li
                key={`${item.word}-${idx}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{item.word}</p>
                  {item.explanation && (
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{item.explanation}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(idx)}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function QuestionItem({
  q,
  onEdited,
  onDelete,
  onPractice,
}: {
  q: SpeakingQuestion;
  onEdited: () => void;
  onDelete: (id: string) => void;
  onPractice: (q: SpeakingQuestion) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(q.text);

  async function saveEdit() {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== q.text) {
      await updateQuestion(q.id, { text: trimmed });
      onEdited();
    }
    setEditing(false);
    setEditText(q.text);
  }

  useEffect(() => {
    setEditText(q.text);
  }, [q.text]);

  return (
    <li className="group flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {editing ? (
        <div className="min-w-0 flex-1 space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setEditText(q.text); }}
              className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onPractice(q)}
            className="min-w-0 flex-1 cursor-pointer rounded-lg text-left text-sm leading-relaxed text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            {q.text}
          </button>
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              onClick={() => onPractice(q)}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
              title="Practice (voice + AI score)"
              aria-label="Practice"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title="Edit"
              aria-label="Edit question"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(q.id)}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
              title="Delete"
              aria-label="Delete question"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function QuestionList({
  questions,
  onEdited,
  onDelete,
  onPractice,
}: {
  questions: SpeakingQuestion[];
  onEdited: () => void;
  onDelete: (id: string) => void;
  onPractice: (q: SpeakingQuestion) => void;
}) {
  return (
    <ul className="mt-3 space-y-2">
      {questions.length === 0 && (
        <li className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
          No questions yet. Add one below.
        </li>
      )}
      {questions.map((q) => (
        <QuestionItem key={q.id} q={q} onEdited={onEdited} onDelete={onDelete} onPractice={onPractice} />
      ))}
    </ul>
  );
}

export default function IeltsSpeakingTopicPage() {
  const params = useParams();
  const topicId = params.topicId as string;
  const [topic, setTopic] = useState<Topic | null>(null);
  const [part1, setPart1] = useState<SpeakingQuestion[]>([]);
  const [part2, setPart2] = useState<SpeakingQuestion[]>([]);
  const [part3, setPart3] = useState<SpeakingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [practiceQuestion, setPracticeQuestion] = useState<SpeakingQuestion | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [vocabModalOpen, setVocabModalOpen] = useState(false);
  const [vocabCount, setVocabCount] = useState(0);

  async function refresh() {
    if (!topicId) return;
    setLoading(true);
    try {
      const [topicData, questions, vocab] = await Promise.all([
        getTopic(topicId),
        getQuestions(topicId),
        getTopicVocab(topicId),
      ]);
      setTopic(topicData);
      setPart1(questions.filter((q) => q.part === "1"));
      setPart2(questions.filter((q) => q.part === "2"));
      setPart3(questions.filter((q) => q.part === "3"));
      setVocabCount(vocab.length);
    } finally {
      setLoading(false);
    }
  }

  async function refreshVocabCount() {
    if (!topicId) return;
    const v = await getTopicVocab(topicId);
    setVocabCount(v.length);
  }

  useEffect(() => {
    if (topicId) void refresh();
  }, [topicId]);

  async function handleDelete(id: string) {
    await deleteQuestion(id);
    await refresh();
  }

  if (!topicId) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <p className="text-zinc-500">Invalid topic.</p>
        <Link href="/ielts-speaking" className="mt-4 inline-block text-sm text-zinc-600 underline dark:text-zinc-400">
          Back to topics
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <p className="text-zinc-500">Loading...</p>
        <Link href="/ielts-speaking" className="mt-4 inline-block text-sm text-zinc-600 underline dark:text-zinc-400">
          Back to topics
        </Link>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <p className="text-zinc-500">Topic not found.</p>
        <Link href="/ielts-speaking" className="mt-4 inline-block text-sm text-zinc-600 underline dark:text-zinc-400">
          Back to topics
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {practiceQuestion && (
        <PracticeModal question={practiceQuestion} onClose={() => setPracticeQuestion(null)} />
      )}
      {addModalOpen && (
        <AddQuestionsModal
          topicId={topicId}
          onClose={() => setAddModalOpen(false)}
          onAdded={() => void refresh()}
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Mic className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {topic.name}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <Plus className="h-4 w-4" />
            Add questions
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Add, edit, and delete questions for Part 1, 2 & 3.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setVocabModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <BookOpen className="h-4 w-4" />
            Vocabulary & explanation ({vocabCount})
          </button>
        </div>
      </section>

      {vocabModalOpen && (
        <VocabularyModal
          topicId={topicId}
          onClose={() => {
            void refreshVocabCount();
            setVocabModalOpen(false);
          }}
        />
      )}

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

              <QuestionList
                questions={questions}
                onEdited={() => void refresh()}
                onDelete={(id) => void handleDelete(id)}
                onPractice={setPracticeQuestion}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
