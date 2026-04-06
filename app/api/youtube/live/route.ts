import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";

const YT_KEY = process.env.YOUTUBE_API_KEY;

export type YTLiveVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  isLive: true;
  concurrentViewers?: number;
};

async function fetchLiveVideos(channelId: string): Promise<YTLiveVideo[]> {
  if (!YT_KEY) return [];
  const params = new URLSearchParams({
    part: "snippet",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: "10",
    key: YT_KEY,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.items ?? []).map((item: Record<string, unknown>) => {
    const id = item.id as Record<string, string>;
    const snippet = item.snippet as Record<string, unknown>;
    const thumbnails = snippet.thumbnails as Record<string, { url: string }>;
    return {
      videoId: id.videoId,
      title: snippet.title as string,
      thumbnail: thumbnails?.medium?.url ?? thumbnails?.default?.url ?? `https://i.ytimg.com/vi/${id.videoId}/mqdefault.jpg`,
      channelId: snippet.channelId as string,
      channelTitle: snippet.channelTitle as string,
      publishedAt: snippet.publishedAt as string,
      isLive: true as const,
    };
  });
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!YT_KEY)
    return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");

  let channelIds: string[] = [];

  if (channelId) {
    channelIds = [channelId];
  } else {
    // All followed channels
    const { data } = await supabaseServer
      .from("youtube_channels")
      .select("channel_id")
      .eq("user_id", user.id);
    channelIds = (data ?? []).map((r: { channel_id: string }) => r.channel_id);
  }

  if (channelIds.length === 0) return NextResponse.json([]);

  // Fetch live from all channels in parallel (each costs 100 quota units!)
  const results = await Promise.all(channelIds.map(fetchLiveVideos));
  return NextResponse.json(results.flat());
}
