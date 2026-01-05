"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  addTopic,
  deleteTopic,
  getTopics,
  updateTopic,
  type Topic,
} from "@/lib/ielts-speaking-storage";
import { ClipboardList, FolderOpen, Mic, Pencil, Plus, Trash2 } from "lucide-react";

export default function IeltsSpeakingPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newTopicName, setNewTopicName] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [topicList, countMap] = await Promise.all([
        getTopics(),
        fetch("/api/ielts/question-counts").then((r) => (r.ok ? r.json() : {})),
      ]);
      setTopics(topicList);
      setCounts(countMap ?? {});
    } catch {
      setTopics([]);
      setCounts({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAddTopic() {
    const name = newTopicName.trim();
    if (!name) return;
    try {
      await addTopic(name);
      setNewTopicName("");
      setAdding(false);
      await refresh();
    } catch {
      /* show error if needed */
    }
  }

  async function handleRenameTopic(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await updateTopic(id, trimmed);
      await refresh();
    } catch {
      /* show error if needed */
    }
  }

  async function handleDeleteTopic(id: string) {
    if (typeof window !== "undefined" && window.confirm("Delete this topic and all its questions?")) {
      try {
        await deleteTopic(id);
        await refresh();
      } catch {
        /* show error if needed */
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Mic className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            IELTS Speaking
          </h1>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Organize by topic. Open a topic to add and manage Part 1, 2 & 3 questions.
        </p>
        <Link
          href="/ielts-speaking/exam"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <ClipboardList className="h-5 w-5" />
          Exam — practice with questions from all topics
        </Link>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Topics</h2>
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Plus className="h-4 w-4" />
              New topic
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Topic name"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTopic();
                  if (e.key === "Escape") setAdding(false);
                }}
                autoFocus
                className="h-9 w-56 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={handleAddTopic}
                disabled={!newTopicName.trim()}
                className="h-9 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setNewTopicName(""); }}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {!loading && topics.length === 0 && !adding && (
          <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            No topics yet. Click &quot;New topic&quot; to create one.
          </p>
        )}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading...</p>
        ) : (
          topics.map((topic) => (
            <TopicFolder
              key={topic.id}
              topic={topic}
              questionCount={counts[topic.id] ?? 0}
              onRename={(newName) => handleRenameTopic(topic.id, newName)}
              onDelete={() => handleDeleteTopic(topic.id)}
            />
          ))
        )}
        </ul>
      </section>
    </div>
  );
}

function TopicFolder({
  topic,
  questionCount,
  onRename,
  onDelete,
}: {
  topic: Topic;
  questionCount: number;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(topic.name);

  function saveRename() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== topic.name) onRename(trimmed);
    setEditing(false);
    setEditName(topic.name);
  }

  return (
    <li className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <Link
        href={`/ielts-speaking/${topic.id}`}
        className="min-w-0 flex-1 flex items-center gap-3 no-underline"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <FolderOpen className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={saveRename}
              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(false); }}
              autoFocus
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              onClick={(e) => e.preventDefault()}
            />
          ) : (
            <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{topic.name}</p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {questionCount} question{questionCount !== 1 ? "s" : ""}
          </p>
        </div>
      </Link>
      {!editing && (
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setEditing(true); setEditName(topic.name); }}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Rename"
            aria-label="Rename topic"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onDelete(); }}
            className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
            title="Delete"
            aria-label="Delete topic"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}
