"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import {
  ArrowLeft, BookOpen, ChevronRight, Edit2, Loader2,
  Plus, RotateCcw, StickyNote, Trash2, Upload, X,
} from "lucide-react";
import { useAuth, authFetch } from "@/lib/auth-context";
import { ChessBoardWrapper } from "@/components/chess/ChessBoardWrapper";

// ─── Types ────────────────────────────────────────────────────────────────────

import { type RepertoireLine, movesToSan, lineFromRow } from "./utils";

type ExplorerMove = { uci: string; san: string; white: number; draws: number; black: number };
type ExplorerData = {
  white: number; draws: number; black: number;
  moves: ExplorerMove[];
  opening?: { eco: string; name: string };
};

function relativeDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function drillScoreLabel(correct: number, total: number): string {
  if (total === 0) return "Not drilled";
  return `${Math.round((correct / total) * 100)}% (${correct}/${total})`;
}

function pct(n: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageView = "list" | "form";

export default function RepertoirePage() {
  const { user } = useAuth();
  const [view, setView]       = useState<PageView>("list");
  const [editLine, setEditLine] = useState<RepertoireLine | null>(null);
  const [lines, setLines]     = useState<RepertoireLine[]>([]);
  const [colorFilter, setColorFilter] = useState<"all" | "white" | "black">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await authFetch("/api/chess/repertoire");
      const data = await res.json() as Record<string, unknown>[];
      setLines(data.map(lineFromRow));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this opening line?")) return;
    await authFetch(`/api/chess/repertoire/${id}`, { method: "DELETE" });
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function openForm(line: RepertoireLine | null = null) {
    setEditLine(line);
    setView("form");
  }

  function closeForm(saved?: RepertoireLine) {
    if (saved) {
      if (editLine) {
        setLines((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
      } else {
        setLines((prev) => [saved, ...prev]);
      }
    }
    setEditLine(null);
    setView("list");
  }

  if (view === "form") {
    return <LineForm line={editLine} onDone={closeForm} />;
  }

  const filtered = colorFilter === "all" ? lines : lines.filter((l) => l.color === colorFilter);
  const white = filtered.filter((l) => l.color === "white");
  const black = filtered.filter((l) => l.color === "black");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/90">
        <Link href="/chess" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">My Repertoire</span>
        <div className="ml-auto flex items-center gap-2">
          {lines.length > 0 && (
            <Link
              href="/chess/repertoire/drill"
              className="flex items-center gap-1.5 rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
            >
              ⚡ Drill
            </Link>
          )}
          <button
            onClick={() => openForm(null)}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Plus className="h-3.5 w-3.5" /> Add Line
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-8">
        {/* ── Color filter tabs ────────────────────────────────────────────── */}
        <div className="flex overflow-hidden rounded-xl border border-zinc-200 bg-white text-xs dark:border-zinc-700 dark:bg-zinc-900">
          {(["all", "white", "black"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setColorFilter(c)}
              className={`flex-1 py-2 transition ${
                colorFilter === c
                  ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              {c === "all" ? "All Lines" : c === "white" ? "♔ White" : "♚ Black"}
            </button>
          ))}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onAdd={() => openForm(null)} />
        ) : (
          <div className="space-y-5">
            {colorFilter !== "black" && white.length > 0 && (
              <LineGroup title="White Opening Lines" icon="♔" lines={white} onEdit={openForm} onDelete={handleDelete} />
            )}
            {colorFilter !== "white" && black.length > 0 && (
              <LineGroup title="Black Opening Lines" icon="♚" lines={black} onEdit={openForm} onDelete={handleDelete} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Line Group ───────────────────────────────────────────────────────────────

function LineGroup({
  title, icon, lines, onEdit, onDelete,
}: {
  title: string; icon: string;
  lines: RepertoireLine[];
  onEdit: (l: RepertoireLine) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {icon} {title} ({lines.length})
      </p>
      <div className="space-y-2">
        {lines.map((line) => (
          <LineCard key={line.id} line={line} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ─── Line Card ────────────────────────────────────────────────────────────────

function LineCard({ line, onEdit, onDelete }: {
  line: RepertoireLine;
  onEdit: (l: RepertoireLine) => void;
  onDelete: (id: string) => void;
}) {
  const score = line.drillTotal > 0 ? Math.round((line.drillCorrect / line.drillTotal) * 100) : null;
  const scoreColor = score == null ? "text-zinc-400"
    : score >= 80 ? "text-emerald-600 dark:text-emerald-400"
    : score >= 50 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{line.name}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500 line-clamp-2">
            {movesToSan(line.moves)}
          </p>
          {line.notes && (
            <p className="mt-1.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
              <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{line.notes}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={() => onEdit(line)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(line.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-zinc-400">
        <span className={`font-medium ${scoreColor}`}>
          {drillScoreLabel(line.drillCorrect, line.drillTotal)}
        </span>
        <span>Last drilled: {relativeDate(line.lastDrilledAt)}</span>
        <span>{line.moves.length} half-moves</span>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-3xl dark:bg-zinc-800">
        📚
      </div>
      <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">No lines yet</p>
      <p className="text-sm text-zinc-400">Build your opening repertoire to drill and memorize</p>
      <button
        onClick={onAdd}
        className="mt-1 flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
      >
        <Plus className="h-4 w-4" /> Add First Line
      </button>
    </div>
  );
}

// ─── Line Form ────────────────────────────────────────────────────────────────

function LineForm({ line, onDone }: {
  line: RepertoireLine | null;
  onDone: (saved?: RepertoireLine) => void;
}) {
  const [name, setName]     = useState(line?.name ?? "");
  const [color, setColor]   = useState<"white" | "black">(line?.color ?? "white");
  const [moves, setMoves]   = useState<string[]>(line?.moves ?? []);
  const [notes, setNotes]   = useState(line?.notes ?? "");
  const [inputMode, setInputMode] = useState<"board" | "pgn">("board");
  const [pgnText, setPgnText]     = useState(line?.pgn ?? "");
  const [pgnError, setPgnError]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [explorer, setExplorer]   = useState<ExplorerData | null>(null);
  const explorerAbort = useRef<AbortController | null>(null);
  const { chessRef, fen } = useChessFromMoves(moves);

  async function fetchExplorer(fen: string) {
    explorerAbort.current?.abort();
    const ctrl = new AbortController();
    explorerAbort.current = ctrl;
    try {
      const res = await fetch(`/api/chess/opening?fen=${encodeURIComponent(fen)}`, { signal: ctrl.signal });
      const data = await res.json() as ExplorerData;
      setExplorer(data);
    } catch { /* aborted or network error */ }
  }

  // Sync explorer when moves change
  useEffect(() => {
    const chess = new Chess();
    for (const uci of moves) {
      try { chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: uci[4] ?? "q" }); }
      catch { break; }
    }
    fetchExplorer(chess.fen());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves]);

  function parsePgn() {
    const chess = new Chess();
    try {
      chess.loadPgn(pgnText.trim());
      const hist = chess.history({ verbose: true });
      const ucis = hist.map((m) => m.from + m.to + (m.promotion ?? ""));
      setMoves(ucis);
      setPgnError("");
      setInputMode("board");
    } catch {
      setPgnError("Invalid PGN — check the format and try again.");
    }
  }

  function importPgnFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPgnText(String(ev.target?.result ?? ""));
      setInputMode("pgn");
    };
    reader.readAsText(file);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    const chess = new Chess();
    for (const uci of moves) {
      try { chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: uci[4] ?? "q" }); }
      catch { break; }
    }
    const pgn = chess.pgn();

    const body = { name: name.trim(), color, moves, pgn, notes };
    const res = line
      ? await authFetch(`/api/chess/repertoire/${line.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
      : await authFetch("/api/chess/repertoire", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });

    if (res.ok) {
      const saved = lineFromRow(await res.json() as Record<string, unknown>);
      onDone(saved);
    }
    setSaving(false);
  }

  const top3 = (explorer?.moves ?? []).slice(0, 4);
  const explorerTotal = explorer ? (explorer.white + explorer.draws + explorer.black) : 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/90">
        <button onClick={() => onDone()} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          {line ? "Edit Line" : "Add New Line"}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="ml-auto flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {line ? "Save Changes" : "Save Line"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-8">
        {inputMode === "board" ? (
          <div className="grid min-h-0 grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr] lg:items-start lg:gap-8">
            <div className="flex min-w-0 flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-500">Line Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Italian Game — Giuoco Piano"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-500">Play As</label>
                <div className="flex overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                  {(["white", "black"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`flex-1 py-2.5 text-sm font-medium transition ${
                        color === c
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-white text-zinc-500 hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {c === "white" ? "♔ White" : "♚ Black"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <label className="min-w-0 flex-1 text-xs font-semibold text-zinc-500">Moves</label>
                  <div className="flex rounded-lg border border-zinc-200 text-xs dark:border-zinc-700">
                    {(["board", "pgn"] as const).map((m) => (
                      <button key={m} onClick={() => setInputMode(m)}
                        className={`px-2.5 py-1 transition first:rounded-l-lg last:rounded-r-lg ${
                          inputMode === m
                            ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {m === "board" ? "🏆 Board" : "📋 PGN"}
                      </button>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                    <Upload className="h-3 w-3" /> .pgn
                    <input type="file" accept=".pgn,.txt" className="sr-only" onChange={importPgnFile} />
                  </label>
                </div>
                <BoardBuilderControls moves={moves} onChange={setMoves} chessRef={chessRef} explorer={explorer} />
              </div>
              {top3.length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <p className="text-xs font-semibold text-zinc-500">
                      {explorer?.opening ? `${explorer.opening.eco} · ${explorer.opening.name}` : "Lichess Explorer"}
                    </p>
                    <p className="text-[10px] text-zinc-400">{(explorerTotal / 1000).toFixed(0)}k games</p>
                  </div>
                  <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
                    {top3.map((m) => {
                      const t = m.white + m.draws + m.black;
                      const wPct = t ? (m.white / t) * 100 : 0;
                      const dPct = t ? (m.draws / t) * 100 : 0;
                      return (
                        <div key={m.uci} className="flex items-center gap-3 px-3 py-2">
                          <span className="w-8 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{m.san}</span>
                          <div className="flex h-1.5 flex-1 overflow-hidden rounded-full">
                            <div className="bg-white ring-1 ring-inset ring-zinc-300 dark:bg-zinc-200" style={{ width: `${wPct}%` }} />
                            <div className="bg-zinc-400 dark:bg-zinc-600" style={{ width: `${dPct}%` }} />
                            <div className="flex-1 bg-zinc-900 dark:bg-zinc-950" />
                          </div>
                          <span className="shrink-0 text-[10px] text-zinc-400">{pct(m.white, t)} W</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-500">
                  <StickyNote className="h-3 w-3 text-amber-500" /> Coach Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder='e.g. "Always play h3 here to prevent Bg4 pin"'
                  rows={3}
                  className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 placeholder-amber-400 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
            <div className="flex min-w-0 w-full flex-col items-center justify-start lg:sticky lg:top-4 lg:self-start">
              <RepertoireBoardCanvas
                moves={moves}
                color={color}
                onChange={setMoves}
                chessRef={chessRef}
                fen={fen}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500">Line Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Italian Game — Giuoco Piano"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500">Play As</label>
              <div className="flex overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                {(["white", "black"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`flex-1 py-2.5 text-sm font-medium transition ${
                      color === c
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-white text-zinc-500 hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {c === "white" ? "♔ White" : "♚ Black"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="min-w-0 flex-1 text-xs font-semibold text-zinc-500">Moves</label>
                <div className="flex rounded-lg border border-zinc-200 text-xs dark:border-zinc-700">
                  {(["board", "pgn"] as const).map((m) => (
                    <button key={m} onClick={() => setInputMode(m)}
                      className={`px-2.5 py-1 transition first:rounded-l-lg last:rounded-r-lg ${
                        inputMode === m
                          ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {m === "board" ? "🏆 Board" : "📋 PGN"}
                    </button>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <Upload className="h-3 w-3" /> .pgn
                  <input type="file" accept=".pgn,.txt" className="sr-only" onChange={importPgnFile} />
                </label>
              </div>
              <div className="space-y-2">
                <textarea
                  value={pgnText}
                  onChange={(e) => setPgnText(e.target.value)}
                  placeholder="Paste PGN here, e.g.: 1.e4 e5 2.Nf3 Nc6 3.Bc4"
                  rows={5}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                {pgnError && <p className="text-xs text-red-500">{pgnError}</p>}
                <button
                  onClick={parsePgn}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Import Moves
                </button>
              </div>
            </div>
            {top3.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-500">
                    {explorer?.opening ? `${explorer.opening.eco} · ${explorer.opening.name}` : "Lichess Explorer"}
                  </p>
                  <p className="text-[10px] text-zinc-400">{(explorerTotal / 1000).toFixed(0)}k games</p>
                </div>
                <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
                  {top3.map((m) => {
                    const t = m.white + m.draws + m.black;
                    const wPct = t ? (m.white / t) * 100 : 0;
                    const dPct = t ? (m.draws / t) * 100 : 0;
                    return (
                      <div key={m.uci} className="flex items-center gap-3 px-3 py-2">
                        <span className="w-8 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{m.san}</span>
                        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full">
                          <div className="bg-white ring-1 ring-inset ring-zinc-300 dark:bg-zinc-200" style={{ width: `${wPct}%` }} />
                          <div className="bg-zinc-400 dark:bg-zinc-600" style={{ width: `${dPct}%` }} />
                          <div className="flex-1 bg-zinc-900 dark:bg-zinc-950" />
                        </div>
                        <span className="shrink-0 text-[10px] text-zinc-400">{pct(m.white, t)} W</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-500">
                <StickyNote className="h-3 w-3 text-amber-500" /> Coach Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='e.g. "Always play h3 here to prevent Bg4 pin"'
                rows={3}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 placeholder-amber-400 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Board Builder (repertoire line form) ─────────────────────────────────────

function useChessFromMoves(moves: string[]) {
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(() => new Chess().fen());

  useEffect(() => {
    const chess = new Chess();
    for (const uci of moves) {
      try { chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: uci[4] ?? "q" }); }
      catch { break; }
    }
    chessRef.current = chess;
    setFen(chess.fen());
  }, [moves]);

  return { chessRef, fen };
}

function RepertoireBoardCanvas({
  moves,
  color,
  onChange,
  chessRef,
  fen,
}: {
  moves: string[];
  color: "white" | "black";
  onChange: (moves: string[]) => void;
  chessRef: React.MutableRefObject<Chess>;
  fen: string;
}) {
  function handleDrop(from: string, to: string): boolean {
    if (!to) return false;
    const chess = chessRef.current;
    const move = chess.move({ from: from as never, to: to as never, promotion: "q" });
    if (!move) return false;
    onChange([...moves, from + to]);
    return true;
  }

  return (
    <div className="mx-auto flex w-full shrink-0 justify-center">
      <ChessBoardWrapper
        className="overflow-hidden rounded-xl"
        fixedEdgeNotation={false}
        options={{
          position: fen,
          onPieceDrop: ({ sourceSquare, targetSquare }) => handleDrop(sourceSquare, targetSquare ?? ""),
          boardOrientation: color,
        }}
      />
    </div>
  );
}

function BoardBuilderControls({
  moves,
  onChange,
  chessRef,
  explorer,
}: {
  moves: string[];
  onChange: (moves: string[]) => void;
  chessRef: React.MutableRefObject<Chess>;
  explorer: ExplorerData | null;
}) {
  function clickExplorerMove(uci: string) {
    const chess = chessRef.current;
    const from = uci.slice(0, 2);
    const to   = uci.slice(2, 4);
    const move = chess.move({ from: from as never, to: to as never, promotion: uci[4] ?? "q" });
    if (!move) return;
    onChange([...moves, from + to]);
  }

  function undo() {
    onChange(moves.slice(0, -1));
  }

  function reset() {
    onChange([]);
  }

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-zinc-500 break-words">
          {movesToSan(moves)}
        </p>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={undo} disabled={moves.length === 0}
            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-800">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={reset} disabled={moves.length === 0}
            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {(explorer?.moves ?? []).slice(0, 4).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-[10px] text-zinc-400">Play:</span>
          {(explorer?.moves ?? []).slice(0, 4).map((m) => (
            <button
              key={m.uci}
              type="button"
              onClick={() => clickExplorerMove(m.uci)}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-700 hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-violet-700"
            >
              {m.san}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
