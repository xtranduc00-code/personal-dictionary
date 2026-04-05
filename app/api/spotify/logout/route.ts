import { NextResponse } from "next/server";
import { SPOTIFY_RT_COOKIE } from "@/lib/spotify/constants";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SPOTIFY_RT_COOKIE);
  return res;
}
