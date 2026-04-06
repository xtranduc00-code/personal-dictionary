import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";

const YT_KEY = process.env.YOUTUBE_API_KEY;

export type ChannelPlaylistItem = {
  playlistId: string;
  title: string;
  thumbnail: string;
  videoCount: number;
  updatedAt: string;
};

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!YT_KEY)
    return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    channelId,
    maxResults: "50",
    key: YT_KEY,
  });

  const res = await fetch(`https://www.googleapis.com/youtube/v3/playlists?${params}`);
  if (!res.ok) return NextResponse.json({ error: "YouTube API error" }, { status: 502 });

  const json = await res.json();
  const items: ChannelPlaylistItem[] = (json?.items ?? []).map(
    (item: Record<string, unknown>) => {
      const snippet = item.snippet as Record<string, unknown>;
      const contentDetails = item.contentDetails as Record<string, unknown>;
      const thumbnails = snippet.thumbnails as Record<string, { url: string }>;
      return {
        playlistId: item.id as string,
        title: snippet.title as string,
        thumbnail: thumbnails?.medium?.url ?? thumbnails?.default?.url ?? "",
        videoCount: (contentDetails?.itemCount as number) ?? 0,
        updatedAt: (snippet.publishedAt as string) ?? "",
      };
    },
  );

  return NextResponse.json(items);
}
