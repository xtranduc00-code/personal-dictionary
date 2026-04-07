import { NextResponse } from "next/server";

const EMPTY = { white: 0, draws: 0, black: 0, moves: [] as never[] };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fen = url.searchParams.get("fen") ?? "";

  if (!fen) return NextResponse.json({ error: "fen required" }, { status: 400 });

  try {
    const params = new URLSearchParams({
      variant: "standard",
      fen,
      moves: "12",
      topGames: "0",
      recentGames: "0",
    });
    const url = `https://explorer.lichess.ovh/lichess?${params}`;
    const headers = {
      Accept: "application/json",
      "User-Agent": "KFChess-OpeningExplorer/1.0 (https://lichess.org/api)",
    } as const;

    let res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 500));
      res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });
    }
    if (!res.ok) {
      return NextResponse.json({ ...EMPTY, error: "upstream" }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ...EMPTY, error: "unavailable" }, { status: 503 });
  }
}
