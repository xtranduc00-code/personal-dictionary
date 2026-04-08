"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Plus, Trash2, X, Play, ExternalLink, Loader2, Youtube,
  RefreshCw, ChevronLeft, ChevronRight as ChevronRightIcon,
  Bookmark, BookmarkCheck, ListVideo,
  ChevronDown, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Search,
} from "lucide-react";
import { toast } from "react-toastify";
import {
  addToMyPlaylist, addYTChannel, addYTPlaylist, createMyPlaylist, deleteMyPlaylist,
  getChannelPlaylists, getMyPlaylistItems, getMyPlaylists, getYTChannels, getYTFeed,
  getYTLiveVideos, getYTPlaylists, getYTSavedVideos, removeYTChannel, removeYTPlaylist,
  removeYTSavedVideo, saveYTVideo,
  type MyPlaylist, type MyPlaylistItem, type YTChannel, type YTChannelPlaylist,
  type YTLiveVideo, type YTPlaylist, type YTSavedVideo, type YTVideo,
} from "@/lib/youtube-storage";
import { YouTubePlayer } from "@/components/youtube-player";
import { useYTPlayer, type YTQueueItem } from "@/lib/yt-player-context";

// ─── helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo === 1 ? "1 month ago" : `${mo} months ago`;
  const yr = Math.floor(mo / 12);
  return yr === 1 ? "1 year ago" : `${yr} years ago`;
}

