"use client";

import { useCallback, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { groupByBook, parseKindleClippings, type KindleClipping } from "@/lib/kindle-clippings-parser";

type Props = {
  setId: string;
  setName: string;
  onClose: () => void;
  onImported: (count: number) => void;
};

/** Heuristic: treat as a "vocabulary word" if ≤5 words and ≤60 chars */
function isVocabWord(text: string): boolean {
  const t = text.trim();
  if (t.length > 60) return false;
  const wordCount = t.split(/\s+/).length;
  return wordCount <= 5;
}

export function KindleImportModal({ setId, setName, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clippings, setClippings] = useState<KindleClipping[]>([]);
  const [groupedBooks, setGroupedBooks] = useState<Map<string, KindleClipping[]>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "select">("upload");
  const [dragging, setDragging] = useState(false);
  const [vocabOnly, setVocabOnly] = useState(true);
  const [useAI, setUseAI] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseKindleClippings(text);
      if (parsed.length === 0) {
        setError("No highlights found. Make sure it's a valid 'My Clippings.txt' file.");
        return;
      }
      const grouped = groupByBook(parsed);
      setClippings(parsed);
      setGroupedBooks(grouped);
      // Default: select only vocab-length entries
      const vocabKeys = parsed
        .map((c, i) => (isVocabWord(c.text) ? String(i) : null))
        .filter(Boolean) as string[];
      setSelected(new Set(vocabKeys));
      setExpandedBooks(new Set(grouped.keys()));
      setStep("select");
    };
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsText(file, "utf-8");
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const toggleClipping = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = String(idx);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleBook = useCallback(
    (bookTitle: string, indices: number[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const allSelected = indices.every((i) => next.has(String(i)));
        for (const i of indices) {
          if (allSelected) next.delete(String(i));
          else next.add(String(i));
        }
        return next;
      });
    },
    [],
  );

  const toggleExpand = useCallback((bookTitle: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookTitle)) next.delete(bookTitle);
      else next.add(bookTitle);
      return next;
    });
  }, []);

  const applyVocabFilter = useCallback(
    (enabled: boolean) => {
      setVocabOnly(enabled);
      if (enabled) {
        const vocabKeys = clippings
          .map((c, i) => (isVocabWord(c.text) ? String(i) : null))
          .filter(Boolean) as string[];
        setSelected(new Set(vocabKeys));
      } else {
        setSelected(new Set(clippings.map((_, i) => String(i))));
      }
    },
    [clippings],
  );

  const selectAll = useCallback(
    () => setSelected(new Set(clippings.map((_, i) => String(i)))),
    [clippings],
  );

  const deselectAll = useCallback(() => setSelected(new Set()), []);

  const handleImport = useCallback(async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    setProgress(null);

    try {
      const words = Array.from(selected)
        .map((key) => clippings[Number(key)])
        .filter(Boolean)
        .map((c) => c.text.length > 200 ? c.text.slice(0, 197) + "…" : c.text);

      if (useAI) {
        setProgress(`Enriching ${words.length} words with AI…`);
        const res = await fetch(`/api/flashcards/sets/${setId}/cards/bulk-enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ words }),
        });

        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "Import failed");
        }

        const { inserted, skipped, enriched } = (await res.json()) as {
          inserted: number;
          skipped: number;
          enriched: number;
        };
        setProgress(null);
        onImported(inserted);

        if (skipped > 0) {
          setError(`✓ Imported ${inserted} new words (${enriched} AI-enriched). Skipped ${skipped} already in set.`);
          setTimeout(onClose, 3000);
        } else {
          onImported(inserted);
        }
      } else {
        // Raw import (no AI) - original behavior
        const cards = words.map((word) => ({ word, definition: "" }));
        const res = await fetch(`/api/flashcards/sets/${setId}/cards/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ cards }),
        });

        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "Import failed");
        }

        const { inserted } = (await res.json()) as { inserted: number };
        onImported(inserted);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }, [selected, clippings, setId, useAI, onImported, onClose]);

  const bookIndices = useCallback(
    (bookTitle: string): number[] => {
      const indices: number[] = [];
      clippings.forEach((c, i) => {
        if (c.bookTitle === bookTitle) indices.push(i);
      });
      return indices;
    },
    [clippings],
  );

  const vocabCount = clippings.filter((c) => isVocabWord(c.text)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-amber-500" />
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Import Kindle Highlights
              </h2>
              <p className="text-xs text-zinc-400">into &ldquo;{setName}&rdquo;</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {step === "upload" ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex w-full cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 transition ${
                  dragging
                    ? "border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/20"
                    : "border-zinc-300 hover:border-amber-400 hover:bg-amber-50/50 dark:border-zinc-600 dark:hover:border-amber-500 dark:hover:bg-amber-950/10"
                }`}
              >
                <Upload className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
                <div className="text-center">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Drop{" "}
                    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">
                      My Clippings.txt
                    </code>{" "}
                    here
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">or click to browse</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
                On your Kindle: <strong>documents/My Clippings.txt</strong>
                <br />
                Copy from Kindle via Finder (USB) → drag here
              </p>
              {error && (
                <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Options bar */}
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
                {/* Vocab filter toggle */}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <div
                    onClick={() => applyVocabFilter(!vocabOnly)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      vocabOnly ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        vocabOnly ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                  <span className="text-zinc-600 dark:text-zinc-300">
                    Vocab words only{" "}
                    <span className="text-zinc-400">({vocabCount} short)</span>
                  </span>
                </label>

                {/* AI enrich toggle */}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <div
                    onClick={() => setUseAI((v) => !v)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      useAI ? "bg-violet-500" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        useAI ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                  <span className="flex items-center gap-1 text-zinc-600 dark:text-zinc-300">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                    AI enrichment{" "}
                    <span className="text-zinc-400">(POS · definition · example)</span>
                  </span>
                </label>

                {/* Select all / none */}
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    All
                  </button>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    None
                  </button>
                  <span className="ml-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {selected.size} selected
                  </span>
                </div>
              </div>

              {/* Book list */}
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {Array.from(groupedBooks.entries()).map(([bookTitle, clips]) => {
                  const indices = bookIndices(bookTitle);
                  const bookSelected = indices.filter((i) => selected.has(String(i))).length;
                  const allBookSelected = bookSelected === indices.length;
                  const expanded = expandedBooks.has(bookTitle);

                  return (
                    <div key={bookTitle}>
                      <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <input
                          type="checkbox"
                          checked={allBookSelected}
                          onChange={() => toggleBook(bookTitle, indices)}
                          className="h-4 w-4 rounded border-zinc-300 accent-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => toggleExpand(bookTitle)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                            {bookTitle}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-400">
                            {bookSelected}/{clips.length}
                          </span>
                        </button>
                      </div>

                      {expanded && (
                        <ul className="divide-y divide-zinc-50 bg-zinc-50/60 dark:divide-zinc-800/60 dark:bg-zinc-800/20">
                          {clips.map((clip, localIdx) => {
                            const globalIdx = indices[localIdx]!;
                            const key = String(globalIdx);
                            const isShort = isVocabWord(clip.text);
                            return (
                              <li
                                key={key}
                                className="flex cursor-pointer items-start gap-3 px-6 py-2.5 hover:bg-white dark:hover:bg-zinc-800"
                                onClick={() => toggleClipping(globalIdx)}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.has(key)}
                                  onChange={() => toggleClipping(globalIdx)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-amber-500"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">
                                    {clip.text}
                                  </p>
                                  <div className="mt-0.5 flex items-center gap-2">
                                    <span className="text-[11px] text-zinc-400">
                                      {clip.type === "note" ? "Note" : "Highlight"}
                                      {clip.page ? ` · p.${clip.page}` : ""}
                                    </span>
                                    {isShort && (
                                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                        vocab
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "select" && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
            {progress && (
              <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progress}
              </div>
            )}
            {error && (
              <p className={`text-sm ${error.startsWith("✓") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {error}
              </p>
            )}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => { setStep("upload"); setClippings([]); setSelected(new Set()); setError(null); }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Change file
              </button>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={importing || selected.size === 0}
                className={`ml-auto inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  useAI ? "bg-violet-500 hover:bg-violet-600" : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : useAI ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {useAI ? "AI Import" : "Import"} {selected.size} word
                {selected.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
