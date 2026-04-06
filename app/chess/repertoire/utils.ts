import { Chess } from "chess.js";

export type RepertoireLine = {
  id: string;
  userId: string;
  name: string;
  color: "white" | "black";
  moves: string[];
  pgn: string;
  notes: string;
  lastDrilledAt: string | null;
  drillCorrect: number;
  drillTotal: number;
  createdAt: string;
};

export function movesToSan(ucis: string[]): string {
  const chess = new Chess();
  const sans: string[] = [];
  for (const uci of ucis) {
    try {
      const m = chess.move({ from: uci.slice(0, 2) as never, to: uci.slice(2, 4) as never, promotion: uci[4] ?? "q" });
      if (m) sans.push(m.san);
    } catch { break; }
  }
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    parts.push(`${i / 2 + 1}.${sans[i]}${sans[i + 1] ? ` ${sans[i + 1]}` : ""}`);
  }
  return parts.join(" ") || "(empty)";
}

export function lineFromRow(r: Record<string, unknown>): RepertoireLine {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    name: String(r.name ?? ""),
    color: (r.color ?? "white") as "white" | "black",
    moves: Array.isArray(r.moves) ? r.moves.map(String) : [],
    pgn: String(r.pgn ?? ""),
    notes: String(r.notes ?? ""),
    lastDrilledAt: r.last_drilled_at ? String(r.last_drilled_at) : null,
    drillCorrect: Number(r.drill_correct ?? 0),
    drillTotal: Number(r.drill_total ?? 0),
    createdAt: String(r.created_at),
  };
}
