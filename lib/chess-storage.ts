"use client";
import { authFetch } from "@/lib/auth-context";

export type ChessGame = {
  id: string;
  roomCode: string;
  fen: string;
  pgn: string;
  whiteUserId: string | null;
  blackUserId: string | null;
  status: "waiting" | "active" | "finished" | "resigned" | "draw" | "timeout";
  turn: "w" | "b";
  winner: "white" | "black" | "draw" | null;
  // Extended history fields (populated when a game ends)
  whitePlayer: string | null;
  blackPlayer: string | null;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  timeControl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
};

export type GameHistoryItem = ChessGame & {
  myColor: "white" | "black" | null;
  result: "win" | "loss" | "draw" | null;
};

export type ChessPuzzle = {
  id: string;
  userId: string;
  title: string;
  fen: string;
  solutionMoves: string[];
  hint: string;
  level: "beginner" | "intermediate" | "hard" | "expert";
  timesSolved: number;
  createdAt: string;
};

const BASE = "/api/chess";

async function getJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Request failed");
  return data as T;
}

function gameFromRow(r: Record<string, unknown>): ChessGame {
  return {
    id: String(r.id),
    roomCode: String(r.room_code),
    fen: String(r.fen),
    pgn: String(r.pgn ?? ""),
    whiteUserId: r.white_user_id ? String(r.white_user_id) : null,
    blackUserId: r.black_user_id ? String(r.black_user_id) : null,
    status: r.status as ChessGame["status"],
    turn: r.turn as "w" | "b",
    winner: (r.winner ?? null) as ChessGame["winner"],
    whitePlayer: r.white_player ? String(r.white_player) : null,
    blackPlayer: r.black_player ? String(r.black_player) : null,
    whiteAccuracy: r.white_accuracy != null ? Number(r.white_accuracy) : null,
    blackAccuracy: r.black_accuracy != null ? Number(r.black_accuracy) : null,
    timeControl: r.time_control ? String(r.time_control) : null,
    durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function puzzleFromRow(r: Record<string, unknown>): ChessPuzzle {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    title: String(r.title ?? ""),
    fen: String(r.fen),
    solutionMoves: Array.isArray(r.solution_moves) ? r.solution_moves.map(String) : [],
    hint: String(r.hint ?? ""),
    level: (r.level ?? "beginner") as ChessPuzzle["level"],
    timesSolved: Number(r.times_solved ?? 0),
    createdAt: String(r.created_at),
  };
}

// ─── Games ────────────────────────────────────────────────────────────────────

export async function createChessGame(): Promise<ChessGame> {
  const res = await authFetch(`${BASE}/games`, { method: "POST" });
  const r = await getJson<Record<string, unknown>>(res);
  return gameFromRow(r);
}

export async function getChessGame(roomCode: string): Promise<ChessGame | null> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(roomCode)}`);
  if (res.status === 404) return null;
  const r = await getJson<Record<string, unknown>>(res);
  return gameFromRow(r);
}

export async function joinChessGame(roomCode: string): Promise<ChessGame> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(roomCode)}/join`, {
    method: "POST",
  });
  const r = await getJson<Record<string, unknown>>(res);
  return gameFromRow(r);
}

export async function updateChessGame(
  roomCode: string,
  patch: {
    fen?: string;
    pgn?: string;
    turn?: "w" | "b";
    status?: ChessGame["status"];
    winner?: ChessGame["winner"];
    white_player?: string;
    black_player?: string;
    time_control?: string;
    duration_seconds?: number;
  },
): Promise<ChessGame> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(roomCode)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const r = await getJson<Record<string, unknown>>(res);
  return gameFromRow(r);
}

export async function resignChessGame(roomCode: string): Promise<ChessGame> {
  return updateChessGame(roomCode, { status: "resigned" });
}

// ─── Puzzles ──────────────────────────────────────────────────────────────────

export async function getChessPuzzles(): Promise<ChessPuzzle[]> {
  const res = await authFetch(`${BASE}/puzzles`);
  const rows = await getJson<Record<string, unknown>[]>(res);
  return rows.map(puzzleFromRow);
}

export async function createChessPuzzle(data: {
  title: string;
  fen: string;
  solutionMoves: string[];
  hint: string;
  level: ChessPuzzle["level"];
}): Promise<ChessPuzzle> {
  const res = await authFetch(`${BASE}/puzzles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: data.title,
      fen: data.fen,
      solution_moves: data.solutionMoves,
      hint: data.hint,
      level: data.level,
    }),
  });
  const r = await getJson<Record<string, unknown>>(res);
  return puzzleFromRow(r);
}

export async function updateChessPuzzle(
  id: string,
  data: Partial<{ title: string; fen: string; solutionMoves: string[]; hint: string; level: ChessPuzzle["level"] }>,
): Promise<ChessPuzzle> {
  const body: Record<string, unknown> = { ...data };
  if (data.solutionMoves) {
    body.solution_moves = data.solutionMoves;
    delete body.solutionMoves;
  }
  const res = await authFetch(`${BASE}/puzzles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const r = await getJson<Record<string, unknown>>(res);
  return puzzleFromRow(r);
}

export async function deleteChessPuzzle(id: string): Promise<void> {
  await getJson(await authFetch(`${BASE}/puzzles/${id}`, { method: "DELETE" }));
}

export async function markPuzzleSolved(id: string): Promise<void> {
  await authFetch(`${BASE}/puzzles/${id}/solved`, { method: "POST" });
}

// ─── History ──────────────────────────────────────────────────────────────────

export type HistoryFilters = {
  result?: "win" | "loss" | "draw" | "all";
  timeControl?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function getGameHistory(filters: HistoryFilters = {}): Promise<{ items: GameHistoryItem[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.result && filters.result !== "all") params.set("result", filters.result);
  if (filters.timeControl) params.set("time_control", filters.timeControl);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  const res = await authFetch(`${BASE}/history?${params}`);
  return getJson<{ items: GameHistoryItem[]; total: number }>(res);
}

export async function updateGameAccuracy(
  gameId: string,
  whiteAccuracy: number,
  blackAccuracy: number,
): Promise<void> {
  await authFetch(`${BASE}/games/accuracy/${gameId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ white_accuracy: whiteAccuracy, black_accuracy: blackAccuracy }),
  });
}