function isVideoUrl(s: string) {
  return /youtu\.?be/.test(s) && (/watch\?v=/.test(s) || /youtu\.be\//.test(s));
}
function isPlaylistUrl(s: string) {
  // Don't treat "watch?v=...&list=..." as a playlist — that's a video with playlist context
  if (/watch\?v=/.test(s) || /youtu\.be\//.test(s)) return false;
  return /list=/.test(s) || /^(PL|OL|UU|FL|RD|LL|WL)[\w-]+$/.test(s.trim());
}

type View =
  | { type: "all" }
  | { type: "channel"; id: string }
  | { type: "playlist"; id: string }
  | { type: "saved" }
  | { type: "myPlaylist"; id: string };

// ─── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({
  video, saved, onPlay, onSave, onUnsave, onAddToPlaylist,
}: {
  video: YTVideo | YTSavedVideo | MyPlaylistItem;
  saved: boolean;
  onPlay: (v: YTVideo | YTSavedVideo | MyPlaylistItem) => void;
  onSave: (v: YTVideo | YTSavedVideo | MyPlaylistItem) => void;
  onUnsave: (videoId: string) => void;
  onAddToPlaylist: (v: YTVideo | YTSavedVideo | MyPlaylistItem) => void;
}) {
  const publishedAt = video.publishedAt;
  return (
    <div className="group relative rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
      <button onClick={() => onPlay(video)} className="w-full text-left">
        <div className="relative aspect-video w-full overflow-hidden">
          <Image
            src={video.thumbnail}
            alt={video.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <Play className="h-10 w-10 text-white fill-white drop-shadow-lg" />
          </div>
        </div>
        <div className="p-3 pr-8">
          <p
            title={video.title}
            className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug"
          >
            {video.title}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span title={video.channelTitle} className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {video.channelTitle}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
              {relativeTime(publishedAt)}
            </span>
          </div>
        </div>
      </button>
      {/* Action buttons */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={() => saved ? onUnsave(video.videoId) : onSave(video)}
          className="rounded-full bg-black/50 p-1.5 text-white hover:bg-black/80"
          title={saved ? "Remove from saved" : "Save video"}
        >
          {saved ? <BookmarkCheck className="h-3.5 w-3.5 text-yellow-400" /> : <Bookmark className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onAddToPlaylist(video)}
          className="rounded-full bg-black/50 p-1.5 text-white hover:bg-black/80"
          title="Add to my playlist"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// PlayerModal removed – replaced by inline YouTubePlayer layout

// ─── AddDialog ─────────────────────────────────────────────────────────────────

function AddDialog({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (input: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const hint = input.trim()
    ? isVideoUrl(input) ? "→ Save as Watch Later video"
      : isPlaylistUrl(input) ? "→ Add as Playlist"
        : "→ Add as Channel"
    : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    try { await onAdd(input.trim()); onClose(); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Add to library</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Channel URL · Playlist URL · Video URL
            </label>
            <input
              ref={ref}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="youtube.com/@channel  or  playlist?list=PL...  or  watch?v=..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
            {hint && (
              <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{hint}</p>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SidebarSection ────────────────────────────────────────────────────────────

function SidebarSection({ label, count, children, defaultOpen = true }: {
  label: string; count?: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      >
        <span>{label}{count !== undefined ? ` (${count})` : ""}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function VideosPage() {
  const ytCtx = useYTPlayer();
  const { setMuteAudio } = ytCtx;
  const [channels, setChannels] = useState<YTChannel[]>([]);
  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [savedVideos, setSavedVideos] = useState<YTSavedVideo[]>([]);
  const [view, setView] = useState<View>({ type: "all" });
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<YTVideo | YTSavedVideo | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YTVideo[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [browsingPlaylists, setBrowsingPlaylists] = useState<{ channelId: string; title: string } | null>(null);
  const [channelPlaylists, setChannelPlaylists] = useState<YTChannelPlaylist[]>([]);
  const [loadingChannelPlaylists, setLoadingChannelPlaylists] = useState(false);
  const [liveVideos, setLiveVideos] = useState<YTLiveVideo[]>([]);
  const [myPlaylists, setMyPlaylists] = useState<MyPlaylist[]>([]);
  const [myPlaylistItems, setMyPlaylistItems] = useState<MyPlaylistItem[]>([]);
  // Add-to-playlist modal state
  const [addToPlModal, setAddToPlModal] = useState<(YTVideo | YTSavedVideo | YTLiveVideo) | null>(null);
  const [newPlName, setNewPlName] = useState("");

  const [feedVersion, setFeedVersion] = useState(0);
  const [libCollapsed, setLibCollapsed] = useState(false);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [playerMinimized, setPlayerMinimized] = useState(false);

  const savedIds = new Set(savedVideos.map((v) => v.videoId));

  // Mute dock when inline full player is active; unmute otherwise
  useEffect(() => {
    setMuteAudio(!!playingVideo && !playerMinimized);
  }, [playingVideo, playerMinimized, setMuteAudio]);

  // Unmute dock when leaving the page
  useEffect(() => {
    return () => { setMuteAudio(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([getYTChannels(), getYTPlaylists(), getYTSavedVideos(), getMyPlaylists()])
      .then(([ch, pl, sv, mp]) => { setChannels(ch); setPlaylists(pl); setSavedVideos(sv); setMyPlaylists(mp); })
      .catch(() => toast.error("Failed to load library"))
      .finally(() => setLoadingInit(false));
  }, []);

  // Feed load based on view
  useEffect(() => {
    if (view.type === "saved") {
      setLiveVideos([]);
      setVideos([]);
      return;
    }
    if (view.type === "myPlaylist") {
      setLiveVideos([]);
      setVideos([]);
      setLoadingFeed(true);
      setMyPlaylistItems([]);
      getMyPlaylistItems(view.id)
        .then(setMyPlaylistItems)
        .catch(() => toast.error("Failed to load playlist"))
        .finally(() => setLoadingFeed(false));
      return;
    }
    let cancelled = false;
    setLoadingFeed(true);
    setVideos([]);
    setLiveVideos([]);

    const opts =
      view.type === "channel" ? { channelId: view.id, per: 20 }
      : view.type === "playlist" ? { playlistId: view.id, per: 50 }
      : { per: 20 };

    const isLivable = view.type === "channel" || view.type === "all";
    const channelIdForLive = view.type === "channel" ? view.id : undefined;

    Promise.all([
      getYTFeed(opts),
      isLivable ? getYTLiveVideos(channelIdForLive).catch(() => []) : Promise.resolve([]),
    ]).then(([vids, live]) => {
      if (cancelled) return;
      setVideos(vids);
      setLiveVideos(live as YTLiveVideo[]);
    }).catch(() => {
      if (!cancelled) toast.error("Failed to load videos");
    }).finally(() => {
      if (!cancelled) setLoadingFeed(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(view), feedVersion]);

  async function handleAdd(input: string) {
    try {
      if (isVideoUrl(input)) {
        const v = await saveYTVideo(input);
        setSavedVideos((prev) => [v, ...prev]);
        toast.success("Video saved");
      } else if (isPlaylistUrl(input)) {
        const pl = await addYTPlaylist(input);
        setPlaylists((prev) => [pl, ...prev]);
        toast.success(`Playlist added: ${pl.title}`);
      } else {
        const ch = await addYTChannel(input);
        setChannels((prev) => [ch, ...prev]);
        toast.success(`Channel added: ${ch.title}`);
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to add");
      throw e;
    }
  }

  async function handleSaveVideo(video: YTVideo | YTSavedVideo) {
    try {
      const url = `https://www.youtube.com/watch?v=${video.videoId}`;
      const sv = await saveYTVideo(url);
      setSavedVideos((prev) => [sv, ...prev]);
      toast.success("Video saved");
    } catch { toast.error("Failed to save"); }
  }

  async function handleUnsaveVideo(videoId: string) {
    try {
      await removeYTSavedVideo(videoId);
      setSavedVideos((prev) => prev.filter((v) => v.videoId !== videoId));
      toast.success("Removed from saved");
    } catch { toast.error("Failed to remove"); }
  }

  function toQueueItem(v: YTVideo | YTSavedVideo | YTLiveVideo | MyPlaylistItem): YTQueueItem {
    return {
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail,
      channelTitle: v.channelTitle,
      publishedAt: "publishedAt" in v ? v.publishedAt : undefined,
    };
  }

  function handlePlayVideo(v: YTVideo | YTSavedVideo | MyPlaylistItem) {
    setPlayerMinimized(false);
    setPlayingVideo(v as YTVideo | YTSavedVideo);
    // Build queue from current displayed videos so dock can advance
    const allItems: (YTVideo | YTSavedVideo | MyPlaylistItem)[] =
      view.type === "saved" ? savedVideos
      : view.type === "myPlaylist" ? myPlaylistItems
      : videos;
    const queue = allItems.length > 0 ? allItems : [v];
    const idx = queue.findIndex((item) => item.videoId === v.videoId);
    ytCtx.play(toQueueItem(v), queue.map(toQueueItem), idx >= 0 ? idx : 0);
  }

  function selectView(v: View) {
    setView(v);
    setShowMobileSidebar(false);
    // Shrink to mini player instead of closing
    if (playingVideo) setPlayerMinimized(true);
  }

  async function handleSearch(q: string) {
    if (!q.trim()) return;
    const trimmed = q.trim();

    // Detect YouTube URLs and route through handleAdd instead of search
    if (isVideoUrl(trimmed) || isPlaylistUrl(trimmed) || /youtube\.com\/(channel\/|@|c\/)/.test(trimmed)) {
      setSearchLoading(true);
      try {
        await handleAdd(trimmed);
        setSearchQuery("");
        setSearchResults([]);
        setShowSearch(false);
      } catch { /* handleAdd already toasts */ }
      finally { setSearchLoading(false); }
      return;
    }

    setSearchLoading(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`, {
        headers: { Authorization: `Bearer ${(await import("@/lib/auth-context")).getAuthToken()}` },
      });
      const data = await res.json();
      if (res.ok) setSearchResults(data);
      else toast.error(data.error ?? "Search failed");
    } catch { toast.error("Search failed"); }
    finally { setSearchLoading(false); }
  }

  async function handleCreateMyPlaylist(name: string) {
    try {
      const pl = await createMyPlaylist(name);
      setMyPlaylists((prev) => [pl, ...prev]);
      return pl;
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to create playlist");
      throw e;
    }
  }

  async function handleAddToMyPlaylist(playlistId: string, video: YTVideo | YTSavedVideo | YTLiveVideo | MyPlaylistItem) {
    try {
      await addToMyPlaylist(playlistId, {
        videoId: video.videoId,
        title: video.title,
        thumbnail: video.thumbnail,
        channelTitle: video.channelTitle,
        publishedAt: "publishedAt" in video ? video.publishedAt : undefined,
      });
      toast.success("Added to playlist");
      setAddToPlModal(null);
      // Refresh if viewing that playlist
      if (view.type === "myPlaylist" && view.id === playlistId) {
        getMyPlaylistItems(playlistId).then(setMyPlaylistItems).catch(() => {});
      }
    } catch (e) {
      const msg = (e as Error).message ?? "Failed to add";
      if (msg === "Already in playlist") toast.warn("Already in this playlist");
      else toast.error(msg);
    }
  }

  async function openChannelPlaylists(ch: YTChannel) {
    setBrowsingPlaylists({ channelId: ch.channelId, title: ch.title });
    setChannelPlaylists([]);
    setLoadingChannelPlaylists(true);
    try {
      const pl = await getChannelPlaylists(ch.channelId);
      setChannelPlaylists(pl);
    } catch {
      toast.error("Failed to load playlists");
    } finally {
      setLoadingChannelPlaylists(false);
    }
  }

  async function handleAddChannelPlaylist(pl: YTChannelPlaylist) {
    try {
      const added = await addYTPlaylist(pl.playlistId);
      setPlaylists((prev) => {
        if (prev.find((p) => p.playlistId === added.playlistId)) return prev;
        return [added, ...prev];
      });
      toast.success(`Added: ${pl.title}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to add");
    }
  }

  function viewLabel() {
    if (view.type === "saved") return "Saved";
    if (view.type === "channel") return channels.find((c) => c.channelId === view.id)?.title ?? "Channel";
    if (view.type === "playlist") return playlists.find((p) => p.playlistId === view.id)?.title ?? "Playlist";
    if (view.type === "myPlaylist") return myPlaylists.find((p) => p.id === view.id)?.name ?? "My Playlist";
    return "All channels";
  }

  // ── displayed items ──────────────────────────────────────────────────────────
  const displayedVideos: (YTVideo | YTSavedVideo | MyPlaylistItem)[] =
    view.type === "saved" ? savedVideos
    : view.type === "myPlaylist" ? myPlaylistItems
    : videos;

  // ── sidebar content ──────────────────────────────────────────────────────────
  const navBtn = (active: boolean) =>
    `flex-1 flex items-center gap-3 px-4 py-2 text-sm transition-colors min-w-0 ${
      active
        ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-medium"
        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    }`;

  const SidebarContent = () => (
    <>
      {/* All channels */}
      <button
        onClick={() => selectView({ type: "all" })}
        className={`w-full ${navBtn(view.type === "all")} py-2.5`}
      >
        <Youtube className="h-4 w-4 shrink-0" />
        All channels
      </button>

      {/* ── MY PLAYLISTS ── Watch Later pinned + custom */}
      <SidebarSection label="My Playlists" defaultOpen>
        {/* Watch Later (= Saved) */}
        <button
          onClick={() => selectView({ type: "saved" })}
          className={`w-full ${navBtn(view.type === "saved")}`}
        >
          <Bookmark className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="truncate text-xs font-medium">Watch Later</span>
          {savedVideos.length > 0 && (
            <span className="ml-auto text-[10px] bg-zinc-200 dark:bg-zinc-700 rounded-full px-1.5 py-0.5">
              {savedVideos.length}
            </span>
          )}
        </button>

        {/* Custom playlists */}
        {myPlaylists.map((pl) => (
          <div key={pl.id} className="group flex items-center">
            <button
              onClick={() => selectView({ type: "myPlaylist", id: pl.id })}
              className={navBtn(view.type === "myPlaylist" && view.id === pl.id)}
            >
              <ListVideo className="h-4 w-4 shrink-0 text-red-400" />
              <span className="truncate text-xs font-medium">{pl.name}</span>
            </button>
            <button
              onClick={async () => {
                await deleteMyPlaylist(pl.id).catch(() => toast.error("Failed"));
                setMyPlaylists((p) => p.filter((x) => x.id !== pl.id));
                if (view.type === "myPlaylist" && view.id === pl.id) setView({ type: "all" });
              }}
              className="mr-2 rounded p-1 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {/* New playlist */}
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New playlist
        </button>
      </SidebarSection>

      {/* ── CHANNELS ── */}
      <SidebarSection label="Channels" count={channels.length}>
        {loadingInit ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-zinc-400" /></div>
        ) : channels.length === 0 ? (
          <p className="px-4 py-2 text-xs text-zinc-400">No channels yet</p>
        ) : (
          channels.map((ch) => (
            <div key={ch.channelId} className="group flex items-center">
              <button
                onClick={() => selectView({ type: "channel", id: ch.channelId })}
                className={navBtn(view.type === "channel" && view.id === ch.channelId)}
              >
                {ch.thumbnail ? (
                  <Image src={ch.thumbnail} alt={ch.title} width={20} height={20} className="rounded-full shrink-0 object-cover" unoptimized />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-zinc-300 dark:bg-zinc-600 shrink-0" />
                )}
                <span className="truncate">{ch.title}</span>
              </button>
              <button onClick={() => openChannelPlaylists(ch)} title="Browse playlists"
                className="rounded p-1 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all">
                <ListVideo className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={async () => {
                  await removeYTChannel(ch.channelId).catch(() => toast.error("Failed"));
                  setChannels((p) => p.filter((c) => c.channelId !== ch.channelId));
                  if (view.type === "channel" && view.id === ch.channelId) setView({ type: "all" });
                  setFeedVersion((v) => v + 1);
                }}
                className="mr-2 rounded p-1 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </SidebarSection>

      {/* ── YT PLAYLISTS ── only show when non-empty */}
      {playlists.length > 0 && (
        <SidebarSection label="YT Playlists" count={playlists.length} defaultOpen>
          {playlists.map((pl) => (
            <div key={pl.playlistId} className="group flex items-center">
              <button
                onClick={() => selectView({ type: "playlist", id: pl.playlistId })}
                className={navBtn(view.type === "playlist" && view.id === pl.playlistId)}
              >
                <ListVideo className="h-4 w-4 shrink-0 opacity-50" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium leading-tight">{pl.title}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{pl.channelTitle} · {pl.videoCount}v</p>
                </div>
              </button>
              <button
                onClick={async () => {
                  await removeYTPlaylist(pl.playlistId).catch(() => toast.error("Failed"));
                  setPlaylists((p) => p.filter((x) => x.playlistId !== pl.playlistId));
                  if (view.type === "playlist" && view.id === pl.playlistId) setView({ type: "all" });
                }}
                className="mr-2 rounded p-1 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </SidebarSection>
      )}
    </>
  );

  return (
    <>
      <div className="flex h-full min-h-0 w-full">
        {/* Desktop sidebar */}
        <aside className={`hidden md:flex shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 transition-[width] duration-200 overflow-hidden ${libCollapsed ? "w-10" : "w-64"}`}>
          <div className="flex items-center justify-between px-2 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            {!libCollapsed && (
              <span className="pl-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Library</span>
            )}
            <div className={`flex items-center gap-1 ${libCollapsed ? "w-full justify-center" : "ml-auto"}`}>
              {!libCollapsed && (
                <button
                  onClick={() => setShowAddDialog(true)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Add channel / playlist / video"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setLibCollapsed((v) => !v)}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title={libCollapsed ? "Expand library" : "Collapse library"}
              >
                {libCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {!libCollapsed && (
            <nav className="flex-1 overflow-y-auto py-1">
              <SidebarContent />
            </nav>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="md:hidden rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors mr-1"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Youtube className="h-5 w-5 text-red-500 shrink-0" />
              <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {viewLabel()}
              </h1>
              {!loadingFeed && displayedVideos.length > 0 && (
                <span className="hidden md:block text-xs text-zinc-400">{displayedVideos.length} videos</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Search YouTube"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView((v) => ({ ...v }))}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowAddDialog(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Content: player + queue OR grid */}
          {/* Mini PiP player — stays mounted so iframe keeps playing */}
          {playingVideo && playerMinimized && (
            <div className="fixed bottom-5 right-5 z-30 w-72 rounded-xl overflow-hidden shadow-2xl ring-1 ring-black/20 dark:ring-white/10 bg-zinc-900 flex flex-col">
              {/* Player area */}
              <div className="relative aspect-video w-full">
                <YouTubePlayer
                  videoId={playingVideo.videoId}
                  title={playingVideo.title}
                  channelTitle={playingVideo.channelTitle}
                  publishedAt={"publishedAt" in playingVideo ? playingVideo.publishedAt : undefined}
                  onClose={() => { setPlayingVideo(null); setPlayerMinimized(false); }}
                  onAddToPlaylist={() => setAddToPlModal(playingVideo)}
                />
              </div>
              {/* Always-visible bottom bar */}
              <div className="flex items-center gap-2 bg-zinc-900 px-2.5 py-1.5">
                <p className="flex-1 min-w-0 text-[11px] font-medium text-zinc-200 truncate">
                  {playingVideo.title}
                </p>
                <button
                  onClick={() => setPlayerMinimized(false)}
                  className="shrink-0 rounded-md bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-white transition-colors"
                  title="Expand player"
                >
                  ↗ Mở rộng
                </button>
                <button
                  onClick={() => { setPlayingVideo(null); setPlayerMinimized(false); }}
                  className="shrink-0 rounded-md bg-zinc-700 hover:bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 hover:text-white transition-colors"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {playingVideo && !playerMinimized ? (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              {/* Player */}
              <div className="lg:flex-1 min-h-0 flex flex-col p-3">
                <YouTubePlayer
                  videoId={playingVideo.videoId}
                  title={playingVideo.title}
                  channelTitle={playingVideo.channelTitle}
                  publishedAt={"publishedAt" in playingVideo ? playingVideo.publishedAt : undefined}
                  onClose={() => setPlayingVideo(null)}
                  onAddToPlaylist={() => setAddToPlModal(playingVideo)}
                />
                <a
                  href={`https://www.youtube.com/watch?v=${playingVideo.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors self-end"
                >
                  <ExternalLink className="h-3 w-3" /> Open on YouTube
                </a>
              </div>
              {/* Queue */}
              <div className={`shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 flex flex-col transition-[width] duration-200 overflow-hidden ${queueCollapsed ? "lg:w-10" : "lg:w-72 xl:w-80"}`}>
                <div className="flex items-center justify-between px-2 py-2 sticky top-0 bg-white dark:bg-zinc-950 z-10 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                  {!queueCollapsed && (
                    <span className="pl-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Up next</span>
                  )}
                  <button
                    onClick={() => setQueueCollapsed((v) => !v)}
                    className={`rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${queueCollapsed ? "mx-auto" : "ml-auto"}`}
                    title={queueCollapsed ? "Expand queue" : "Collapse queue"}
                  >
                    {queueCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                  </button>
                </div>
                {!queueCollapsed && (loadingFeed ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
                ) : (
                  <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 px-2 pb-4 pt-1">
                    {displayedVideos.filter((v) => v.videoId !== playingVideo.videoId).map((v) => (
                      <button
                        key={v.videoId}
                        onClick={() => handlePlayVideo(v)}
                        className="flex items-start gap-2.5 rounded-lg p-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <div className="relative shrink-0 w-28 aspect-video rounded overflow-hidden bg-zinc-200 dark:bg-zinc-700">
                          <Image src={v.thumbnail} alt={v.title} fill sizes="112px" className="object-cover" unoptimized />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/30 transition-opacity">
                            <Play className="h-5 w-5 text-white fill-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p title={v.title} className="text-xs font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">{v.title}</p>
                          <p className="mt-0.5 text-[10px] text-zinc-400 truncate">{v.channelTitle}</p>
                          <p className="text-[10px] text-zinc-400">{relativeTime(v.publishedAt)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {loadingFeed ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-7 w-7 animate-spin text-zinc-400" />
                </div>
              ) : displayedVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Youtube className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mb-3" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {view.type === "saved"
                      ? "No saved videos yet. Hover a video and click the bookmark icon."
                      : channels.length === 0 && playlists.length === 0
                        ? "Add a channel, playlist, or video to get started"
                        : "No videos found"}
                  </p>
                  <button
                    onClick={() => setShowAddDialog(true)}
                    className="mt-4 flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add to library
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Live section */}
                  {liveVideos.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          LIVE NOW
                        </span>
                        <span className="text-xs text-zinc-400">{liveVideos.length} stream{liveVideos.length > 1 ? "s" : ""}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {liveVideos.map((v) => (
                          <div key={v.videoId} className="relative">
                            <VideoCard
                              video={v}
                              saved={savedIds.has(v.videoId)}
                              onPlay={(x) => handlePlayVideo(x)}
                              onSave={handleSaveVideo}
                              onUnsave={handleUnsaveVideo}
                              onAddToPlaylist={setAddToPlModal}
                            />
                            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white pointer-events-none">
                              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                              LIVE
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Regular videos */}
                  {displayedVideos.length > 0 && (
                    <div>
                      {liveVideos.length > 0 && (
                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Recent videos</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {displayedVideos.map((v) => (
                          <VideoCard
                            key={v.videoId}
                            video={v}
                            saved={savedIds.has(v.videoId)}
                            onPlay={handlePlayVideo}
                            onSave={handleSaveVideo}
                            onUnsave={handleUnsaveVideo}
                            onAddToPlaylist={setAddToPlModal}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Mobile sidebar sheet */}
        {showMobileSidebar && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setShowMobileSidebar(false)}>
            <div
              className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-zinc-900 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-sm font-semibold">Library</span>
                <button onClick={() => setShowMobileSidebar(false)}><X className="h-4 w-4 text-zinc-400" /></button>
              </div>
              <nav className="flex-1 overflow-y-auto py-1"><SidebarContent /></nav>
            </div>
          </div>
        )}
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowSearch(false)}>
          <div className="ml-auto h-full w-full max-w-lg bg-white dark:bg-zinc-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              {searchLoading
                ? <Loader2 className="h-4 w-4 text-zinc-400 shrink-0 animate-spin" />
                : <Search className="h-4 w-4 text-zinc-400 shrink-0" />}
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setSearchQuery(q);
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  if (q.trim().length < 2) { setSearchResults([]); return; }
                  searchDebounceRef.current = setTimeout(() => handleSearch(q), 450);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                    handleSearch(searchQuery);
                  }
                }}
                placeholder="Search or paste YouTube URL…"
                className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchResults([]); }}>
                  <X className="h-4 w-4 text-zinc-400 hover:text-zinc-600" />
                </button>
              )}
              <button onClick={() => setShowSearch(false)} className="ml-1 text-zinc-400 hover:text-zinc-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {searchLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                  <Search className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">{searchQuery ? "No results" : "Type to search"}</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {searchResults.map((v) => (
                    <div key={v.videoId} className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group">
                      <button
                        onClick={() => { handlePlayVideo(v); setShowSearch(false); }}
                        className="relative shrink-0 w-32 aspect-video rounded overflow-hidden bg-zinc-200 dark:bg-zinc-700"
                      >
                        <Image src={v.thumbnail} alt={v.title} fill sizes="128px" className="object-cover" unoptimized />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
                          <Play className="h-6 w-6 text-white fill-white" />
                        </div>
                        {"liveBroadcastContent" in v && (v as { liveBroadcastContent: string }).liveBroadcastContent === "live" && (
                          <span className="absolute bottom-1 left-1 rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold text-white">LIVE</span>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => { handlePlayVideo(v); setShowSearch(false); }}
                          className="text-left"
                        >
                          <p title={v.title} className="text-xs font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">{v.title}</p>
                          <p className="mt-0.5 text-[10px] text-zinc-400 truncate">{v.channelTitle}</p>
                          <p className="text-[10px] text-zinc-400">{relativeTime(v.publishedAt)}</p>
                        </button>
                        <div className="mt-2 flex gap-1">
                          <button
                            onClick={() => setAddToPlModal(v)}
                            title="Add to playlist"
                            className="rounded p-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <ListVideo className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleSaveVideo(v)}
                            title="Save video"
                            className="rounded p-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <Bookmark className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add to my playlist modal */}
      {addToPlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAddToPlModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add to playlist</h2>
              <button onClick={() => setAddToPlModal(null)}><X className="h-4 w-4 text-zinc-400" /></button>
            </div>
            <p title={addToPlModal.title} className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 truncate">{addToPlModal.title}</p>
            {myPlaylists.length > 0 ? (
              <div className="flex flex-col gap-1 mb-4 max-h-52 overflow-y-auto -mx-1 px-1">
                {myPlaylists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => handleAddToMyPlaylist(pl.id, addToPlModal)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <ListVideo className="h-4 w-4 text-red-400 shrink-0" />
                    <span className="truncate text-zinc-800 dark:text-zinc-200">{pl.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 mb-4">No playlists yet. Create one below.</p>
            )}
            <div className="flex gap-2">
              <input
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && newPlName.trim()) {
                    const pl = await handleCreateMyPlaylist(newPlName.trim());
                    setNewPlName("");
                    handleAddToMyPlaylist(pl.id, addToPlModal);
                  }
                }}
                placeholder="New playlist name…"
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
              />
              <button
                disabled={!newPlName.trim()}
                onClick={async () => {
                  if (!newPlName.trim()) return;
                  const pl = await handleCreateMyPlaylist(newPlName.trim());
                  setNewPlName("");
                  handleAddToMyPlaylist(pl.id, addToPlModal);
                }}
                className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                Create & Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddDialog && <AddDialog onClose={() => setShowAddDialog(false)} onAdd={handleAdd} />}

      {/* Channel playlists browser */}
      {browsingPlaylists && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setBrowsingPlaylists(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {browsingPlaylists.title} — Playlists
              </h2>
              <button onClick={() => setBrowsingPlaylists(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingChannelPlaylists ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              ) : channelPlaylists.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-12">No public playlists found</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {channelPlaylists.map((pl) => {
                    const alreadyAdded = playlists.some((p) => p.playlistId === pl.playlistId);
                    return (
                      <div
                        key={pl.playlistId}
                        className="flex items-start gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3"
                      >
                        {pl.thumbnail && (
                          <div className="relative shrink-0 w-24 aspect-video rounded overflow-hidden bg-zinc-200 dark:bg-zinc-700">
                            <Image src={pl.thumbnail} alt={pl.title} fill sizes="96px" className="object-cover" unoptimized />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">{pl.title}</p>
                          <p className="mt-0.5 text-[10px] text-zinc-400">{pl.videoCount} videos</p>
                          <div className="mt-2 flex gap-1.5">
                            <button
                              onClick={() => {
                                setBrowsingPlaylists(null);
                                selectView({ type: "playlist", id: pl.playlistId });
                                if (!alreadyAdded) handleAddChannelPlaylist(pl);
                              }}
                              className="rounded-md bg-zinc-900 dark:bg-white px-2.5 py-1 text-[10px] font-medium text-white dark:text-zinc-900 hover:opacity-80 transition-opacity"
                            >
                              Watch
                            </button>
                            {!alreadyAdded ? (
                              <button
                                onClick={() => handleAddChannelPlaylist(pl)}
                                className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2.5 py-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                              >
                                + Save
                              </button>
                            ) : (
                              <span className="rounded-md border border-green-200 dark:border-green-800 px-2.5 py-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                                Saved ✓
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
