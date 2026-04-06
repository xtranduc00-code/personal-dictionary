import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";

const YT_KEY = process.env.YOUTUBE_API_KEY;

function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  // Direct playlist ID (PLxxx, OLxxx, UUxxx, etc.)
  if (/^(PL|OL|UU|FL|RD|LL|WL)[\w-]+$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.searchParams.get("list");
  } catch {
    return null;
  }
}

async function fetchPlaylistInfo(playlistId: string) {
  if (!YT_KEY) return null;
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    id: playlistId,
    key: YT_KEY,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/playlists?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  const item = json?.items?.[0];
  if (!item) return null;
  const thumbnails = item.snippet.thumbnails;
  return {
    playlistId: item.id as string,
    title: item.snippet.title as string,
    thumbnail:
      (thumbnails?.medium?.url ?? thumbnails?.default?.url ?? "") as string,
    channelTitle: (item.snippet.channelTitle ?? "") as string,
    videoCount: (item.contentDetails?.itemCount ?? 0) as number,
  };
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("youtube_playlists")
    .select("playlist_id,title,thumbnail,channel_title,video_count,added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!YT_KEY)
    return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 503 });

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const playlistId = extractPlaylistId(body.url ?? "");
  if (!playlistId)
    return NextResponse.json({ error: "Cannot extract playlist ID from URL" }, { status: 400 });

  const info = await fetchPlaylistInfo(playlistId);
  if (!info) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });

  const { error } = await supabaseServer.from("youtube_playlists").upsert(
    {
      user_id: user.id,
      playlist_id: info.playlistId,
      title: info.title,
      thumbnail: info.thumbnail,
      channel_title: info.channelTitle,
      video_count: info.videoCount,
    },
    { onConflict: "user_id,playlist_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(info);
}

export async function DELETE(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get("playlistId");
  if (!playlistId) return NextResponse.json({ error: "playlistId required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("youtube_playlists")
    .delete()
    .eq("user_id", user.id)
    .eq("playlist_id", playlistId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
