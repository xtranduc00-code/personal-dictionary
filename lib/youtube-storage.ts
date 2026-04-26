"use client";
import { authFetch } from "@/lib/auth-context";

export type YTChannel = {
  channelId: string;
  title: string;
  thumbnail: string;
  handle: string;
  addedAt: string;
};

export type YTPlaylist = {
  playlistId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  videoCount: number;
  addedAt: string;
};

export type YTSavedVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelId?: string;
  channelTitle: string;
  publishedAt: string;
  addedAt: string;
};

export type YTVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
};

const BASE = "/api/youtube";

async function getJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Request failed");
  return data as T;
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export async function getYTChannels(): Promise<YTChannel[]> {
  const res = await authFetch(`${BASE}/channels`);
  const data = await getJson<Array<{
    channel_id: string; title: string; thumbnail: string; handle: string; added_at: string;
  }>>(res);
  return data.map((r) => ({
    channelId: r.channel_id, title: r.title, thumbnail: r.thumbnail,
    handle: r.handle, addedAt: r.added_at,
  }));
}

export async function addYTChannel(query: string): Promise<YTChannel> {
  const res = await authFetch(`${BASE}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await getJson<{ channelId: string; title: string; thumbnail: string; handle: string }>(res);
  return { ...data, addedAt: new Date().toISOString() };
}

export async function removeYTChannel(channelId: string): Promise<void> {
  await getJson(await authFetch(`${BASE}/channels?channelId=${encodeURIComponent(channelId)}`, { method: "DELETE" }));
}

// ─── Playlists ─────────────────────────────────────────────────────────────────

export async function getYTPlaylists(): Promise<YTPlaylist[]> {
  const res = await authFetch(`${BASE}/playlists`);
  const data = await getJson<Array<{
    playlist_id: string; title: string; thumbnail: string;
    channel_title: string; video_count: number; added_at: string;
  }>>(res);
  return data.map((r) => ({
    playlistId: r.playlist_id, title: r.title, thumbnail: r.thumbnail,
    channelTitle: r.channel_title, videoCount: r.video_count, addedAt: r.added_at,
  }));
}

export async function addYTPlaylist(url: string): Promise<YTPlaylist> {
  const res = await authFetch(`${BASE}/playlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await getJson<{ playlistId: string; title: string; thumbnail: string; channelTitle: string; videoCount: number }>(res);
  return { ...data, addedAt: new Date().toISOString() };
}

export async function removeYTPlaylist(playlistId: string): Promise<void> {
  await getJson(await authFetch(`${BASE}/playlists?playlistId=${encodeURIComponent(playlistId)}`, { method: "DELETE" }));
}

// ─── Saved / Watch Later ──────────────────────────────────────────────────────

export async function getYTSavedVideos(): Promise<YTSavedVideo[]> {
  const res = await authFetch(`${BASE}/saved`);
  const data = await getJson<Array<{
    video_id: string; title: string; thumbnail: string;
    channel_id: string | null; channel_title: string; published_at: string; added_at: string;
  }>>(res);
  return data.map((r) => ({
    videoId: r.video_id, title: r.title, thumbnail: r.thumbnail,
    channelId: r.channel_id ?? undefined,
    channelTitle: r.channel_title, publishedAt: r.published_at, addedAt: r.added_at,
  }));
}

export async function saveYTVideo(url: string): Promise<YTSavedVideo> {
  const res = await authFetch(`${BASE}/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await getJson<{ videoId: string; title: string; thumbnail: string; channelId?: string; channelTitle: string; publishedAt: string }>(res);
  return { ...data, addedAt: new Date().toISOString() };
}

export async function removeYTSavedVideo(videoId: string): Promise<void> {
  await getJson(await authFetch(`${BASE}/saved?videoId=${encodeURIComponent(videoId)}`, { method: "DELETE" }));
}

// ─── My custom playlists ──────────────────────────────────────────────────────

export type MyPlaylist = {
  id: string;
  name: string;
  createdAt: string;
};

export type MyPlaylistItem = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  addedAt: string;
  position: number;
};

const MY_PL_BASE = "/api/youtube/my-playlists";

export async function getMyPlaylists(): Promise<MyPlaylist[]> {
  const res = await authFetch(MY_PL_BASE);
  const data = await getJson<Array<{ id: string; name: string; created_at: string }>>(res);
  return data.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
}

export async function createMyPlaylist(name: string): Promise<MyPlaylist> {
  const res = await authFetch(MY_PL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await getJson<{ id: string; name: string; created_at: string }>(res);
  return { id: data.id, name: data.name, createdAt: data.created_at };
}

export async function deleteMyPlaylist(id: string): Promise<void> {
  await getJson(await authFetch(`${MY_PL_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function getMyPlaylistItems(playlistId: string): Promise<MyPlaylistItem[]> {
  const res = await authFetch(`${MY_PL_BASE}/${encodeURIComponent(playlistId)}/items`);
  const data = await getJson<Array<{
    video_id: string; title: string; thumbnail: string;
    channel_title: string; published_at: string; added_at: string; position: number;
  }>>(res);
  return data.map((r) => ({
    videoId: r.video_id, title: r.title, thumbnail: r.thumbnail,
    channelTitle: r.channel_title, publishedAt: r.published_at,
    addedAt: r.added_at, position: r.position,
  }));
}

export async function addToMyPlaylist(
  playlistId: string,
  video: { videoId: string; title: string; thumbnail: string; channelTitle: string; publishedAt?: string },
): Promise<void> {
  await getJson(await authFetch(`${MY_PL_BASE}/${encodeURIComponent(playlistId)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(video),
  }));
}

export async function removeFromMyPlaylist(playlistId: string, videoId: string): Promise<void> {
  await getJson(await authFetch(
    `${MY_PL_BASE}/${encodeURIComponent(playlistId)}/items?videoId=${encodeURIComponent(videoId)}`,
    { method: "DELETE" },
  ));
}

// ─── Channel playlists browser ────────────────────────────────────────────────

export type YTChannelPlaylist = {
  playlistId: string;
  title: string;
  thumbnail: string;
  videoCount: number;
  updatedAt: string;
};

export async function getChannelPlaylists(channelId: string): Promise<YTChannelPlaylist[]> {
  const res = await authFetch(`/api/youtube/channel-playlists?channelId=${encodeURIComponent(channelId)}`);
  return getJson<YTChannelPlaylist[]>(res);
}

// ─── Live streams ─────────────────────────────────────────────────────────────

export type YTLiveVideo = YTVideo & { isLive: true };

export async function getYTLiveVideos(channelId?: string): Promise<YTLiveVideo[]> {
  const params = new URLSearchParams();
  if (channelId) params.set("channelId", channelId);
  const res = await authFetch(`/api/youtube/live?${params}`);
  return getJson<YTLiveVideo[]>(res);
}

// ─── Feed ──────────────────────────────────────────────────────────────────────

export async function getYTFeed(opts?: { channelId?: string; playlistId?: string; per?: number }): Promise<YTVideo[]> {
  const params = new URLSearchParams({ per: String(opts?.per ?? 12) });
  if (opts?.channelId) params.set("channelId", opts.channelId);
  if (opts?.playlistId) params.set("playlistId", opts.playlistId);
  const res = await authFetch(`${BASE}/feed?${params}`);
  const data = await getJson<YTVideo[] | { items: YTVideo[]; nextPageToken?: string }>(res);
  // Single-channel/playlist responses are paged; merged view is a flat array.
  return Array.isArray(data) ? data : data.items;
}

/** Paged variant for single-channel / single-playlist views. */
export async function getYTFeedPage(opts: {
  channelId?: string;
  playlistId?: string;
  per?: number;
  pageToken?: string;
}): Promise<{ items: YTVideo[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ per: String(opts.per ?? 50) });
  if (opts.channelId) params.set("channelId", opts.channelId);
  if (opts.playlistId) params.set("playlistId", opts.playlistId);
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  const res = await authFetch(`${BASE}/feed?${params}`);
  const data = await getJson<{ items: YTVideo[]; nextPageToken?: string }>(res);
  return data;
}
