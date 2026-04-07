"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { useRouter } from "next/navigation";
import {
  Clapperboard,
  FastForward,
  Film,
  Info,
  LogOut,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Rewind,
  Settings,
  Subtitles,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  type RemoteParticipant,
} from "livekit-client";
import { toast } from "react-toastify";
import { CallChatPanel } from "@/components/livekit/CallChatPanel";
import { MicLevelBars } from "@/components/livekit/MicLevelBars";
import { WatchPlaylistMenu, type WatchPlaylistClip } from "@/components/livekit/WatchPlaylistMenu";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, getAuthToken, useAuth } from "@/lib/auth-context";
import {
  applyRemoteVideoState,
  encodeWatchSync,
  isAllowedSyncedMediaUrl,
  parseWatchSync,
  WATCH_SYNC_TOPIC,
  type WatchSyncEnvelope,
} from "@/lib/watch-party-protocol";
import {
  applyRemoteYoutubeState,
  loadYoutubeIframeApi,
  parseYouTubeVideoId,
  YT_STATE_PAUSED,
  YT_STATE_PLAYING,
  type YtPlayerApi,
} from "@/lib/youtube-watch";
import { useMeetsLocalMicLevel } from "@/lib/use-meets-local-mic-level";
import { MEETS_LIVEKIT_ROOM_OPTIONS } from "@/lib/meets-livekit-options";

type SessionProps = {
  token: string;
  serverUrl: string;
  roomDisplayName: string;
};

const START_AUDIO_BTN_CLASS =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm";

const MOBILE_CHAT_DRAWER =
  "relative z-10 flex h-full w-[min(100%,320px)] flex-col border-l border-zinc-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]";

const WATCH_CHAT_DESKTOP =
  "hidden h-full min-h-0 w-full max-w-[min(280px,32vw)] shrink-0 flex-col overflow-hidden !rounded-lg border border-zinc-200 bg-white lg:flex";

type CloudUploadDraft = {
  url: string;
  key: string;
  suggestedTitle: string;
};

type SubtitleUploadDraft = {
    url: string;
    key: string;
    name: string;
};

function stripExt(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]{1,8}$/, "");
}

/** Presigned PUT must use the same Content-Type as in the signature (browser often sends octet-stream for mp4/mkv). */
function inferVideoContentTypeForPresign(file: File): string {
  if (file.type && file.type.startsWith("video/")) {
    return file.type;
  }
  if (/\.mkv$/i.test(file.name)) {
    return "video/x-matroska";
  }
  return file.type || "application/octet-stream";
}

export function WatchPartySession({
  token,
  serverUrl,
  roomDisplayName,
}: SessionProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio={false}
      video={false}
      options={MEETS_LIVEKIT_ROOM_OPTIONS}
      className="flex h-full min-h-0 w-full flex-1 flex-col text-zinc-900"
    >
      <WatchPartyInner roomDisplayName={roomDisplayName} />
    </LiveKitRoom>
  );
}

const SEEK_BROADCAST_MS = 220;
const WATCH_SKIP_SECONDS = 10;
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const QUALITY_OPTIONS: { key: string; label: string }[] = [
  { key: "hd2160", label: "2160p (4K)" },
  { key: "hd1440", label: "1440p (2K)" },
  { key: "hd1080", label: "1080p" },
  { key: "hd720", label: "720p" },
  { key: "large", label: "480p" },
  { key: "medium", label: "360p" },
  { key: "small", label: "240p" },
  { key: "tiny", label: "144p" },
  { key: "auto", label: "Auto" },
];

function getDocumentFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    null
  );
}

function shortWatchRoomDisplay(name: string): string {
  if (name.length <= 24) {
    return name;
  }
  return `${name.slice(0, 10)}…${name.slice(-8)}`;
}

function formatWatchTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) {
    return "0:00";
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function WatchPartyInner({ roomDisplayName }: { roomDisplayName: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [, bumpParticipantList] = useReducer((n: number) => n + 1, 0);
  const micLevel = useMeetsLocalMicLevel(isMicrophoneEnabled);
  const [chatOpen, setChatOpen] = useState(false);
  const [desktopChatOpen, setDesktopChatOpen] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cloudInputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const applyingRemote = useRef(false);
  const lastSeekBroadcast = useRef(0);
  const scrubbingRef = useRef(false);
  const pendingVideoUiTimeRef = useRef(0);
  const videoUiTimeRafRef = useRef<number | null>(null);
  const lastYtUiSampleRef = useRef(0);
  const lastYtDurationSampleRef = useRef(0);
  const uploadPctDedupeRef = useRef(-1);
  const subtitlePctDedupeRef = useRef(-1);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const [uiTime, setUiTime] = useState(0);
  const [scrubTime, setScrubTime] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [stageFullscreen, setStageFullscreen] = useState(false);
  const [showPartnerPlayBanner, setShowPartnerPlayBanner] = useState(false);
  const partnerPlayGateRef = useRef(false);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [youtubeUrlDraft, setYoutubeUrlDraft] = useState("");
  const [subtitleUrl, setSubtitleUrl] = useState<string>("");
  const [ytReady, setYtReady] = useState(false);
  const [fileDropActive, setFileDropActive] = useState(false);
  const ytPlayerRef = useRef<YtPlayerApi | null>(null);
  const youtubeIdRef = useRef<string | null>(null);
  const publishStateRef = useRef<() => Promise<void>>(async () => {});
  const volumeRef = useRef(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState("default");
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  type YoutubeSyncMsg = Extract<WatchSyncEnvelope, { kind: "state" }> & {
    source: "youtube";
    youtubeId: string;
  };
  const pendingYoutubeSyncRef = useRef<YoutubeSyncMsg | null>(null);
  const pendingFileSyncRef = useRef<{ currentTime: number; playing: boolean } | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [cloudDraft, setCloudDraft] = useState<CloudUploadDraft | null>(null);
  const [subtitleDraft, setSubtitleDraft] = useState<SubtitleUploadDraft | null>(null);
  const [subtitleUploading, setSubtitleUploading] = useState(false);
  const [subtitlePct, setSubtitlePct] = useState<number>(0);
  const [subtitleSearchOpen, setSubtitleSearchOpen] = useState(false);
  const [subtitleQuery, setSubtitleQuery] = useState("");
  const [subtitleSearching, setSubtitleSearching] = useState(false);
  const [subtitleResults, setSubtitleResults] = useState<
    { fileId: number; title: string; lang: string; downloads: number }[]
  >([]);

  const [debouncedSubtitleQuery] = useDebounce(subtitleQuery, 450);
  const [cloudFolder, setCloudFolder] = useState("General");
  const [cloudTitle, setCloudTitle] = useState("");
  const [cloudFolders, setCloudFolders] = useState<string[]>(["General"]);
  const [cloudSaving, setCloudSaving] = useState(false);

  useEffect(() => {
    youtubeIdRef.current = youtubeId;
  }, [youtubeId]);

  useEffect(() => {
    objectUrlRef.current = objectUrl;
  }, [objectUrl]);

  /** remoteParticipants is a mutating Map; subscribe so "n in call" updates when peers join/leave. */
  useEffect(() => {
    const onChange = () => bumpParticipantList();
    room.on(RoomEvent.ParticipantConnected, onChange);
    room.on(RoomEvent.ParticipantDisconnected, onChange);
    room.on(RoomEvent.ConnectionStateChanged, onChange);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onChange);
      room.off(RoomEvent.ParticipantDisconnected, onChange);
      room.off(RoomEvent.ConnectionStateChanged, onChange);
    };
  }, [room]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const scheduleVideoUiTime = useCallback((t: number) => {
    pendingVideoUiTimeRef.current = t;
    if (videoUiTimeRafRef.current != null) {
      return;
    }
    videoUiTimeRafRef.current = window.requestAnimationFrame(() => {
      videoUiTimeRafRef.current = null;
      if (!scrubbingRef.current) {
        setUiTime(pendingVideoUiTimeRef.current);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (videoUiTimeRafRef.current != null) {
        window.cancelAnimationFrame(videoUiTimeRafRef.current);
        videoUiTimeRafRef.current = null;
      }
    };
  }, []);

  const notifyRemotePlayBlocked = useCallback(() => {
    if (partnerPlayGateRef.current) {
      return;
    }
    partnerPlayGateRef.current = true;
    setShowPartnerPlayBanner(true);
    toast.info(t("watchPartnerPlayingTapPlay"), {
      toastId: "watch-partner-play",
      autoClose: 8000,
    });
  }, [t]);

  const clearPartnerPlayGate = useCallback(() => {
    partnerPlayGateRef.current = false;
    setShowPartnerPlayBanner(false);
  }, []);

  const publishState = useCallback(async () => {
    const lp = room.localParticipant;
    if (!lp || room.state !== ConnectionState.Connected) {
      return;
    }
    const yid = youtubeIdRef.current;
    const yp = ytPlayerRef.current;
    if (yid && yp) {
      let currentTime = 0;
      let playing = false;
      try {
        currentTime = yp.getCurrentTime();
        playing = yp.getPlayerState() === YT_STATE_PLAYING;
      } catch {
        return;
      }
      const msg: WatchSyncEnvelope = {
        v: 1,
        kind: "state",
        currentTime,
        playing,
        sentAt: Date.now(),
        source: "youtube",
        youtubeId: yid,
      };
      try {
        await lp.publishData(encodeWatchSync(msg), {
          reliable: true,
          topic: WATCH_SYNC_TOPIC,
        });
      } catch {
        /* ignore */
      }
      return;
    }
    const v = videoRef.current;
    if (!v?.src) {
      return;
    }
    const src = v.currentSrc || v.src;
    const msg: WatchSyncEnvelope = {
      v: 1,
      kind: "state",
      currentTime: v.currentTime,
      playing: !v.paused,
      sentAt: Date.now(),
      source: "file",
    };
    if (
      !src.startsWith("blob:")
      && (src.startsWith("https:")
        || src.startsWith("http://127.0.0.1")
        || src.startsWith("http://localhost"))
      && isAllowedSyncedMediaUrl(src)
    ) {
      msg.fileUrl = src;
      const su = subtitleUrl.trim();
      if (su && isAllowedSyncedMediaUrl(su)) {
        msg.subtitleUrl = su;
      }
    }
    try {
      await lp.publishData(encodeWatchSync(msg), {
        reliable: true,
        topic: WATCH_SYNC_TOPIC,
      });
    } catch {
      /* ignore */
    }
  }, [room, subtitleUrl]);

  useEffect(() => {
    publishStateRef.current = publishState;
  }, [publishState]);

  const publishRequest = useCallback(async () => {
    const lp = room.localParticipant;
    if (!lp || room.state !== ConnectionState.Connected) {
      return;
    }
    const msg: WatchSyncEnvelope = { v: 1, kind: "req", sentAt: Date.now() };
    try {
      await lp.publishData(encodeWatchSync(msg), {
        reliable: true,
        topic: WATCH_SYNC_TOPIC,
      });
    } catch {
      /* ignore */
    }
  }, [room]);

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: { identity: string } | undefined,
      _kind?: unknown,
      topic?: string,
    ) => {
      /** SDK / server có thể không gửi `topic`; chỉ bỏ qua khi topic khác hẳn gói sync của mình */
      if (topic != null && topic !== "" && topic !== WATCH_SYNC_TOPIC) {
        return;
      }
      if (
        !participant ||
        participant.identity === room.localParticipant.identity
      ) {
        return;
      }
      const msg = parseWatchSync(payload);
      if (!msg) {
        return;
      }
      if (msg.kind === "req") {
        void publishState();
        return;
      }
      if (msg.source === "youtube" && msg.youtubeId) {
        if (!msg.playing) {
          partnerPlayGateRef.current = false;
          setShowPartnerPlayBanner(false);
        }
        pendingYoutubeSyncRef.current = {
          v: 1,
          kind: "state",
          source: "youtube",
          youtubeId: msg.youtubeId,
          currentTime: msg.currentTime,
          playing: msg.playing,
          sentAt: msg.sentAt,
        };
        setObjectUrl((url) => {
          if (url && url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
          return null;
        });
        setYoutubeId((cur) => (cur === msg.youtubeId ? cur : msg.youtubeId!));
        queueMicrotask(() => {
          const p = ytPlayerRef.current;
          if (!p || youtubeIdRef.current !== msg.youtubeId) {
            return;
          }
          applyingRemote.current = true;
          try {
            applyRemoteYoutubeState(
              p,
              msg.currentTime,
              msg.playing,
              msg.playing ? notifyRemotePlayBlocked : undefined,
            );
          } finally {
            window.requestAnimationFrame(() => {
              applyingRemote.current = false;
            });
          }
        });
        return;
      }
      if (msg.kind === "state" && msg.source !== "youtube" && msg.fileUrl) {
        const url = msg.fileUrl;
        if (!isAllowedSyncedMediaUrl(url)) {
          return;
        }
        const sub =
          msg.subtitleUrl && isAllowedSyncedMediaUrl(msg.subtitleUrl)
            ? msg.subtitleUrl
            : "";
        pendingYoutubeSyncRef.current = null;
        setYoutubeId(null);
        if (objectUrlRef.current === url) {
          setSubtitleUrl((prev) => (prev === sub ? prev : sub));
          const v = videoRef.current;
          if (!msg.playing) {
            partnerPlayGateRef.current = false;
            setShowPartnerPlayBanner(false);
          }
          if (v?.src) {
            applyingRemote.current = true;
            try {
              applyRemoteVideoState(
                v,
                msg.currentTime,
                msg.playing,
                msg.playing ? notifyRemotePlayBlocked : undefined,
              );
            } finally {
              window.requestAnimationFrame(() => {
                applyingRemote.current = false;
              });
            }
          }
          return;
        }
        pendingFileSyncRef.current = {
          currentTime: msg.currentTime,
          playing: msg.playing,
        };
        setSubtitleUrl(sub);
        setObjectUrl((prev) => {
          if (prev === url) {
            return prev;
          }
          if (prev && prev.startsWith("blob:")) {
            URL.revokeObjectURL(prev);
          }
          return url;
        });
        return;
      }
      const v = videoRef.current;
      if (!v?.src) {
        return;
      }
      if (!msg.playing) {
        partnerPlayGateRef.current = false;
        setShowPartnerPlayBanner(false);
      }
      applyingRemote.current = true;
      try {
        applyRemoteVideoState(
          v,
          msg.currentTime,
          msg.playing,
          msg.playing ? notifyRemotePlayBlocked : undefined,
        );
      } finally {
        window.requestAnimationFrame(() => {
          applyingRemote.current = false;
        });
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, publishState, notifyRemotePlayBlocked]);

  useEffect(() => {
    const onParticipantConnected = (p: RemoteParticipant) => {
      const label = p.name?.trim() || p.identity || "?";
      toast.info(t("watchSomeoneJoined").replace("{name}", label), {
        toastId: `watch-join-${p.identity}`,
        autoClose: 4000,
      });
      void publishState();
    };
    const onParticipantDisconnected = (p: RemoteParticipant) => {
      const label = p.name?.trim() || p.identity || "?";
      toast.info(t("watchSomeoneLeft").replace("{name}", label), {
        toastId: `watch-leave-${p.identity}`,
        autoClose: 3000,
      });
    };
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    };
  }, [room, publishState, t]);

  useEffect(() => {
    const askPeers = () => {
      if (room.remoteParticipants.size > 0) {
        void publishRequest();
      }
    };
    room.on(RoomEvent.Connected, askPeers);
    if (room.state === ConnectionState.Connected) {
      askPeers();
    }
    return () => {
      room.off(RoomEvent.Connected, askPeers);
    };
  }, [room, publishRequest]);

  useEffect(() => {
    return () => {
      if (objectUrl && objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!objectUrl && !youtubeId) {
      setDuration(0);
      setUiTime(0);
      setScrubTime(0);
      setPlaying(false);
    }
  }, [objectUrl, youtubeId]);

  /** YouTube IFrame API — tạo / hủy player theo videoId (mount DOM cố định, tránh React removeChild vs iframe) */
  useEffect(() => {
    if (!youtubeId) {
      setYtReady(false);
      ytPlayerRef.current = null;
      lastYtUiSampleRef.current = 0;
      lastYtDurationSampleRef.current = 0;
      return;
    }
    let cancelled = false;
    const cleanupTarget = { current: null as YtPlayerApi | null };
    void (async () => {
      await loadYoutubeIframeApi();
      if (cancelled || typeof window === "undefined" || !window.YT?.Player) {
        return;
      }
      const host = ytHostRef.current;
      if (!host) {
        return;
      }
      const player = new window.YT.Player(host, {
        videoId: youtubeId,
        width: "100%",
        height: "100%",
        playerVars: {
          /** Ẩn UI mặc định — Watch Together dùng thanh điều khiển riêng */
          controls: 0,
          /** Ẩn nút fullscreen trong iframe (đã có expand ở custom bar) */
          fs: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
          /** Giảm phím tắt trong iframe; tránh focus UI phụ */
          disablekb: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) {
              return;
            }
            ytPlayerRef.current = e.target;
            setYtReady(true);
            try {
              const d = e.target.getDuration();
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
              }
              e.target.setVolume(volumeRef.current * 100);
              const qs = e.target.getAvailableQualityLevels();
              if (qs?.length) setAvailableQualities(qs);
            } catch {
              /* ignore */
            }
            const pending = pendingYoutubeSyncRef.current;
            if (
              pending &&
              pending.source === "youtube" &&
              pending.youtubeId === youtubeIdRef.current
            ) {
              applyingRemote.current = true;
              try {
                applyRemoteYoutubeState(
                  e.target,
                  pending.currentTime,
                  pending.playing,
                  pending.playing ? notifyRemotePlayBlocked : undefined,
                );
              } finally {
                window.requestAnimationFrame(() => {
                  applyingRemote.current = false;
                });
              }
              pendingYoutubeSyncRef.current = null;
            }
            void publishStateRef.current();
          },
          onStateChange: (ev) => {
            if (cancelled || applyingRemote.current) {
              return;
            }
            const st = ev.data;
            setPlaying(st === YT_STATE_PLAYING);
            if (st === YT_STATE_PLAYING) {
              clearPartnerPlayGate();
            }
            try {
              const qs = ev.target.getAvailableQualityLevels();
              if (qs?.length) setAvailableQualities(qs);
              setQuality(ev.target.getPlaybackQuality());
            } catch { /* ignore */ }
            if (st === YT_STATE_PLAYING || st === YT_STATE_PAUSED) {
              void publishStateRef.current();
            }
          },
        },
      });
      if (cancelled) {
        try {
          player.destroy();
        } catch {
          /* ignore */
        }
        return;
      }
      cleanupTarget.current = player;
    })();
    return () => {
      cancelled = true;
      setYtReady(false);
      ytPlayerRef.current = null;
      try {
        cleanupTarget.current?.destroy();
      } catch {
        /* ignore */
      }
      cleanupTarget.current = null;
    };
  }, [youtubeId, notifyRemotePlayBlocked, clearPartnerPlayGate]);

  /** Cập nhật thời gian / duration từ YouTube player */
  useEffect(() => {
    if (!youtubeId || !ytReady) {
      return;
    }
    const id = window.setInterval(() => {
      if (scrubbingRef.current || applyingRemote.current) {
        return;
      }
      const p = ytPlayerRef.current;
      if (!p) {
        return;
      }
      try {
        const ct = p.getCurrentTime();
        if (Math.abs(ct - lastYtUiSampleRef.current) >= 0.05) {
          lastYtUiSampleRef.current = ct;
          setUiTime(ct);
        }
        const dur = p.getDuration();
        if (
          Number.isFinite(dur)
          && dur > 0
          && Math.abs(dur - lastYtDurationSampleRef.current) > 0.25
        ) {
          lastYtDurationSampleRef.current = dur;
          setDuration(dur);
        }
      } catch {
        /* ignore */
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [youtubeId, ytReady]);

  /** Khi đã có nguồn phát và có người trong phòng — xin state để bắt kịp play/pause */
  useEffect(() => {
    if (room.state !== ConnectionState.Connected) {
      return;
    }
    if (room.remoteParticipants.size === 0) {
      return;
    }
    if (!objectUrl && !(youtubeId && ytReady)) {
      return;
    }
    const id = window.setTimeout(() => {
      void publishRequest();
    }, 400);
    return () => window.clearTimeout(id);
  }, [
    objectUrl,
    youtubeId,
    ytReady,
    room.state,
    room.remoteParticipants.size,
    publishRequest,
  ]);

  /** Heartbeat khi đang phát — tránh lỡ gói đồng bộ đầu tiên */
  useEffect(() => {
    if (!playing || room.state !== ConnectionState.Connected) {
      return;
    }
    if (room.remoteParticipants.size === 0) {
      return;
    }
    if (!objectUrl && !(youtubeId && ytReady)) {
      return;
    }
    const id = window.setInterval(() => {
      if (applyingRemote.current) {
        return;
      }
      void publishState();
    }, 8000);
    return () => window.clearInterval(id);
  }, [
    playing,
    objectUrl,
    youtubeId,
    ytReady,
    room.state,
    room.remoteParticipants.size,
    publishState,
  ]);

  /** Push https file URL + subtitles to peers even while paused (heartbeat only runs when playing). */
  useEffect(() => {
    if (room.state !== ConnectionState.Connected) {
      return;
    }
    if (room.remoteParticipants.size === 0) {
      return;
    }
    if (youtubeId) {
      return;
    }
    if (!objectUrl || objectUrl.startsWith("blob:")) {
      return;
    }
    if (!isAllowedSyncedMediaUrl(objectUrl)) {
      return;
    }
    const id = window.setTimeout(() => {
      void publishState();
    }, 250);
    return () => window.clearTimeout(id);
  }, [
    objectUrl,
    subtitleUrl,
    youtubeId,
    publishState,
    room.remoteParticipants.size,
    room.state,
  ]);

  const onLocalInteraction = useCallback(() => {
    if (applyingRemote.current) {
      return;
    }
    void publishState();
  }, [publishState]);

  const onSeeked = useCallback(() => {
    if (applyingRemote.current) {
      return;
    }
    const now = Date.now();
    if (now - lastSeekBroadcast.current < SEEK_BROADCAST_MS) {
      return;
    }
    lastSeekBroadcast.current = now;
    void publishState();
  }, [publishState]);

  const ingestPickedFile = useCallback((f: File | null) => {
    setYoutubeId(null);
    setSubtitleUrl("");
    if (
      f
      && room.state === ConnectionState.Connected
      && room.remoteParticipants.size > 0
    ) {
      toast.info(t("watchLocalFileNotSynced"), { autoClose: 7000 });
    }
    setObjectUrl((prev) => {
      if (prev && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      if (!f) {
        return null;
      }
      return URL.createObjectURL(f);
    });
  }, [room.remoteParticipants.size, room.state, t]);

  const ingestCloudUrl = useCallback((url: string) => {
    setYoutubeId(null);
    setYoutubeUrlDraft("");
    setObjectUrl((prev) => {
      if (prev && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    ingestPickedFile(f);
    e.target.value = "";
  };

  const onVideoDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setFileDropActive(true);
  }, []);

  const onVideoDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) {
      return;
    }
    setFileDropActive(false);
  }, []);

  const onVideoDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setFileDropActive(false);
      const f = e.dataTransfer.files?.[0];
      if (!f) {
        return;
      }
      const ok =
        f.type.startsWith("video/") ||
        /\.(mkv|webm|mp4|mov|m4v)$/i.test(f.name);
      if (!ok) {
        toast.error(t("watchDropInvalidType"));
        return;
      }
      ingestPickedFile(f);
    },
    [ingestPickedFile, t],
  );

  const loadYoutubeFromRaw = useCallback(
    (raw: string) => {
      const id = parseYouTubeVideoId(raw.trim());
      if (!id) {
        toast.error(t("watchYoutubeInvalidUrl"));
        return;
      }
            setSubtitleUrl("");
      if (objectUrl && objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
      setYoutubeUrlDraft("");
      setYoutubeId(id);
      const lp = room.localParticipant;
      if (lp && room.state === ConnectionState.Connected) {
        void (async () => {
          try {
            await lp.publishData(
              encodeWatchSync({
                v: 1,
                kind: "state",
                currentTime: 0,
                playing: false,
                sentAt: Date.now(),
                source: "youtube",
                youtubeId: id,
              }),
              { reliable: true, topic: WATCH_SYNC_TOPIC },
            );
          } catch {
            /* ignore */
          }
        })();
      }
    },
    [objectUrl, room, t],
  );

  const loadYoutubeFromDraft = useCallback(() => {
    loadYoutubeFromRaw(youtubeUrlDraft);
  }, [loadYoutubeFromRaw, youtubeUrlDraft]);

  const loadFromPlaylistUrl = useCallback(
        (clip: WatchPlaylistClip) => {
            const url = (clip.youtubeUrl || "").trim();
            const id = parseYouTubeVideoId(url);
      if (id) {
                setSubtitleUrl("");
                loadYoutubeFromRaw(url);
        return;
      }
            setSubtitleUrl((clip.subtitleUrl || "").trim());
            ingestCloudUrl(url);
    },
    [ingestCloudUrl, loadYoutubeFromRaw],
  );

  const leave = async () => {
    await room.disconnect();
    router.push("/watch");
  };

  const fetchCloudFolders = useCallback(async () => {
    try {
      const res = await authFetch("/api/watch-playlist");
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as { clips?: { folderName?: string }[] };
      const uniq = new Set<string>();
      uniq.add("General");
      for (const c of data.clips ?? []) {
        const f = typeof c.folderName === "string" ? c.folderName.trim() : "";
        if (f) {
          uniq.add(f);
        }
      }
      setCloudFolders([...uniq].sort((a, b) => a.localeCompare(b)));
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * Large videos cannot POST through Netlify (~6MB body limit at the edge → empty 400).
   * Presign on our API (small JSON), then PUT file bytes directly to R2. Subtitles stay on /api/r2/upload.
   */
  const startCloudUpload = useCallback(
    (file: File) => {
      if (!user) {
        toast.info(t("watchPlaylistLogin"));
        return;
      }
      setUploading(true);
      setUploadPct(0);
      uploadPctDedupeRef.current = -1;

      void (async () => {
        const contentType = inferVideoContentTypeForPresign(file);

        const presignRes = await authFetch("/api/r2/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType,
            size: file.size,
          }),
        });

        if (!presignRes.ok) {
          setUploading(false);
          try {
            const err = (await presignRes.json()) as { error?: string };
            toast.error(err?.error || `HTTP ${presignRes.status}`);
          } catch {
            toast.error(`Upload failed (HTTP ${presignRes.status})`);
          }
          return;
        }

        const presign = (await presignRes.json()) as {
          uploadUrl?: string;
          url?: string;
          key?: string;
          contentType?: string;
        };

        if (!presign.uploadUrl || !presign.url || !presign.key || !presign.contentType) {
          setUploading(false);
          toast.error(t("watchCloudUploadFailed"));
          return;
        }

        const uploadUrl = presign.uploadUrl;
        const publicUrl = presign.url;
        const objectKey = presign.key;
        const putContentType = presign.contentType;

        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", putContentType);

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) {
            return;
          }
          const pct = Math.max(
            0,
            Math.min(100, Math.round((e.loaded / e.total) * 100)),
          );
          if (pct !== uploadPctDedupeRef.current) {
            uploadPctDedupeRef.current = pct;
            setUploadPct(pct);
          }
        };
        xhr.onerror = () => {
          setUploading(false);
          toast.error(t("watchCloudUploadFailed"));
        };
        xhr.onload = async () => {
          try {
            if (xhr.status < 200 || xhr.status >= 300) {
              toast.error(`Upload failed (HTTP ${xhr.status})`);
              return;
            }
            await fetchCloudFolders();
            setCloudDraft({
              url: publicUrl,
              key: objectKey,
              suggestedTitle: stripExt(file.name || "Video"),
            });
            setCloudTitle(stripExt(file.name || "Video"));
            setCloudFolder("General");
          } catch {
            toast.error(t("watchCloudUploadFailed"));
          } finally {
            setUploading(false);
          }
        };
        xhr.send(file);
      })();
    },
    [fetchCloudFolders, t, user],
  );

  const onCloudFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) {
      return;
    }
    const ok =
      f.type.startsWith("video/") || /\.(mkv|webm|mp4|mov|m4v)$/i.test(f.name);
    if (!ok) {
      toast.error(t("watchDropInvalidType"));
      return;
    }
    startCloudUpload(f);
  };

  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const startSubtitleUpload = useCallback(
    (file: File) => {
      if (!user) {
        toast.info(t("watchPlaylistLogin"));
        return;
      }
      if (!cloudDraft) {
        return;
      }
      setSubtitleUploading(true);
      setSubtitlePct(0);
      subtitlePctDedupeRef.current = -1;
      const fd = new FormData();
      fd.append("kind", "subtitle");
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/r2/upload");
      const token = getAuthToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) {
          return;
        }
        const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
        if (pct !== subtitlePctDedupeRef.current) {
          subtitlePctDedupeRef.current = pct;
          setSubtitlePct(pct);
        }
      };
      xhr.onerror = () => {
        setSubtitleUploading(false);
        toast.error(t("watchSubtitleUploadFailed"));
      };
      xhr.onload = () => {
        try {
          if (xhr.status < 200 || xhr.status >= 300) {
            try {
              const err = JSON.parse(xhr.responseText || "{}") as { error?: string };
              toast.error(err?.error || `HTTP ${xhr.status}`);
            } catch {
              toast.error(`Upload failed (HTTP ${xhr.status})`);
            }
            return;
          }
          const data = JSON.parse(xhr.responseText || "{}") as { url?: string; key?: string };
          if (!data.url || !data.key) {
            throw new Error("bad response");
          }
          setSubtitleDraft({ url: data.url, key: data.key, name: file.name || "subtitle" });
          toast.success(t("watchSubtitleUploaded"));
        } catch {
          toast.error(t("watchSubtitleUploadFailed"));
        } finally {
          setSubtitleUploading(false);
        }
      };
      xhr.send(fd);
    },
    [cloudDraft, t, user],
  );

  const onSubtitleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) {
      return;
    }
    const ok =
      /\.(srt|vtt)$/i.test(f.name) || f.type === "text/vtt" || f.type.startsWith("text/");
    if (!ok) {
      toast.error(t("watchSubtitleInvalidType"));
      return;
    }
    startSubtitleUpload(f);
  };

  const searchSubtitles = useCallback(async (q: string) => {
    if (!q.trim()) {
      return;
    }
    setSubtitleSearching(true);
    try {
      const url = new URL("/api/subtitles/search", window.location.origin);
      url.searchParams.set("query", q.trim());
      url.searchParams.set("languages", "en");
      const res = await authFetch(url.toString());
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as unknown;
        const msg =
          typeof err === "object" && err && "error" in err && typeof (err as { error?: unknown }).error === "string"
            ? (err as { error: string }).error
            : `HTTP ${res.status}`;
        toast.error(msg);
        return;
      }
      const json = (await res.json()) as { results?: { fileId: number; title: string; lang: string; downloads: number }[] };
      setSubtitleResults(Array.isArray(json.results) ? json.results.slice(0, 20) : []);
    } catch {
      toast.error(t("watchSubtitleSearchFailed"));
    } finally {
      setSubtitleSearching(false);
    }
  }, [t]);

  useEffect(() => {
    if (!subtitleSearchOpen) {
      return;
    }
    void searchSubtitles(debouncedSubtitleQuery);
  }, [debouncedSubtitleQuery, searchSubtitles, subtitleSearchOpen]);

  const importSubtitle = useCallback(
    async (fileId: number) => {
      setSubtitleSearching(true);
      try {
        const res = await authFetch("/api/subtitles/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId,
            fileName: `${(cloudTitle || cloudDraft?.suggestedTitle || "subtitle").slice(0, 80)}.srt`,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as unknown;
          const msg =
            typeof err === "object" && err && "error" in err && typeof (err as { error?: unknown }).error === "string"
              ? (err as { error: string }).error
              : `HTTP ${res.status}`;
          toast.error(msg);
          return;
        }
        const data = (await res.json()) as { url?: string; key?: string };
        if (data.url && data.key) {
          setSubtitleDraft({ url: data.url, key: data.key, name: "opensubtitles" });
          toast.success(t("watchSubtitleImported"));
          setSubtitleSearchOpen(false);
        }
      } catch {
        toast.error(t("watchSubtitleSearchFailed"));
      } finally {
        setSubtitleSearching(false);
      }
    },
    [cloudDraft, cloudTitle, t],
  );

  const saveCloudClip = useCallback(async () => {
    if (!cloudDraft || cloudSaving) {
      return;
    }
    setCloudSaving(true);
    try {
      const res = await authFetch("/api/watch-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderName: cloudFolder.trim() || "General",
          title: (cloudTitle.trim() || cloudDraft.suggestedTitle).slice(0, 200),
          youtubeUrl: cloudDraft.url,
          subtitleUrl: subtitleDraft?.url || "",
          sortOrder: 0,
        }),
      });
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const data = (await res.json()) as { clip?: unknown };
      window.dispatchEvent(
        new CustomEvent("watch-playlist-changed", {
          detail: { clip: data.clip },
        }),
      );
      toast.success(t("watchCloudSaved"));
      setCloudDraft(null);
      setSubtitleDraft(null);
    } catch {
      toast.error(t("watchPlaylistSaveError"));
    } finally {
      setCloudSaving(false);
    }
  }, [cloudDraft, cloudFolder, cloudSaving, cloudTitle, subtitleDraft, t]);

  const toggleMic = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      toast.error(t("meetsMicToggleFailed"));
    }
  }, [localParticipant, isMicrophoneEnabled, t]);

  const connected = room.state === ConnectionState.Connected;

  const peopleCount = 1 + room.remoteParticipants.size;
  const peopleLabel =
    peopleCount === 1
      ? t("meetsPeopleOne")
      : t("meetsPeopleMany").replace("{n}", String(peopleCount));
  const peopleTitle = (() => {
    const lp = room.localParticipant;
    const parts: string[] = [];
    if (lp) {
      parts.push(lp.name?.trim() ? lp.name : lp.identity);
    }
    for (const p of room.remoteParticipants.values()) {
      parts.push(p.name?.trim() ? p.name : p.identity);
    }
    return parts.join(", ");
  })();

  const displayTime = scrubbing ? scrubTime : uiTime;
  const durationSafe = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const hasMedia = Boolean(objectUrl || (youtubeId && ytReady));
  const showEmptyStage = !objectUrl && !youtubeId;

  const togglePlay = () => {
    if (youtubeId && ytPlayerRef.current) {
      const p = ytPlayerRef.current;
      try {
        if (p.getPlayerState() === YT_STATE_PLAYING) {
          p.pauseVideo();
        } else {
          p.playVideo();
          clearPartnerPlayGate();
        }
      } catch {
        /* ignore */
      }
      void publishState();
      return;
    }
    const v = videoRef.current;
    if (!v?.src) {
      return;
    }
    if (v.paused) {
      void v
        .play()
        .then(() => {
          clearPartnerPlayGate();
        })
        .catch(() => {
          /* autoplay / gesture */
        });
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (youtubeId && ytPlayerRef.current) {
      try { ytPlayerRef.current.setVolume(next ? 0 : Math.round(volume * 100)); } catch { /* ignore */ }
    } else {
      const v = videoRef.current;
      if (v) v.muted = next;
    }
  };

  const handleSpeedChange = (rate: number) => {
    setSpeed(rate);
    setShowSettings(false);
    if (youtubeId && ytPlayerRef.current) {
      try { ytPlayerRef.current.setPlaybackRate(rate); } catch { /* ignore */ }
    } else {
      const v = videoRef.current;
      if (v) v.playbackRate = rate;
    }
  };

  const handleQualityChange = (q: string) => {
    setQuality(q);
    setShowSettings(false);
    if (youtubeId && ytPlayerRef.current) {
      try { ytPlayerRef.current.setPlaybackQuality(q); } catch { /* ignore */ }
    }
  };

  const toggleCc = () => {
    const p = ytPlayerRef.current;
    if (!p) return;
    try {
      if (ccEnabled) {
        p.unloadModule("cc");
        p.unloadModule("captions");
      } else {
        p.loadModule("cc");
        p.setOption("captions", "track", { languageCode: "en" });
      }
      setCcEnabled((v) => !v);
    } catch { /* ignore */ }
  };

  const toggleStageFullscreen = () => {
    const el = videoStageRef.current;
    if (!el) {
      return;
    }
    if (getDocumentFullscreenElement() === el) {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void>;
        mozCancelFullScreen?: () => void;
      };
      if (doc.webkitExitFullscreen) {
        void doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      } else {
        void document.exitFullscreen();
      }
    } else {
      const node = el as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        mozRequestFullScreen?: () => Promise<void>;
      };
      if (node.webkitRequestFullscreen) {
        void node.webkitRequestFullscreen();
      } else if (node.mozRequestFullScreen) {
        void node.mozRequestFullScreen();
      } else {
        void el.requestFullscreen();
      }
    }
  };

  useEffect(() => {
    const syncStageFs = () => {
      const el = videoStageRef.current;
      setStageFullscreen(Boolean(el && getDocumentFullscreenElement() === el));
    };
    document.addEventListener("fullscreenchange", syncStageFs);
    document.addEventListener("webkitfullscreenchange", syncStageFs);
    document.addEventListener("mozfullscreenchange", syncStageFs);
    syncStageFs();
    return () => {
      document.removeEventListener("fullscreenchange", syncStageFs);
      document.removeEventListener("webkitfullscreenchange", syncStageFs);
      document.removeEventListener("mozfullscreenchange", syncStageFs);
    };
  }, []);

  const skipSeconds = useCallback(
    (delta: number) => {
      if (youtubeId && ytPlayerRef.current) {
        const p = ytPlayerRef.current;
        try {
          let next = p.getCurrentTime() + delta;
          if (next < 0) {
            next = 0;
          }
          const maxT = durationSafe > 0 ? durationSafe : p.getDuration();
          if (Number.isFinite(maxT) && maxT > 0 && next > maxT) {
            next = maxT;
          }
          p.seekTo(next, true);
          setUiTime(next);
        } catch {
          /* ignore */
        }
        void publishState();
        return;
      }
      const v = videoRef.current;
      if (!v?.src) {
        return;
      }
      const maxT =
        Number.isFinite(v.duration) && v.duration > 0
          ? v.duration
          : durationSafe;
      const cap = maxT > 0 ? maxT : undefined;
      let next = v.currentTime + delta;
      if (next < 0) {
        next = 0;
      }
      if (cap != null && next > cap) {
        next = cap;
      }
      v.currentTime = next;
      setUiTime(next);
    },
    [durationSafe, youtubeId, publishState],
  );

  useEffect(() => {
    if (!scrubbing) {
      return;
    }
    const end = () => {
      scrubbingRef.current = false;
      setScrubbing(false);
      const v = videoRef.current;
      if (v?.src) {
        setUiTime(v.currentTime);
      } else {
        const p = ytPlayerRef.current;
        if (p) {
          try {
            setUiTime(p.getCurrentTime());
          } catch {
            /* ignore */
          }
        }
      }
      void publishState();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [scrubbing, publishState]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f9fafb]">
      <RoomAudioRenderer />
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-2 py-1.5 shadow-sm sm:gap-2 sm:px-3 sm:py-2">
        <Clapperboard
          className="h-4 w-4 shrink-0 text-zinc-700 sm:h-5 sm:w-5"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xs font-semibold text-zinc-900 sm:text-sm md:text-base">
            {t("watchTogetherTitle")}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-zinc-600 sm:text-[11px]">
              <span
                className="inline-flex max-w-[min(100%,18rem)] items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans"
                title={roomDisplayName}
              >
                <span className="shrink-0 font-medium text-zinc-500">
                  {t("watchRoomLabel")}
                </span>
                <span className="truncate font-mono text-zinc-800">
                  {shortWatchRoomDisplay(roomDisplayName)}
                </span>
              </span>
              {connected ? (
                <span className="shrink-0 text-emerald-600">
                  · {t("watchTogetherConnected")}
                </span>
              ) : null}
            </p>
            {connected ? (
              <span
                className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700"
                title={peopleTitle}
              >
                <Users className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                <span className="truncate">{peopleLabel}</span>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => {
              void toggleMic();
            }}
            disabled={!connected}
            title={
              isMicrophoneEnabled ? t("meetsMuteMic") : t("meetsUnmuteMic")
            }
            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium disabled:opacity-50 sm:px-2.5 sm:text-xs ${
              isMicrophoneEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-zinc-200 bg-white text-zinc-700 shadow-sm"
            }`}
          >
            {isMicrophoneEnabled ? (
              <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <MicOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {isMicrophoneEnabled ? (
              <MicLevelBars
                level={micLevel}
                className="hidden !h-4 w-[18px] sm:flex"
              />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-sm lg:hidden"
            aria-label={t("meetsToggleChat")}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{t("meetsChatTitle")}</span>
          </button>
          <button
            type="button"
            onClick={() => void leave()}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800 sm:px-2.5 sm:text-xs"
          >
            <LogOut
              className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5"
              aria-hidden
            />
            <span className="hidden sm:inline">{t("meetsLeaveRoom")}</span>
          </button>
        </div>
      </header>

      {showPartnerPlayBanner ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:text-sm">
          <span className="min-w-0 leading-snug">
            {t("watchPartnerPlayingTapPlay")}
          </span>
          <button
            type="button"
            onClick={() => {
              if (youtubeId && ytPlayerRef.current) {
                try {
                  ytPlayerRef.current.playVideo();
                  clearPartnerPlayGate();
                } catch {
                  /* still blocked */
                }
                return;
              }
              const v = videoRef.current;
              if (!v?.src) {
                return;
              }
              void v
                .play()
                .then(() => {
                  clearPartnerPlayGate();
                })
                .catch(() => {
                  /* still blocked */
                });
            }}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
          >
            {t("watchPlayTogether")}
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-2 pt-2 sm:gap-2.5 sm:px-3 sm:pb-3 sm:pt-2.5"
          onDragOver={onVideoDragOver}
          onDragLeave={onVideoDragLeave}
          onDrop={onVideoDrop}
        >
          <div
            title={t("watchDropZonePrompt")}
            className="flex min-w-0 shrink-0 flex-nowrap items-center gap-2 py-0.5 max-sm:overflow-x-auto max-sm:pb-0.5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mkv,.webm,.mp4,.mov,.m4v"
              className="sr-only"
              onChange={onFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              {t("watchTogetherChooseFile")}
            </button>
            <input
              ref={cloudInputRef}
              type="file"
              accept="video/*,.mkv,.webm,.mp4,.mov,.m4v"
              className="sr-only"
              onChange={onCloudFileChange}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => cloudInputRef.current?.click()}
              className="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {t("watchCloudUpload")}
            </button>
            <span
              className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
              aria-hidden
            >
              {t("watchSourceOr")}
            </span>
            <input
              type="url"
              value={youtubeUrlDraft}
              onChange={(e) => setYoutubeUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loadYoutubeFromDraft();
                }
              }}
              placeholder={t("watchYoutubePlaceholder")}
              className="h-8 min-w-[6rem] flex-1 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-900 placeholder:text-zinc-400 sm:min-w-[10rem] sm:max-w-md"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={loadYoutubeFromDraft}
              className="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              {t("watchYoutubeLoad")}
            </button>
            <WatchPlaylistMenu onPickClip={loadFromPlaylistUrl} />
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              title={t("watchTogetherHint")}
              aria-label={t("watchTogetherHint")}
            >
              <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
          {uploading ? (
            <div className="mt-2 w-full max-w-md">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full bg-zinc-900 transition-[width]"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] font-medium text-zinc-600">
                {t("watchCloudUploading").replace("{pct}", String(uploadPct))}
              </div>
            </div>
          ) : null}

          {cloudDraft ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-[0_20px_70px_rgba(0,0,0,0.25)]">
                <div className="mb-3 text-sm font-semibold text-zinc-900">
                  {t("watchCloudSaveModalTitle")}
                </div>
                <label className="block text-[11px] font-semibold text-zinc-600">
                  {t("watchPlaylistFolder")}
                </label>
                <select
                  value={cloudFolder}
                  onChange={(e) => setCloudFolder(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs"
                >
                  {cloudFolders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <label className="mt-3 block text-[11px] font-semibold text-zinc-600">
                  {t("watchPlaylistTitle")}
                </label>
                <input
                  value={cloudTitle}
                  onChange={(e) => setCloudTitle(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs"
                  placeholder={cloudDraft.suggestedTitle}
                />
                <div className="mt-3">
                  <input
                    ref={subtitleInputRef}
                    type="file"
                    accept=".srt,.vtt,text/vtt"
                    className="sr-only"
                    onChange={onSubtitleFileChange}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={subtitleUploading}
                      onClick={() => subtitleInputRef.current?.click()}
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {t("watchSubtitleUpload")}
                    </button>
                    <button
                      type="button"
                      disabled={subtitleSearching}
                      onClick={() => {
                        setSubtitleSearchOpen((v) => !v);
                        setSubtitleQuery((q) => q || cloudTitle || cloudDraft.suggestedTitle);
                      }}
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {t("watchSubtitleSearch")}
                    </button>
                    <div className="min-w-0 flex-1 truncate text-right text-[11px] text-zinc-600">
                      {subtitleDraft?.name ? (
                        <span className="font-medium">{subtitleDraft.name}</span>
                      ) : (
                        <span className="text-zinc-400">{t("watchSubtitleOptional")}</span>
                      )}
                    </div>
                  </div>
                  {subtitleSearchOpen ? (
                    <div className="mt-2 rounded-md border border-zinc-200 bg-white p-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={subtitleQuery}
                          onChange={(e) => setSubtitleQuery(e.target.value)}
                          placeholder={t("watchSubtitleSearchPlaceholder")}
                          className="h-9 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-xs"
                        />
                        <div className="shrink-0 px-2 text-[11px] font-semibold text-zinc-500">
                          {subtitleSearching ? t("loading") : null}
                        </div>
                      </div>
                      {subtitleResults.length ? (
                        <div className="mt-2 max-h-48 overflow-auto">
                          <ul className="space-y-1">
                            {subtitleResults.map((r) => (
                              <li key={r.fileId} className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[11px] font-semibold text-zinc-800">
                                    {r.title}
                                  </div>
                                  <div className="text-[10px] text-zinc-500">
                                    {r.lang.toUpperCase()} · {t("watchSubtitleDownloads").replace("{n}", String(r.downloads))}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={subtitleSearching}
                                  onClick={() => void importSubtitle(r.fileId)}
                                  className="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                                >
                                  {t("watchSubtitleUse")}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {subtitleUploading ? (
                    <div className="mt-2">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className="h-full bg-zinc-900 transition-[width]"
                          style={{ width: `${subtitlePct}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-zinc-600">
                        {t("watchSubtitleUploading").replace("{pct}", String(subtitlePct))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={cloudSaving}
                    onClick={() => setCloudDraft(null)}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {t("watchPlaylistCancel")}
                  </button>
                  <button
                    type="button"
                    disabled={cloudSaving}
                    onClick={saveCloudClip}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {t("watchPlaylistSave")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:min-w-0">
              <div
                ref={videoStageRef}
                className={`watch-party-video-stage relative flex min-h-[38svh] flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-950 shadow-none lg:min-h-0 ${
                  fileDropActive
                    ? "ring-2 ring-zinc-500 ring-offset-1 ring-offset-[#f9fafb]"
                    : ""
                }`}
              >
                <div className="pointer-events-none absolute right-2 top-2 z-20 sm:right-3 sm:top-3">
                  <div className="pointer-events-auto">
                    <StartAudio
                      label={t("meetsStartAudioLabel")}
                      className={START_AUDIO_BTN_CLASS}
                    />
                  </div>
                </div>

                <div className="watch-party-video-area relative flex min-h-0 flex-1 items-stretch bg-black">
                  {showEmptyStage ? (
                    <div
                      className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-zinc-950/95 px-6 text-center"
                      aria-hidden
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                        <Film
                          className="h-7 w-7 text-zinc-400"
                          strokeWidth={1.75}
                        />
                      </div>
                      <p className="text-sm font-semibold text-zinc-100">
                        {t("watchEmptyStageTitle")}
                      </p>
                      <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
                        {t("watchEmptyStageHint")}
                      </p>
                    </div>
                  ) : null}
                  <div
                    ref={ytHostRef}
                    className={`watch-party-yt-host absolute inset-0 z-0 min-h-[12rem] w-full min-w-0 ${youtubeId ? "" : "hidden"}`}
                    aria-hidden={!youtubeId}
                  />
                  {youtubeId && !ytReady ? (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/80 px-4 text-center text-xs text-zinc-300 sm:text-sm">
                      {t("watchYoutubeLoading")}
                    </div>
                  ) : null}
                  {objectUrl && !youtubeId ? (
                    <video
                      ref={videoRef}
                      className="absolute inset-0 z-[2] h-full w-full object-cover"
                      crossOrigin="anonymous"
                      playsInline
                      preload="metadata"
                      src={objectUrl}
                      onPlay={() => {
                        setPlaying(true);
                        clearPartnerPlayGate();
                        onLocalInteraction();
                      }}
                      onPause={() => {
                        setPlaying(false);
                        onLocalInteraction();
                      }}
                      onSeeked={onSeeked}
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        setDuration(v.duration);
                        setUiTime(v.currentTime);
                        setVolume(v.volume);
                        setPlaying(!v.paused);
                        const pending = pendingFileSyncRef.current;
                        if (pending) {
                          pendingFileSyncRef.current = null;
                          applyingRemote.current = true;
                          try {
                            applyRemoteVideoState(
                              v,
                              pending.currentTime,
                              pending.playing,
                              pending.playing ? notifyRemotePlayBlocked : undefined,
                            );
                          } finally {
                            window.requestAnimationFrame(() => {
                              applyingRemote.current = false;
                            });
                          }
                        }
                      }}
                      onTimeUpdate={(e) => {
                        if (scrubbingRef.current) {
                          return;
                        }
                        scheduleVideoUiTime(e.currentTarget.currentTime);
                      }}
                      onVolumeChange={(e) => {
                        setVolume(e.currentTarget.volume);
                      }}
                      onEnded={() => {
                        setPlaying(false);
                        onLocalInteraction();
                      }}
                    >
                      {subtitleUrl ? (
                        <track
                          key={subtitleUrl}
                          src={subtitleUrl}
                          kind="subtitles"
                          srcLang="en"
                          label="English"
                          default
                        />
                      ) : null}
                    </video>
                  ) : null}
                </div>

                <div className="watch-party-controls shrink-0 border-t border-zinc-800 bg-zinc-900 px-3 py-2 flex flex-col gap-1.5">
                  {/* Seek bar row */}
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-[10px] text-zinc-400 shrink-0 w-10 text-right">
                      {formatWatchTime(displayTime)}
                    </span>
                    <input
                      type="range"
                      aria-label={t("watchPlayerSeek")}
                      disabled={!hasMedia || durationSafe <= 0}
                      min={0}
                      max={durationSafe > 0 ? durationSafe : 1}
                      step={0.1}
                      value={durationSafe > 0 ? Math.min(displayTime, durationSafe) : 0}
                      onPointerDown={() => {
                        if (youtubeId && ytPlayerRef.current && durationSafe > 0) {
                          try {
                            scrubbingRef.current = true;
                            setScrubbing(true);
                            setScrubTime(ytPlayerRef.current.getCurrentTime());
                          } catch { /* ignore */ }
                          return;
                        }
                        const v = videoRef.current;
                        if (!v?.src || durationSafe <= 0) return;
                        scrubbingRef.current = true;
                        setScrubbing(true);
                        setScrubTime(v.currentTime);
                      }}
                      onChange={(e) => {
                        const x = Number(e.target.value);
                        if (!Number.isFinite(x)) return;
                        if (youtubeId && ytPlayerRef.current) {
                          ytPlayerRef.current.seekTo(x, true);
                          setScrubTime(x);
                          return;
                        }
                        const v = videoRef.current;
                        if (!v?.src) return;
                        setScrubTime(x);
                        v.currentTime = x;
                      }}
                      className="flex-1 h-1 accent-red-500 cursor-pointer disabled:opacity-40"
                    />
                    <span className="tabular-nums text-[10px] text-zinc-400 shrink-0 w-10">
                      {formatWatchTime(durationSafe)}
                    </span>
                  </div>

                  {/* Buttons row */}
                  <div className="flex items-center gap-1.5">
                    {/* Rewind */}
                    <button
                      type="button"
                      disabled={!hasMedia}
                      onClick={() => skipSeconds(-WATCH_SKIP_SECONDS)}
                      title={t("watchSkipBack10")}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                    >
                      <Rewind className="h-3.5 w-3.5" />
                    </button>

                    {/* Play / Pause */}
                    <button
                      type="button"
                      disabled={!hasMedia}
                      onClick={togglePlay}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                    >
                      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>

                    {/* Forward */}
                    <button
                      type="button"
                      disabled={!hasMedia}
                      onClick={() => skipSeconds(WATCH_SKIP_SECONDS)}
                      title={t("watchSkipForward10")}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                    >
                      <FastForward className="h-3.5 w-3.5" />
                    </button>

                    {/* Mute / Volume */}
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-colors"
                    >
                      {muted || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    </button>
                    <input
                      type="range"
                      aria-label={t("watchPlayerVolume")}
                      disabled={!hasMedia}
                      min={0}
                      max={1}
                      step={0.02}
                      value={muted ? 0 : volume}
                      onChange={(e) => {
                        const x = Number(e.target.value);
                        setVolume(x);
                        setMuted(x === 0);
                        if (youtubeId && ytPlayerRef.current) {
                          try { ytPlayerRef.current.setVolume(Math.round(x * 100)); } catch { /* ignore */ }
                        } else {
                          const v = videoRef.current;
                          if (v?.src) { v.volume = x; v.muted = x === 0; }
                        }
                      }}
                      className="w-16 h-1 accent-zinc-400 cursor-pointer"
                    />

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Sync now */}
                    <button
                      type="button"
                      disabled={!connected}
                      onClick={() => { void publishRequest(); }}
                      title={t("watchSyncNowTooltip")}
                      className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span className="hidden text-[10px] font-medium sm:inline">
                        {t("watchTogetherSyncNow")}
                      </span>
                    </button>

                    {/* CC (YouTube only) */}
                    {youtubeId && (
                      <button
                        type="button"
                        onClick={toggleCc}
                        disabled={!ytReady}
                        title="Subtitles"
                        className={`inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-2 text-[10px] font-bold transition-colors disabled:opacity-40 ${
                          ccEnabled
                            ? "border-white bg-white text-zinc-900"
                            : "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                        }`}
                      >
                        <Subtitles className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Settings (speed + quality) */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowSettings((v) => !v)}
                        disabled={!hasMedia}
                        title="Settings"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>

                      {showSettings && (
                        <div
                          className="absolute bottom-9 right-0 z-30 w-52 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
                          onMouseLeave={() => setShowSettings(false)}
                        >
                          {/* Speed */}
                          <div className="px-3 py-2 border-b border-zinc-700">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Speed</p>
                            <div className="flex flex-wrap gap-1">
                              {SPEED_OPTIONS.map((r) => (
                                <button
                                  key={r}
                                  onClick={() => handleSpeedChange(r)}
                                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                    speed === r
                                      ? "bg-white text-zinc-900"
                                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                  }`}
                                >
                                  {r === 1 ? "Normal" : `${r}×`}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Quality */}
                          {youtubeId && (
                            <div className="px-3 py-2">
                              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Quality</p>
                              <div className="flex flex-col gap-0.5">
                                {QUALITY_OPTIONS.map(({ key: q, label }) => {
                                  const available = availableQualities.length === 0 || availableQualities.includes(q) || q === "auto";
                                  return (
                                    <button
                                      key={q}
                                      onClick={() => handleQualityChange(q === "auto" ? "default" : q)}
                                      disabled={!available}
                                      className={`flex items-center justify-between rounded px-2 py-1 text-[11px] transition-colors ${
                                        (quality === q || (q === "auto" && quality === "default"))
                                          ? "bg-white text-zinc-900 font-medium"
                                          : available
                                            ? "text-zinc-300 hover:bg-zinc-800"
                                            : "text-zinc-600 opacity-50 cursor-not-allowed"
                                      }`}
                                    >
                                      <span>{label}</span>
                                      {(quality === q || (q === "auto" && quality === "default")) && <span className="text-[9px] opacity-60">✓</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Fullscreen */}
                    <button
                      type="button"
                      disabled={!hasMedia}
                      onClick={toggleStageFullscreen}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                      title={stageFullscreen ? t("watchExitFullscreen") : t("watchPlayerFullscreen")}
                    >
                      {stageFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop chat toggle + panel */}
            {desktopChatOpen ? (
              <CallChatPanel
                variant="watch"
                roomDisplayName={roomDisplayName}
                className={WATCH_CHAT_DESKTOP}
                onToggle={() => setDesktopChatOpen(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setDesktopChatOpen(true)}
                className="hidden lg:inline-flex self-start shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t("meetsToggleChatShow")}
              </button>
            )}
          </div>
        </div>
      </div>

      {chatOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-zinc-900/20 backdrop-blur-[2px] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={t("meetsToggleChatHide")}
            onClick={() => setChatOpen(false)}
          />
          <div
            className={MOBILE_CHAT_DRAWER}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={t("meetsChatTitle")}
          >
            <CallChatPanel
              variant="watch"
              roomDisplayName={roomDisplayName}
              className="flex h-full min-h-0 flex-1 rounded-none border-0 !max-h-none"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
