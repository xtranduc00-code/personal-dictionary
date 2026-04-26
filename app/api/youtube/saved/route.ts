import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";

const YT_KEY = process.env.YOUTUBE_API_KEY;

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  // Plain video ID (11 chars)
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("?")[0];
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
  } catch {
    return null;
  }
  return null;
}

async function fetchVideoInfo(videoId: string) {
  if (!YT_KEY) return null;
  const params = new URLSearchParams({ part: "snippet", id: videoId, key: YT_KEY });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  const item = json?.items?.[0];
  if (!item) return null;
  const thumbnails = item.snippet.thumbnails;
  return {
    videoId: item.id as string,
    title: item.snippet.title as string,
    thumbnail:
      (thumbnails?.medium?.url ?? thumbnails?.default?.url ?? `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`) as string,
    channelId: (item.snippet.channelId ?? "") as string,
    channelTitle: (item.snippet.channelTitle ?? "") as string,
    publishedAt: (item.snippet.publishedAt ?? "") as string,
  };
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Try to include channel_id (added in scripts/sql/youtube_saved_videos_channel_id.sql).
  // If the column doesn't exist yet (migration not run), retry without it so
  // the page keeps working.
  type Row = {
    video_id: string;
    title: string;
    thumbnail: string;
    channel_id?: string | null;
    channel_title: string;
    published_at: string;
    added_at: string;
  };
  let data: Row[] | null = null;
  let error: { message: string } | null = null;

  const first = await supabaseServer
    .from("youtube_saved_videos")
    .select("video_id,title,thumbnail,channel_id,channel_title,published_at,added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });
  data = first.data as Row[] | null;
  error = first.error;

  if (error && /channel_id/i.test(error.message)) {
    const fallback = await supabaseServer
      .from("youtube_saved_videos")
      .select("video_id,title,thumbnail,channel_title,published_at,added_at")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false });
    data = fallback.data as Row[] | null;
    error = fallback.error;
  }

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

  const videoId = extractVideoId(body.url ?? "");
  if (!videoId)
    return NextResponse.json({ error: "Cannot extract video ID from URL" }, { status: 400 });

  const info = await fetchVideoInfo(videoId);
  if (!info) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  let { error } = await supabaseServer.from("youtube_saved_videos").upsert(
    {
      user_id: user.id,
      video_id: info.videoId,
      title: info.title,
      thumbnail: info.thumbnail,
      channel_id: info.channelId || null,
      channel_title: info.channelTitle,
      published_at: info.publishedAt,
    },
    { onConflict: "user_id,video_id" },
  );

  // Migration not run yet — retry without channel_id.
  if (error && /channel_id/i.test(error.message)) {
    ({ error } = await supabaseServer.from("youtube_saved_videos").upsert(
      {
        user_id: user.id,
        video_id: info.videoId,
        title: info.title,
        thumbnail: info.thumbnail,
        channel_title: info.channelTitle,
        published_at: info.publishedAt,
      },
      { onConflict: "user_id,video_id" },
    ));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(info);
}

export async function DELETE(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("youtube_saved_videos")
    .delete()
    .eq("user_id", user.id)
    .eq("video_id", videoId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
