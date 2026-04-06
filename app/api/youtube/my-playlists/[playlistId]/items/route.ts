import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";

type Params = { params: Promise<{ playlistId: string }> };

export async function GET(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { playlistId } = await params;

  const { data, error } = await supabaseServer
    .from("youtube_my_playlist_items")
    .select("video_id,title,thumbnail,channel_title,published_at,added_at,position")
    .eq("user_id", user.id)
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { playlistId } = await params;

  let body: { videoId?: string; title?: string; thumbnail?: string; channelTitle?: string; publishedAt?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  // Check for duplicate
  const { data: dup } = await supabaseServer
    .from("youtube_my_playlist_items")
    .select("video_id, position")
    .eq("user_id", user.id)
    .eq("playlist_id", playlistId)
    .eq("video_id", body.videoId)
    .maybeSingle();

  if (dup) {
    return NextResponse.json({ error: "Already in playlist" }, { status: 409 });
  }

  // Get max position for new item
  const { data: last } = await supabaseServer
    .from("youtube_my_playlist_items")
    .select("position")
    .eq("user_id", user.id)
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const newPosition = ((last?.position as number) ?? -1) + 1;

  const { error } = await supabaseServer
    .from("youtube_my_playlist_items")
    .insert({
      user_id: user.id,
      playlist_id: playlistId,
      video_id: body.videoId,
      title: body.title ?? "",
      thumbnail: body.thumbnail ?? "",
      channel_title: body.channelTitle ?? "",
      published_at: body.publishedAt ?? null,
      position: newPosition,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { playlistId } = await params;

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("youtube_my_playlist_items")
    .delete()
    .eq("user_id", user.id)
    .eq("playlist_id", playlistId)
    .eq("video_id", videoId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
