import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";

const YT_KEY = process.env.YOUTUBE_API_KEY;

export type YTVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration?: string;
};

async function getUploadsPlaylistId(channelId: string): Promise<string | null> {
  const params = new URLSearchParams({ part: "contentDetails", id: channelId, key: YT_KEY! });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

async function getVideosFromPlaylist(playlistId: string, maxResults = 20): Promise<YTVideo[]> {
  const params = new URLSearchParams({
    part: "snippet",
    playlistId,
    maxResults: String(maxResults),
    key: YT_KEY!,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.items ?? []).map((item: Record<string, unknown>) => {
    const snippet = item.snippet as Record<string, unknown>;
    const rid = snippet.resourceId as Record<string, unknown>;
    const thumbnails = snippet.thumbnails as Record<string, { url: string }>;
    return {
      videoId: rid.videoId as string,
      title: snippet.title as string,
      thumbnail:
        (thumbnails?.medium?.url ??
          thumbnails?.default?.url ??
          `https://i.ytimg.com/vi/${rid.videoId}/mqdefault.jpg`),
      channelId: snippet.videoOwnerChannelId as string,
      channelTitle: snippet.videoOwnerChannelTitle as string,
      publishedAt: snippet.publishedAt as string,
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
  const playlistId = searchParams.get("playlistId");
  const perChannel = Math.min(Number(searchParams.get("per") ?? "10"), 20);

  // Direct playlist fetch (no channel resolution needed)
  if (playlistId) {
    const videos = await getVideosFromPlaylist(playlistId, Math.min(perChannel, 50));
    return NextResponse.json(videos);
  }

  // Determine which channels to fetch
  let channelIds: string[] = [];

  if (channelId) {
    channelIds = [channelId];
  } else {
    const { data } = await supabaseServer
      .from("youtube_channels")
      .select("channel_id")
      .eq("user_id", user.id);
    channelIds = (data ?? []).map((r: { channel_id: string }) => r.channel_id);
  }

  if (channelIds.length === 0) return NextResponse.json([]);

  // Fetch videos from all channels in parallel (cap at 10 channels for quota)
  const capped = channelIds.slice(0, 10);
  const allVideos = await Promise.all(
    capped.map(async (cid) => {
      const uploadPid = await getUploadsPlaylistId(cid);
      if (!uploadPid) return [];
      return getVideosFromPlaylist(uploadPid, perChannel);
    }),
  );

  const merged = allVideos
    .flat()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return NextResponse.json(merged);
}
