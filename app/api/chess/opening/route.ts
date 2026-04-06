import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fen = url.searchParams.get("fen") ?? "";

  if (!fen) return NextResponse.json({ error: "fen required" }, { status: 400 });

  try {
    const params = new URLSearchParams({
      fen,
      moves: "10",
      topGames: "0",
      recentGames: "0",
    });
    const res = await fetch(`https://explorer.lichess.ovh/lichess?${params}`, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ moves: [] }, { status: 200 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ moves: [] });
  }
}
