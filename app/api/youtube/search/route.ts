import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";

const YT_KEY = process.env.YOUTUBE_API_KEY;

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!YT_KEY)
    return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  const params = new URLSearchParams({
    part: "snippet",
    q,
    type: "video",
    maxResults: "20",
    key: YT_KEY,
  });

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) return NextResponse.json({ error: "YouTube API error" }, { status: 502 });

  const json = await res.json();
  const items = (json?.items ?? []).map((item: Record<string, unknown>) => {
    const id = item.id as Record<string, string>;
    const snippet = item.snippet as Record<string, unknown>;
    const thumbnails = snippet.thumbnails as Record<string, { url: string }>;
    return {
      videoId: id.videoId,
      title: snippet.title as string,
      thumbnail: thumbnails?.medium?.url ?? thumbnails?.default?.url ?? "",
      channelTitle: snippet.channelTitle as string,
      channelId: snippet.channelId as string,
      publishedAt: snippet.publishedAt as string,
      liveBroadcastContent: snippet.liveBroadcastContent as string,
    };
  }).filter((v: { videoId: string }) => v.videoId); // filter out channel/playlist results

  return NextResponse.json(items);
}
