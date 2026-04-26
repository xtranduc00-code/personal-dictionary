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

async function getVideosFromPlaylist(
  playlistId: string,
  maxResults: number,
  pageToken?: string,
): Promise<{ items: YTVideo[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    part: "snippet",
    playlistId,
    maxResults: String(maxResults),
    key: YT_KEY!,
  });
  if (pageToken) params.set("pageToken", pageToken);
  const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
  if (!res.ok) return { items: [] };
  const json = await res.json();
  const items: YTVideo[] = (json?.items ?? []).map((item: Record<string, unknown>) => {
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
  return { items, nextPageToken: json?.nextPageToken };
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!YT_KEY)
    return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  const playlistId = searchParams.get("playlistId");
  const pageToken = searchParams.get("pageToken") ?? undefined;
  // YouTube playlistItems caps at 50 per page; for the merged "all channels"
  // view we still want a small per-channel slice so the homepage feed loads fast.
  const perChannel = Math.min(Number(searchParams.get("per") ?? "10"), 50);

  // Direct playlist fetch — paged response so the client can "Load more".
  if (playlistId) {
    const page = await getVideosFromPlaylist(playlistId, perChannel, pageToken);
    return NextResponse.json(page);
  }

  // Single channel — paged response.
  if (channelId) {
    const uploadPid = await getUploadsPlaylistId(channelId);
    if (!uploadPid) return NextResponse.json({ items: [], nextPageToken: undefined });
    const page = await getVideosFromPlaylist(uploadPid, perChannel, pageToken);
    return NextResponse.json(page);
  }

  // Merged "all channels" view — array response (no pagination across channels).
  const { data } = await supabaseServer
    .from("youtube_channels")
    .select("channel_id")
    .eq("user_id", user.id);
  const channelIds = (data ?? []).map((r: { channel_id: string }) => r.channel_id);

  if (channelIds.length === 0) return NextResponse.json([]);

  // Cap channels at 10 for quota, take a small slice from each.
  const capped = channelIds.slice(0, 10);
  const allVideos = await Promise.all(
    capped.map(async (cid) => {
      const uploadPid = await getUploadsPlaylistId(cid);
      if (!uploadPid) return [];
      const { items } = await getVideosFromPlaylist(uploadPid, Math.min(perChannel, 20));
      return items;
    }),
  );

  const merged = allVideos
    .flat()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return NextResponse.json(merged);
}
