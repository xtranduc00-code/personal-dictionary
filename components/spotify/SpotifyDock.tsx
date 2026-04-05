"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { SpotifyConnectCard } from "@/components/spotify/spotify-connect-card";
import { SpotifyPlayerCard } from "@/components/spotify/spotify-player-card";
import { SpotifyPlaylistPanel } from "@/components/spotify/spotify-playlist-panel";
import type { SpotifySearchTrackRow } from "@/components/spotify/spotify-search-types";
import {
  humanizeSpotifyApiErrorText,
  humanizeSpotifyPlaybackHttpError,
} from "@/lib/spotify/humanize-api-error";
import {
  destroyGlobalPlayer,
  getGlobalPlayback,
  hasLivePlayer,
  updateGlobalPlayback,
} from "@/components/spotify/spotify-global-player";

async function ensureSpotifySdk(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.Spotify?.Player) return;
  await new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    if (!document.querySelector('script[data-spotify-sdk="1"]')) {
      const s = document.createElement("script");
      s.src = "https://sdk.scdn.co/spotify-player.js";
      s.async = true;
      s.dataset.spotifySdk = "1";
      s.onerror = () => reject(new Error("Spotify SDK failed to load"));
      document.body.appendChild(s);
    }
  });
}

type PlaylistRow = { id: string; name: string; uri: string };

/** Server + account: OAuth cookie and refresh succeeded */
type SessionState =
  | "disconnected"
  | "connecting"
  | "connected_account"
  | "session_invalid"
  /** Cookie present but Spotify token refresh failed transiently — retry, don't force reconnect */
  | "session_transient";

/** Web Playback SDK lifecycle */
type PlayerState = "idle" | "initializing" | "ready" | "playback_error";

function deriveUiPhase(
  session: SessionState,
  player: PlayerState,
):
  | "disconnected"
  | "connecting"
  | "connected_account"
  | "player_initializing"
  | "player_ready"
  | "session_invalid"
  | "playback_error" {
  if (session === "session_invalid") return "session_invalid";
  if (session === "session_transient") return "connecting";
  if (session === "disconnected") return "disconnected";
  if (session === "connecting") return "connecting";
  if (player === "playback_error") return "playback_error";
  if (player === "initializing") return "player_initializing";
  if (player === "ready") return "player_ready";
  return "connected_account";
}

type StatusJson = {
  configured: boolean;
  sessionOk?: boolean;
  connected?: boolean;
  sessionError?: string | null;
  hasRefreshCookie?: boolean;
};

function formatPlaybackMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function spotifyPlaybackLog(tag: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.warn(`[spotify:playback] ${tag}`, data);
}

function spotifySdkDevLog(tag: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.warn(`[spotify:sdk] ${tag}`, data);
}

