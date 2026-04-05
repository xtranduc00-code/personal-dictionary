import { NextResponse } from "next/server";
import { SPOTIFY_RT_COOKIE } from "@/lib/spotify/constants";
import { clearCachedSpotifyAccessToken } from "@/lib/spotify/access-token";

export async function GET() {
  await clearCachedSpotifyAccessToken();
  const res = NextResponse.redirect(
    new URL("/spotify", process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"),
  );
  res.cookies.delete(SPOTIFY_RT_COOKIE);
  return res;
}

export async function POST() {
  await clearCachedSpotifyAccessToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SPOTIFY_RT_COOKIE);
  return res;
}
