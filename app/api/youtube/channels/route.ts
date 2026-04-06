import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";

const YT_KEY = process.env.YOUTUBE_API_KEY;

async function resolveChannelInfo(
  query: string,
): Promise<{ channelId: string; title: string; thumbnail: string; handle: string } | null> {
  if (!YT_KEY) return null;

  // Normalise: strip URL prefix, leading @
  let lookup = query.trim();
  const urlMatch = lookup.match(/youtube\.com\/(?:@|channel\/)([^/?&#]+)/);
  if (urlMatch) lookup = urlMatch[1];

  const isChannelId = /^UC[\w-]{22}$/.test(lookup);
  const handle = lookup.startsWith("@") ? lookup.slice(1) : lookup;

  const params = new URLSearchParams({ part: "snippet,contentDetails", key: YT_KEY });
  if (isChannelId) {
    params.set("id", lookup);
  } else {
    params.set("forHandle", handle);
  }

  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  const item = json?.items?.[0];
  if (!item) return null;

  return {
    channelId: item.id,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.default?.url ?? "",
    handle: item.snippet.customUrl ?? "",
  };
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("youtube_channels")
    .select("channel_id,title,thumbnail,handle,added_at")
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

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.query?.trim())
    return NextResponse.json({ error: "query is required" }, { status: 400 });

  const info = await resolveChannelInfo(body.query);
  if (!info) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const { error } = await supabaseServer.from("youtube_channels").upsert(
    {
      user_id: user.id,
      channel_id: info.channelId,
      title: info.title,
      thumbnail: info.thumbnail,
      handle: info.handle,
    },
    { onConflict: "user_id,channel_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(info);
}

export async function DELETE(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("youtube_channels")
    .delete()
    .eq("user_id", user.id)
    .eq("channel_id", channelId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