function SpotifyDockInner({
  embedded = false,
  visuallyHidden = false,
}: {
  embedded?: boolean;
  /** Hide on home/portfolio but keep Web Playback mounted so playback survives those routes. */
  visuallyHidden?: boolean;
}) {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  const searchParams = useSearchParams();
  const [configured, setConfigured] = useState(() => hasLivePlayer());
  const [sessionState, setSessionState] = useState<SessionState>(
    () => hasLivePlayer() ? "connected_account" : "connecting",
  );
  /** Why /session_invalid — drives accurate copy (decrypt vs revoked vs legacy). */
  const [sessionFailKind, setSessionFailKind] = useState<
    "decrypt" | "revoked" | null
  >(null);
  const [playerState, setPlayerState] = useState<PlayerState>(() =>
    hasLivePlayer() ? "ready" : "idle",
  );
  const [deviceId, setDeviceId] = useState<string | null>(
    () => getGlobalPlayback().deviceId,
  );
  const [paused, setPaused] = useState(() => getGlobalPlayback().paused);
  const [trackName, setTrackName] = useState<string | null>(
    () => getGlobalPlayback().trackName,
  );
  const [artistName, setArtistName] = useState<string | null>(
    () => getGlobalPlayback().artistName,
  );
  const [artUrl, setArtUrl] = useState<string | null>(
    () => getGlobalPlayback().artUrl,
  );
  const [expanded, setExpanded] = useState(embedded);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [selectedPlaylistName, setSelectedPlaylistName] = useState<
    string | null
  >(null);
  const [selectedPlaylistUri, setSelectedPlaylistUri] = useState<string | null>(
    null,
  );
  const [playlistTracks, setPlaylistTracks] = useState<
    SpotifySearchTrackRow[]
  >([]);
  const [playlistTracksLoading, setPlaylistTracksLoading] = useState(false);
  const [playlistTracksError, setPlaylistTracksError] = useState<string | null>(
    null,
  );
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistsLoadFailed, setPlaylistsLoadFailed] = useState(false);
  const [durationMs, setDurationMs] = useState(
    () => getGlobalPlayback().durationMs,
  );
  const [shuffleOn, setShuffleOn] = useState(
    () => getGlobalPlayback().shuffleOn,
  );
  /** 0 off, 1 context, 2 track */
  const [repeatMode, setRepeatMode] = useState(
    () => getGlobalPlayback().repeatMode,
  );
  /** Initialized from global store so the player survives navigation. */
  const playerRef = useRef<SpotifyWebPlayer | null>(getGlobalPlayback().player);
  const lastSpotifyAuthErrMs = useRef(0);
  const deviceIdRef = useRef<string | null>(null);
  const selectedPlaylistIdRef = useRef<string | null>(null);
  const selectedPlaylistUriRef = useRef<string | null>(null);
  /** After SDK playback_error, avoid clearing now-playing row immediately (prevents "Nothing playing" flash). */
  const playbackErrCooldownUntilRef = useRef(0);
  const spotifyPersonalMode =
    process.env.NEXT_PUBLIC_SPOTIFY_PERSONAL_MODE === "1";

  /**
   * If the user clicks a track while the SDK player is still warming up (no deviceId yet),
   * stash the intent here and fire it as soon as deviceId becomes available.
   */
  const pendingPlayRef = useRef<{ uri: string; context: string | null } | null>(null);

  /** Reset Web Playback + browse state so we don't play with a stale playlist context. */
  const clearInvalidSpotifySession = useCallback(async () => {
    destroyGlobalPlayer();
    playerRef.current = null;
    setPlayerState("idle");
    setDeviceId(null);
    setExpanded(false);
    setTrackName(null);
    setArtistName(null);
    setArtUrl(null);
    setSelectedPlaylistId(null);
    setSelectedPlaylistName(null);
    setSelectedPlaylistUri(null);
    setPlaylistTracks([]);
    setPlaylistTracksError(null);
    void refreshStatusRef.current();
  }, []);


  const refreshStatus = useCallback(async (): Promise<{
    sessionOk: boolean;
    configured: boolean;
    sessionError?: string | null;
  }> => {
    try {
      const r = await fetch("/api/spotify/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const j = (await r.json()) as StatusJson;
      const sessionOk = Boolean(j.sessionOk ?? j.connected);
      const hasRt = Boolean(j.hasRefreshCookie);
      setConfigured(j.configured);

      if (j.sessionError === "decrypt") {
        setSessionFailKind("decrypt");
        setSessionState("session_invalid");
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[spotify:session] decrypt failed — same SPOTIFY_TOKEN_ENCRYPTION_KEY as when you connected? same host (127.0.0.1 vs localhost)?",
          );
        }
        return {
          sessionOk: false,
          configured: j.configured,
          sessionError: j.sessionError,
        };
      }

      if (!sessionOk) {
        if (j.sessionError === "no_cookie") {
          setSessionFailKind(null);
          setSessionState("disconnected");
          return {
            sessionOk: false,
            configured: j.configured,
            sessionError: j.sessionError ?? null,
          };
        }

        if (j.sessionError === "no_client_id") {
          setSessionFailKind(null);
          setSessionState("disconnected");
          if (process.env.NODE_ENV === "development") {
            console.warn("[spotify:session] SPOTIFY_CLIENT_ID missing on server");
          }
          return {
            sessionOk: false,
            configured: j.configured,
            sessionError: j.sessionError,
          };
        }

        if (j.sessionError === "refresh_failed" && hasRt) {
          setSessionFailKind(null);
          setSessionState("session_transient");
          return {
            sessionOk: false,
            configured: j.configured,
            sessionError: j.sessionError,
          };
        }

        if (j.sessionError === "refresh_revoked") {
          setSessionFailKind("revoked");
          setSessionState("session_invalid");
          return {
            sessionOk: false,
            configured: j.configured,
            sessionError: j.sessionError,
          };
        }

        if (j.sessionError === "refresh_failed" && !hasRt) {
          setSessionFailKind(null);
          setSessionState("disconnected");
          return {
            sessionOk: false,
            configured: j.configured,
            sessionError: j.sessionError,
          };
        }

        if (hasRt) {
          setSessionFailKind(null);
          setSessionState("session_transient");
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[spotify:session] unexpected sessionError; treating as transient",
              j.sessionError,
            );
          }
          return {
            sessionOk: false,
            configured: j.configured,
            sessionError: j.sessionError ?? null,
          };
        }

        setSessionFailKind(null);
        setSessionState("disconnected");
        return {
          sessionOk: false,
          configured: j.configured,
          sessionError: j.sessionError ?? null,
        };
      }

      setSessionFailKind(null);
      setSessionState("connected_account");
      return { sessionOk: true, configured: j.configured, sessionError: null };
    } catch (e) {
      console.error("[spotify] /api/spotify/status failed", e);
      setSessionFailKind(null);
      setSessionState("disconnected");
      setConfigured(false);
      return { sessionOk: false, configured: false };
    }
  }, []);

  const refreshStatusRef = useRef(refreshStatus);
  refreshStatusRef.current = refreshStatus;

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (visuallyHidden) setExpanded(false);
  }, [visuallyHidden]);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  useEffect(() => {
    selectedPlaylistIdRef.current = selectedPlaylistId;
  }, [selectedPlaylistId]);

  useEffect(() => {
    selectedPlaylistUriRef.current = selectedPlaylistUri;
  }, [selectedPlaylistUri]);

  useEffect(() => {
    if (sessionState !== "session_transient") return;
    const again = () => void refreshStatusRef.current();
    const t0 = setTimeout(again, 800);
    const id = setInterval(again, 14_000);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
  }, [sessionState]);

  /**
   * Clears refresh cookie + local player UI. Used by logout and before
   * `reconsent` OAuth so Spotify never ends up with two overlapping refresh flows.
   */
  const applySpotifyLogoutLocal = useCallback(async (showDisconnectedToast: boolean) => {
    destroyGlobalPlayer();
    playerRef.current = null;
    await fetch("/api/spotify/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setSessionState("disconnected");
    setSessionFailKind(null);
    setPlayerState("idle");
    setDeviceId(null);
    setExpanded(false);
    setPlaylists([]);
    setPlaylistsLoadFailed(false);
    setSelectedPlaylistId(null);
    setSelectedPlaylistName(null);
    setSelectedPlaylistUri(null);
    setPlaylistTracks([]);
    setPlaylistTracksError(null);
    setTrackName(null);
    setArtistName(null);
    setArtUrl(null);
    setDurationMs(0);
    setShuffleOn(false);
    setRepeatMode(0);
    if (showDisconnectedToast) {
      toast.success(tRef.current("spotifyDisconnectedToast"));
    }
  }, []);

  const openSpotifyLoginPopup = useCallback(
    async (opts?: { reconsent?: boolean }) => {
      if (opts?.reconsent) {
        try {
          await applySpotifyLogoutLocal(false);
        } catch {
          toast.error(tRef.current("spotifyErrGenericRequest"));
          return;
        }
      }
      const qs = new URLSearchParams({ popup: "1" });
      if (opts?.reconsent) qs.set("reconsent", "1");
      const url = `/api/spotify/login?${qs}`;
      const w = window.open(
        url,
        "ken_spotify_oauth",
        "popup=yes,width=480,height=720,scrollbars=yes",
      );
      if (!w) {
        toast.warning(tRef.current("spotifyPopupBlocked"));
        const fallbackQs = new URLSearchParams();
        if (opts?.reconsent) fallbackQs.set("reconsent", "1");
        const q = fallbackQs.toString();
        window.location.href = q
          ? `/api/spotify/login?${q}`
          : "/api/spotify/login";
        return;
      }
      w.focus();
    },
    [applySpotifyLogoutLocal],
  );

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as {
        type?: string;
        ok?: boolean;
        error?: string | null;
      };
      if (d?.type !== "ken-spotify-oauth") return;
      if (d.ok) {
        setSessionFailKind(null);
        setSessionState("connecting");
        void (async () => {
          const result = await refreshStatus();
          if (result.sessionOk) {
            toast.success(tRef.current("spotifyConnectedToast"));
          } else {
            toast.warning(tRef.current("spotifyConnectedPendingVerification"));
          }
        })();
        return;
      }
      if (d.error) {
        toast.error(
          `${tRef.current("spotifyConnectFailed")}: ${d.error}`,
        );
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refreshStatus]);

  useEffect(() => {
    const err = searchParams.get("spotify_error");
    const ok = searchParams.get("spotify");
    if (err) {
      toast.error(`${tRef.current("spotifyConnectFailed")}: ${err}`);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (ok === "connected") {
      setSessionFailKind(null);
      setSessionState("connecting");
      void (async () => {
        const result = await refreshStatus();
        window.history.replaceState(null, "", window.location.pathname);
        if (result.sessionOk) {
          toast.success(tRef.current("spotifyConnectedToast"));
        } else {
          toast.warning(tRef.current("spotifyConnectedPendingVerification"));
        }
      })();
    }
  }, [searchParams, refreshStatus]);

  useEffect(() => {
    if (sessionState !== "connected_account" || !configured) return;

    /* ── A single `cancelled` flag shared by fast-path and full init.
       Both paths register their listeners as closures over this flag,
       so the cleanup that fires on unmount silences ALL of them.        */
    let cancelled = false;
    const sharedCleanup = () => {
      cancelled = true;
      updateGlobalPlayback({ player: playerRef.current, deviceId: deviceIdRef.current });
      playerRef.current = null;
      setPlayerState("idle");
      setDeviceId(null);
    };

    /* ── Shared listener wiring ─────────────────────────────────────── */
    const attachListeners = (p: SpotifyWebPlayer) => {
      p.addListener("ready", ({ device_id }) => {
        if (cancelled) return;
        spotifySdkDevLog("ready", { device_id });
        spotifyPlaybackLog("sdk_ready", { device_id });
        setDeviceId(device_id);
        deviceIdRef.current = device_id;
        setPlayerState("ready");
        void (async () => {
          try {
            const r = await fetch("/api/spotify/player", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "transfer", device_id }),
            });
            spotifyPlaybackLog("transfer_after_ready", { status: r.status, ok: r.ok });
            const pending = pendingPlayRef.current;
            if (pending) {
              pendingPlayRef.current = null;
              spotifyPlaybackLog("pending_play_flush", { uri: pending.uri });
              await new Promise((res) => setTimeout(res, 600));
              const body: Record<string, unknown> = pending.context
                ? { action: "play", device_id, context_uri: pending.context, offset_uri: pending.uri }
                : { action: "play", device_id, uris: [pending.uri] };
              await fetch("/api/spotify/player", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(body),
              });
            }
          } catch (err) {
            spotifyPlaybackLog("transfer_after_ready_error", { err: String(err) });
          }
        })();
      });

      p.addListener("not_ready", (ev) => {
        if (cancelled) return;
        spotifySdkDevLog("not_ready", { device_id: ev?.device_id });
        spotifyPlaybackLog("sdk_not_ready", { device_id: ev?.device_id });
        setDeviceId(null);
        setPlayerState("initializing");
      });

      p.addListener("authentication_error", (e) => {
        if (cancelled) return;
        spotifySdkDevLog("authentication_error", { message: e?.message, device_id: deviceIdRef.current });
        console.warn("[spotify:player] authentication_error", e?.message);
        const now = Date.now();
        if (now - lastSpotifyAuthErrMs.current < 2800) return;
        lastSpotifyAuthErrMs.current = now;
        void (async () => {
          const st = await refreshStatusRef.current();
          if (st.sessionOk) {
            toast.info(tRef.current("spotifySessionRecoveredToast"));
            return;
          }
          await clearInvalidSpotifySession();
          toast.warning(tRef.current("spotifySessionExpiredReconnect"));
        })();
      });

      p.addListener("account_error", (e) => {
        if (cancelled) return;
        spotifySdkDevLog("account_error", { message: e?.message, device_id: deviceIdRef.current });
        console.warn("[spotify:player] account_error", e?.message);
        setPlayerState("playback_error");
        toast.error(tRef.current("spotifyPlayerAccountError"), { toastId: "spotify-account-error" });
      });

      p.addListener("initialization_error", (e) => {
        if (cancelled) return;
        spotifySdkDevLog("initialization_error", { message: e?.message, device_id: deviceIdRef.current });
        console.warn("[spotify:player] initialization_error", e?.message);
        setPlayerState("playback_error");
        toast.error(tRef.current("spotifyPlayerInitError"), { toastId: "spotify-init-error" });
      });

      p.addListener("playback_error", (e) => {
        if (cancelled) return;
        playbackErrCooldownUntilRef.current = Date.now() + 2500;
        spotifyPlaybackLog("sdk_playback_error", {
          message: e?.message,
          device_id: deviceIdRef.current,
          selected_playlist_id: selectedPlaylistIdRef.current,
          selected_playlist_uri: selectedPlaylistUriRef.current,
        });
        spotifySdkDevLog("playback_error", { message: e?.message, device_id: deviceIdRef.current });
        console.warn("[spotify:player] playback_error", e?.message);
        setPlayerState("playback_error");
        toast.warning(tRef.current("spotifyPlaybackErrorToast"), { toastId: "spotify-playback-error" });
      });

      p.addListener("player_state_changed", (state) => {
        if (cancelled) return;
        if (!state) return;
        setPlayerState((prev) => prev === "playback_error" ? "ready" : prev);
        setPaused(state.paused);
        setDurationMs(state.duration);
        if (typeof state.shuffle === "boolean") setShuffleOn(state.shuffle);
        if (typeof state.repeat_mode === "number" && state.repeat_mode >= 0 && state.repeat_mode <= 2) {
          setRepeatMode(state.repeat_mode);
        }
        const tr = state.track_window.current_track;
        if (tr) {
          const nextTrackName = tr.name;
          const nextArtistName = tr.artists.map((a) => a.name).join(", ");
          const nextArtUrl = tr.album.images[0]?.url ?? null;
          setTrackName(nextTrackName);
          setArtistName(nextArtistName);
          setArtUrl(nextArtUrl);
          updateGlobalPlayback({
            paused: state.paused,
            positionMs: state.position,
            durationMs: state.duration,
            trackName: nextTrackName,
            artistName: nextArtistName,
            artUrl: nextArtUrl,
            shuffleOn: typeof state.shuffle === "boolean" ? state.shuffle : getGlobalPlayback().shuffleOn,
            repeatMode:
              typeof state.repeat_mode === "number" && state.repeat_mode >= 0 && state.repeat_mode <= 2
                ? state.repeat_mode
                : getGlobalPlayback().repeatMode,
          });
        } else {
          if (Date.now() < playbackErrCooldownUntilRef.current) return;
          setTrackName(null);
          setArtistName(null);
          setArtUrl(null);
          setDurationMs(0);
          updateGlobalPlayback({ trackName: null, artistName: null, artUrl: null, durationMs: 0, positionMs: 0, paused: state.paused });
        }
      });
    };

    /* ── Fast-path: reuse the player that survived navigation ─────── */
    if (hasLivePlayer() && playerRef.current) {
      const p = playerRef.current;
      const existingDeviceId = getGlobalPlayback().deviceId;
      setPlayerState("ready");
      if (existingDeviceId) {
        setDeviceId(existingDeviceId);
        deviceIdRef.current = existingDeviceId;
      }
      /* Eagerly sync current player state. */
      void (async () => {
        try {
          const s = await p.getCurrentState();
          if (!s || cancelled) return;
          setPaused(s.paused);
          if (s.duration > 0) setDurationMs(s.duration);
          if (typeof s.shuffle === "boolean") setShuffleOn(s.shuffle);
          if (typeof s.repeat_mode === "number") setRepeatMode(s.repeat_mode);
          const tr = s.track_window?.current_track;
          if (tr) {
            setTrackName(tr.name);
            setArtistName(tr.artists.map((a: { name: string }) => a.name).join(", "));
            setArtUrl(tr.album.images[0]?.url ?? null);
          }
        } catch { /* ignore */ }
      })();
      /* Re-attach event listeners — the previous component's listeners were
         cancelled on unmount, so the reused player currently has no active
         listeners. Without this, player_state_changed / playback_error etc.
         fire into the void and the UI gets permanently stuck.               */
      attachListeners(p);
      return sharedCleanup;
    }

    /* ── Full initialization ──────────────────────────────────────── */
    setPlayerState("initializing");

    void (async () => {
      try {
        await ensureSpotifySdk();
        if (cancelled || !window.Spotify?.Player) return;

        const player = new window.Spotify.Player({
          name: "Ken Workspace",
          getOAuthToken: (cb) => {
            void (async () => {
              try {
                const r = await fetch("/api/spotify/token", {
                  credentials: "same-origin",
                  cache: "no-store",
                });
                let d: { access_token?: string; code?: string } = {};
                try {
                  d = await r.json();
                } catch { /* empty body */ }
                if (r.ok && typeof d.access_token === "string" && d.access_token.length > 0) {
                  cb(d.access_token);
                  return;
                }
                if (process.env.NODE_ENV === "development") {
                  console.warn(
                    "[spotify:player] token request failed — calling cb(\"\") so SDK can surface authentication_error",
                    r.status, d,
                  );
                }
                cb("");
              } catch (e) {
                console.error("[spotify:player] token fetch threw", e);
                cb("");
              }
            })();
          },
          volume: 0.75,
        });
        playerRef.current = player;

        attachListeners(player);

        const ok = await player.connect();
        if (cancelled) return;
        if (!ok) {
          console.warn("[spotify:player] connect() returned false");
          setPlayerState("playback_error");
          toast.error(tRef.current("spotifyPlayerInitError"), { toastId: "spotify-init-error" });
        }
      } catch (e) {
        console.error("[spotify:player] setup failed", e);
        if (!cancelled) {
          setPlayerState("playback_error");
          toast.error(tRef.current("spotifyPlayerInitError"), { toastId: "spotify-init-error" });
        }
      }
    })();

    return sharedCleanup;
  }, [sessionState, configured, clearInvalidSpotifySession]);

  const loadPlaylists = useCallback(async () => {
    setPlaylistsLoading(true);
    setPlaylistsLoadFailed(false);
    try {
      const listQs = new URLSearchParams({ limit: "40" });
      const r = await fetch(`/api/spotify/playlists?${listQs}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as {
        items?: { id: string; name: string; uri: string }[];
        error?: string;
      };
      if (r.status === 401) {
        const st = await refreshStatus();
        if (st.sessionOk) {
          const r2 = await fetch(`/api/spotify/playlists?${listQs}`, {
            credentials: "same-origin",
            cache: "no-store",
          });
          const j2 = (await r2.json().catch(() => ({}))) as typeof j;
          if (r2.status === 401) {
            setPlaylists([]);
            setPlaylistsLoadFailed(false);
            await clearInvalidSpotifySession();
            toast.warning(tRef.current("spotifySessionExpiredReconnect"));
            return;
          }
          if (!r2.ok) {
            setPlaylists([]);
            setSelectedPlaylistId(null);
            setSelectedPlaylistName(null);
            setSelectedPlaylistUri(null);
            setPlaylistTracks([]);
            setPlaylistTracksError(null);
            setPlaylistsLoadFailed(true);
            toast.error(
              humanizeSpotifyApiErrorText(
                j2.error ?? "",
                tRef.current,
              ),
            );
            return;
          }
          const rows2 =
            j2.items?.map((x) => ({
              id: x.id,
              name: x.name,
              uri: x.uri,
            })) ?? [];
          setPlaylists(rows2);
          return;
        }
        setPlaylists([]);
        setPlaylistsLoadFailed(false);
        await clearInvalidSpotifySession();
        toast.warning(tRef.current("spotifySessionExpiredReconnect"));
        return;
      }
      if (!r.ok) {
        setPlaylists([]);
        setSelectedPlaylistId(null);
        setSelectedPlaylistName(null);
        setSelectedPlaylistUri(null);
        setPlaylistTracks([]);
        setPlaylistTracksError(null);
        setPlaylistsLoadFailed(true);
        toast.error(
          humanizeSpotifyApiErrorText(j.error ?? "", tRef.current),
        );
        return;
      }
      const rows =
        j.items?.map((x) => ({
          id: x.id,
          name: x.name,
          uri: x.uri,
        })) ?? [];
      setPlaylists(rows);
    } finally {
      setPlaylistsLoading(false);
    }
  }, [clearInvalidSpotifySession, refreshStatus]);

  useEffect(() => {
    if (sessionState !== "connected_account") return;
    void loadPlaylists();
  }, [sessionState, loadPlaylists]);

  const loadPlaylistTracks = useCallback(
    async (playlistId: string) => {
      setPlaylistTracksLoading(true);
      setPlaylistTracksError(null);
      const tracksUrl = `/api/spotify/playlist-tracks?playlist_id=${encodeURIComponent(playlistId)}`;

      try {
        const r = await fetch(tracksUrl, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await r.json().catch(() => ({}))) as {
          tracks?: SpotifySearchTrackRow[];
          error?: string;
        };

        if (r.status === 401) {
          const st = await refreshStatus();
          if (st.sessionOk) {
            const r2 = await fetch(tracksUrl, {
              credentials: "same-origin",
              cache: "no-store",
            });
            const j2 = (await r2.json().catch(() => ({}))) as typeof j;
            if (r2.status === 401) {
              setPlaylistTracks([]);
              await clearInvalidSpotifySession();
              toast.warning(tRef.current("spotifySessionExpiredReconnect"));
              return;
            }
            if (!r2.ok) {
              setPlaylistTracks([]);
              setPlaylistTracksError(
                humanizeSpotifyApiErrorText(j2.error ?? "", tRef.current),
              );
              return;
            }
            setPlaylistTracks(j2.tracks ?? []);
            return;
          }
          setPlaylistTracks([]);
          await clearInvalidSpotifySession();
          toast.warning(tRef.current("spotifySessionExpiredReconnect"));
          return;
        }

        if (!r.ok) {
          setPlaylistTracks([]);
          setPlaylistTracksError(
            humanizeSpotifyApiErrorText(j.error ?? "", tRef.current),
          );
          return;
        }
        setPlaylistTracks(j.tracks ?? []);
      } catch {
        setPlaylistTracks([]);
        setPlaylistTracksError(tRef.current("spotifyErrGenericRequest"));
      } finally {
        setPlaylistTracksLoading(false);
      }
    },
    [clearInvalidSpotifySession, refreshStatus],
  );

  type StartPlaySpec =
    | { kind: "uris"; uris: string[] }
    | { kind: "context"; context_uri: string; offset_uri: string };

  const startSpotifyPlayback = useCallback(
    async (devId: string, spec: StartPlaySpec) => {
      const logBase: Record<string, unknown> =
        spec.kind === "uris"
          ? {
              mode: "uris",
              device_id: devId,
              uris: spec.uris,
              uri_count: spec.uris.length,
            }
          : {
              mode: "context",
              device_id: devId,
              context_uri: spec.context_uri,
              offset_uri: spec.offset_uri,
            };
      spotifyPlaybackLog("play_request", logBase);

      const buildBody = (): Record<string, unknown> => {
        if (spec.kind === "uris") {
          return { action: "play", device_id: devId, uris: spec.uris };
        }
        return {
          action: "play",
          device_id: devId,
          context_uri: spec.context_uri,
          offset_uri: spec.offset_uri,
        };
      };

      const postPlay = () =>
        fetch("/api/spotify/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(buildBody()),
        });

      const postTransfer = () =>
        fetch("/api/spotify/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "transfer", device_id: devId }),
        });

      const refreshAndRetryAuth = async (): Promise<boolean> => {
        const st = await refreshStatusRef.current();
        return st.sessionOk;
      };

      let r = await postPlay();
      let errBody = r.ok ? "" : await r.text();

      if (r.status === 401) {
        if (await refreshAndRetryAuth()) {
          r = await postPlay();
          errBody = r.ok ? "" : await r.text();
        }
        if (r.status === 401) {
          spotifyPlaybackLog("play_401_after_refresh", logBase);
          await clearInvalidSpotifySession();
          toast.warning(tRef.current("spotifyPlaybackAuthRequired"));
          return;
        }
      }

      if (!r.ok) {
        spotifyPlaybackLog("play_first_fail", {
          status: r.status,
          body_preview: errBody.slice(0, 400),
        });
        const retryable =
          r.status === 404 ||
          /device not found|no active device|not active|player command failed/i.test(
            errBody,
          );
        if (retryable) {
          // Retry 1: transfer ownership to this device, wait for Spotify to register it.
          spotifyPlaybackLog("play_retry_transfer", { device_id: devId });
          const tr = await postTransfer();
          spotifyPlaybackLog("transfer_during_retry", {
            status: tr.status,
            ok: tr.ok,
          });
          await new Promise((res) => setTimeout(res, 900));
          r = await postPlay();
          errBody = r.ok ? "" : await r.text();

          if (r.status === 401 && (await refreshAndRetryAuth())) {
            r = await postPlay();
            errBody = r.ok ? "" : await r.text();
          }
          if (r.status === 401) {
            await clearInvalidSpotifySession();
            toast.warning(tRef.current("spotifyPlaybackAuthRequired"));
            return;
          }

          // Retry 2: if still device-not-found, wait a bit longer and try once more.
          const stillNotFound =
            !r.ok &&
            (r.status === 404 ||
              /device not found|no active device|not active|player command failed/i.test(
                errBody,
              ));
          if (stillNotFound) {
            spotifyPlaybackLog("play_retry2_long_wait", { device_id: devId });
            await new Promise((res) => setTimeout(res, 1500));
            r = await postPlay();
            errBody = r.ok ? "" : await r.text();
          }
        }
      }

      if (!r.ok) {
        spotifyPlaybackLog("play_final_fail", {
          status: r.status,
          body_preview: errBody.slice(0, 400),
        });
        toast.error(
          humanizeSpotifyPlaybackHttpError(r.status, errBody, tRef.current),
        );
        return;
      }

      spotifyPlaybackLog("play_ok", { status: r.status });
    },
    [clearInvalidSpotifySession],
  );

  const playFromLibraryPanel = useCallback(
    async (trackUri: string) => {
      const devId = deviceId;
      if (!devId) {
        // Device not ready yet — queue the intent and auto-play once the SDK fires "ready".
        pendingPlayRef.current = {
          uri: trackUri,
          context: selectedPlaylistUri,
        };
        toast.info(tRef.current("spotifyWaitForDevice"));
        return;
      }
      if (playlistTracksLoading) {
        toast.info(tRef.current("spotifyPlaylistStillLoading"));
        return;
      }
      if (playlistTracksError) {
        toast.warning(tRef.current("spotifyPlaybackPlaylistNotLoaded"));
        return;
      }
      const ctx = selectedPlaylistUri;
      const inLoadedContext =
        Boolean(ctx) &&
        playlistTracks.length > 0 &&
        playlistTracks.some((t) => t.uri === trackUri);
      if (inLoadedContext && ctx) {
        await startSpotifyPlayback(devId, {
          kind: "context",
          context_uri: ctx,
          offset_uri: trackUri,
        });
        return;
      }
      await startSpotifyPlayback(devId, { kind: "uris", uris: [trackUri] });
    },
    [
      deviceId,
      playlistTracksLoading,
      playlistTracksError,
      playlistTracks,
      selectedPlaylistUri,
      startSpotifyPlayback,
    ],
  );

  const onTogglePlay = useCallback(async () => {
    if (!deviceId) return;
    if (playerRef.current) {
      await playerRef.current.togglePlay();
      return;
    }
    await fetch("/api/spotify/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: paused ? "play" : "pause",
        device_id: deviceId,
      }),
    });
  }, [deviceId, paused]);

  const onNext = useCallback(async () => {
    if (playerRef.current) {
      await playerRef.current.nextTrack();
      return;
    }
    if (!deviceId) return;
    await fetch("/api/spotify/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "next", device_id: deviceId }),
    });
  }, [deviceId]);

  const onPrev = useCallback(async () => {
    if (playerRef.current) {
      await playerRef.current.previousTrack();
      return;
    }
    if (!deviceId) return;
    await fetch("/api/spotify/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "previous", device_id: deviceId }),
    });
  }, [deviceId]);

  const performSeek = useCallback(
    async (ms: number) => {
      if (!deviceId) return;
      const clamped = Math.max(
        0,
        Math.min(ms, Math.max(0, durationMs - 1)),
      );
      const p = playerRef.current;
      try {
        if (p && typeof p.seek === "function") {
          await p.seek(clamped);
        } else {
          const r = await fetch("/api/spotify/player", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "seek",
              device_id: deviceId,
              position_ms: clamped,
            }),
          });
          if (!r.ok) {
            const j = (await r.json().catch(() => ({}))) as {
              error?: string;
            };
            toast.error(j.error ?? tRef.current("spotifyPlayFailed"));
            return;
          }
        }
      } catch {
        await fetch("/api/spotify/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "seek",
            device_id: deviceId,
            position_ms: clamped,
          }),
        });
      }
    },
    [deviceId, durationMs],
  );

  const toggleShuffle = useCallback(async () => {
    if (!deviceId) return;
    const next = !shuffleOn;
    setShuffleOn(next);
    const r = await fetch("/api/spotify/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_shuffle",
        device_id: deviceId,
        shuffle_state: next,
      }),
    });
    if (!r.ok) {
      setShuffleOn(!next);
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      toast.error(j.error ?? tRef.current("spotifyPlayFailed"));
    }
  }, [deviceId, shuffleOn]);

  const cycleRepeat = useCallback(async () => {
    if (!deviceId) return;
    const next = repeatMode === 0 ? 1 : repeatMode === 1 ? 2 : 0;
    const repeat_state =
      next === 0 ? "off" : next === 1 ? "context" : "track";
    const prev = repeatMode;
    setRepeatMode(next);
    const r = await fetch("/api/spotify/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_repeat",
        device_id: deviceId,
        repeat_state,
      }),
    });
    if (!r.ok) {
      setRepeatMode(prev);
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      toast.error(j.error ?? tRef.current("spotifyPlayFailed"));
    }
  }, [deviceId, repeatMode]);

  /* ── Lightweight 5-second poll: only sync shuffle/repeat state ──────
     Position is now tracked entirely inside SpotifyProgressSlider via RAF.
     player_state_changed handles real-time updates; this poll just catches
     drift in shuffle/repeat that the event might miss in edge cases.       */
  useEffect(() => {
    if (!deviceId || paused) return;
    const id = setInterval(async () => {
      try {
        const s = await playerRef.current?.getCurrentState();
        if (!s) return;
        if (typeof s.shuffle === "boolean") setShuffleOn(s.shuffle);
        if (
          typeof s.repeat_mode === "number" &&
          s.repeat_mode >= 0 &&
          s.repeat_mode <= 2
        ) {
          setRepeatMode(s.repeat_mode);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(id);
  }, [deviceId, paused]);

  const onLogout = useCallback(async () => {
    await applySpotifyLogoutLocal(true);
  }, [applySpotifyLogoutLocal]);

  const uiPhase = deriveUiPhase(sessionState, playerState);

  const subtitleLine = useMemo(() => {
    switch (uiPhase) {
      case "connecting":
        return t("spotifyCheckingSession");
      case "player_initializing":
        return t("spotifyWaitForDevice");
      case "playback_error":
        return t("spotifyPlaybackErrorHint");
      case "player_ready":
        return trackName ? (artistName ?? "—") : "—";
      case "connected_account":
        return t("spotifyWaitForDevice");
      default:
        return "—";
    }
  }, [uiPhase, t, trackName, artistName]);

  /* ── Stable callbacks for memoized child components ─────────────── */
  const onToggleExpand = useCallback(() => setExpanded((e) => !e), []);
  const onTogglePlayCb = useCallback(() => void onTogglePlay(), [onTogglePlay]);
  const onPrevCb = useCallback(() => void onPrev(), [onPrev]);
  const onNextCb = useCallback(() => void onNext(), [onNext]);
  const onToggleShuffleCb = useCallback(() => void toggleShuffle(), [toggleShuffle]);
  const onCycleRepeatCb = useCallback(() => void cycleRepeat(), [cycleRepeat]);
  const onLogoutCb = useCallback(() => void onLogout(), [onLogout]);
  const onSeekCommitCb = useCallback((v: number) => void performSeek(v), [performSeek]);
  const onSelectPlaylist = useCallback(
    (pl: PlaylistRow) => {
      setSelectedPlaylistId(pl.id);
      setSelectedPlaylistName(pl.name);
      setSelectedPlaylistUri(pl.uri);
      void loadPlaylistTracks(pl.id);
    },
    [loadPlaylistTracks],
  );
  const onPlayTrackCb = useCallback(
    (uri: string) => void playFromLibraryPanel(uri),
    [playFromLibraryPanel],
  );
  const onReconnectForTracks = useCallback(
    () => void openSpotifyLoginPopup({ reconsent: true }),
    [openSpotifyLoginPopup],
  );

  if (!configured) {
    if (!embedded) return null;
    return (
      <div className="mx-auto w-full max-w-[440px] px-4">
        <div className="rounded-2xl border border-zinc-200/90 bg-white px-8 py-10 text-center text-sm leading-relaxed text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          {t("spotifyConfigureEnvHint")}
        </div>
      </div>
    );
  }

  if (sessionState === "connecting") {
    if (embedded) {
      return (
        <div className="mx-auto flex w-full justify-center px-4 py-16">
          <div className="flex flex-col items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-10 w-10 animate-spin text-zinc-400" aria-hidden />
            <p>{t("spotifyCheckingSession")}</p>
          </div>
        </div>
      );
    }
    return null;
  }

  if (sessionState === "session_transient") {
    const transientCard = (
      <div className="mx-auto w-full max-w-[440px] rounded-2xl border border-sky-200/90 bg-sky-50/90 px-6 py-8 text-center shadow-sm dark:border-sky-900/40 dark:bg-sky-950/25">
        <p className="text-sm leading-relaxed text-sky-950 dark:text-sky-100">
          {t("spotifySessionTransientHint")}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => void refreshStatus()}
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {t("spotifySessionRetryNow")}
          </button>
          <button
            type="button"
            onClick={() => void openSpotifyLoginPopup()}
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            {t("spotifyReconnect")}
          </button>
        </div>
      </div>
    );
    if (embedded) {
      return (
        <div className="mx-auto flex w-full justify-center px-4">
          {transientCard}
        </div>
      );
    }
    return null;
  }

  if (sessionState === "session_invalid") {
    const invalidCard = (
      <div className="mx-auto w-full max-w-[440px] rounded-2xl border border-amber-200/90 bg-amber-50/90 px-6 py-8 text-center shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-sm leading-relaxed text-amber-950 dark:text-amber-100">
          {sessionFailKind === "decrypt"
            ? t("spotifySessionDecryptHint")
            : sessionFailKind === "revoked"
              ? t("spotifySessionRefreshRevokedHint")
              : t("spotifySessionExpiredReconnect")}
        </p>
        <button
          type="button"
          onClick={() => void openSpotifyLoginPopup({ reconsent: true })}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {t("spotifyReconnect")}
        </button>
      </div>
    );
    if (embedded) {
      return <div className="mx-auto flex w-full justify-center px-4">{invalidCard}</div>;
    }
    return null;
  }

  if (sessionState === "disconnected") {
    if (embedded) {
      return (
        <div className="mx-auto flex w-full justify-center px-4">
          <SpotifyConnectCard
            onConnect={() => void openSpotifyLoginPopup()}
            t={t}
          />
        </div>
      );
    }
    return null;
  }

  /* ── Embedded (Spotify page) keeps the original card layout ─────── */
  if (embedded) {
    const embeddedOuter =
      "relative z-[95] mx-auto flex w-full max-w-4xl flex-col gap-2 rounded-3xl bg-gradient-to-b from-zinc-100/80 via-white/50 to-transparent px-3 py-3 dark:from-zinc-950/90 dark:via-zinc-950/40 dark:to-transparent";

    return (
      <div className={embeddedOuter}>
        {expanded ? (
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)] ring-1 ring-zinc-900/[0.05] dark:border-zinc-700/90 dark:bg-zinc-900 dark:ring-white/[0.06]">
            <SpotifyPlaylistPanel
              t={t}
              playlists={playlists}
              playlistsLoading={playlistsLoading}
              playlistsLoadFailed={playlistsLoadFailed}
              selectedPlaylistId={selectedPlaylistId}
              selectedPlaylistName={selectedPlaylistName}
              onSelectPlaylist={onSelectPlaylist}
              playlistTracks={playlistTracks}
              playlistTracksLoading={playlistTracksLoading}
              playlistTracksError={playlistTracksError}
              tracksPlayDisabled={
                playlistTracksLoading || Boolean(playlistTracksError)
              }
              onPlayTrack={onPlayTrackCb}
              onReconnectForPlaylistTracks={onReconnectForTracks}
              maxHeightClass="max-h-[min(55vh,400px)]"
            />
          </div>
        ) : null}
        <SpotifyPlayerCard
          className="w-full shrink-0"
          t={t}
          formatMs={formatPlaybackMs}
          playerRef={playerRef}
          artUrl={artUrl}
          trackName={trackName}
          subtitleLine={subtitleLine}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          deviceId={deviceId}
          durationMs={durationMs}
          onSeekCommit={onSeekCommitCb}
          paused={paused}
          onTogglePlay={onTogglePlayCb}
          onPrev={onPrevCb}
          onNext={onNextCb}
          shuffleOn={shuffleOn}
          onToggleShuffle={onToggleShuffleCb}
          repeatMode={repeatMode}
          onCycleRepeat={onCycleRepeatCb}
          onLogout={onLogoutCb}
          showInitializingHint={
            uiPhase === "player_initializing" && !deviceId
          }
          showDisconnect={!spotifyPersonalMode}
        />
      </div>
    );
  }

  /* ── Non-embedded: hover-expand floating corner widget at bottom-right */
  const barInvisibleClass = visuallyHidden
    ? "invisible pointer-events-none select-none"
    : "";

  return (
    <div
      className={`fixed bottom-4 right-4 z-[95] ${barInvisibleClass}`}
      style={{ maxWidth: "calc(100vw - 2rem)" }}
      aria-hidden={visuallyHidden ? true : undefined}
    >
      <SpotifyPlayerCard
        layout="floating"
        t={t}
        formatMs={formatPlaybackMs}
        playerRef={playerRef}
        artUrl={artUrl}
        trackName={trackName}
        subtitleLine={subtitleLine}
        expanded={false}
        deviceId={deviceId}
        durationMs={durationMs}
        onSeekCommit={onSeekCommitCb}
        paused={paused}
        onTogglePlay={onTogglePlayCb}
        onPrev={onPrevCb}
        onNext={onNextCb}
        shuffleOn={shuffleOn}
        onToggleShuffle={onToggleShuffleCb}
        repeatMode={repeatMode}
        onCycleRepeat={onCycleRepeatCb}
        onLogout={onLogoutCb}
        showInitializingHint={uiPhase === "player_initializing" && !deviceId}
        showDisconnect={false}
      />
    </div>
  );
}



export function SpotifyDock({
  embedded = false,
  visuallyHidden = false,
}: {
  embedded?: boolean;
  visuallyHidden?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <SpotifyDockInner embedded={embedded} visuallyHidden={visuallyHidden} />
    </Suspense>
  );
}
