/** LiveKit data topic — keep in sync across peers */
export const WATCH_SYNC_TOPIC = "ken-watch-sync";

const MAX_SYNC_URL_LEN = 4096;

/** Only https (or dev http on loopback) — never blob:, data:, javascript: */
export function isAllowedSyncedMediaUrl(raw: string): boolean {
    if (typeof raw !== "string" || raw.length > MAX_SYNC_URL_LEN) {
        return false;
    }
    try {
        const u = new URL(raw);
        if (u.protocol === "https:") {
            return Boolean(u.hostname);
        }
        if (u.protocol === "http:") {
            return u.hostname === "localhost" || u.hostname === "127.0.0.1";
        }
        return false;
    }
    catch {
        return false;
    }
}

export type WatchSyncEnvelope =
    | {
          v: 1;
          kind: "state";
          currentTime: number;
          playing: boolean;
          sentAt: number;
          /** Default / omitted = local file sync */
          source?: "file" | "youtube";
          /** Required when source is youtube */
          youtubeId?: string;
          /** Public https URL for the video element — peers cannot use another tab's blob: URL */
          fileUrl?: string;
          subtitleUrl?: string;
      }
    | {
          v: 1;
          kind: "req";
          sentAt: number;
      };

export function encodeWatchSync(msg: WatchSyncEnvelope): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(msg));
}

export function parseWatchSync(raw: Uint8Array): WatchSyncEnvelope | null {
    try {
        const text = new TextDecoder().decode(raw);
        const data = JSON.parse(text) as unknown;
        if (!data || typeof data !== "object") {
            return null;
        }
        const o = data as Record<string, unknown>;
        if (o.v !== 1) {
            return null;
        }
        if (o.kind === "req" && typeof o.sentAt === "number") {
            return { v: 1, kind: "req", sentAt: o.sentAt };
        }
        if (
            o.kind === "state"
            && typeof o.currentTime === "number"
            && typeof o.playing === "boolean"
            && typeof o.sentAt === "number"
        ) {
            const source = o.source === "youtube" ? "youtube" : "file";
            if (source === "youtube") {
                if (typeof o.youtubeId !== "string" || !/^[a-zA-Z0-9_-]{11}$/.test(o.youtubeId)) {
                    return null;
                }
                return {
                    v: 1,
                    kind: "state",
                    currentTime: o.currentTime,
                    playing: o.playing,
                    sentAt: o.sentAt,
                    source: "youtube",
                    youtubeId: o.youtubeId,
                };
            }
            const fileMsg: WatchSyncEnvelope = {
                v: 1,
                kind: "state",
                currentTime: o.currentTime,
                playing: o.playing,
                sentAt: o.sentAt,
                source: "file",
            };
            if (typeof o.fileUrl === "string" && isAllowedSyncedMediaUrl(o.fileUrl)) {
                fileMsg.fileUrl = o.fileUrl;
            }
            if (
                typeof o.subtitleUrl === "string"
                && o.subtitleUrl.length > 0
                && isAllowedSyncedMediaUrl(o.subtitleUrl)
            ) {
                fileMsg.subtitleUrl = o.subtitleUrl;
            }
            return fileMsg;
        }
        return null;
    }
    catch {
        return null;
    }
}

/**
 * While both peers publish playhead every few seconds, sub-second drift is normal.
 * Seeking on every packet causes visible stutter; only correct large drift when playing.
 */
const DRIFT_SEEK_WHILE_PLAYING_SEC = 2.5;

export function applyRemoteVideoState(
    video: HTMLVideoElement,
    currentTime: number,
    playing: boolean,
    onPlayBlocked?: () => void,
): void {
    if (!Number.isFinite(currentTime) || currentTime < 0) {
        return;
    }
    const drift = Math.abs(video.currentTime - currentTime);
    if (playing) {
        if (drift > DRIFT_SEEK_WHILE_PLAYING_SEC) {
            video.currentTime = currentTime;
        }
        if (video.paused) {
            void video.play().catch(() => {
                onPlayBlocked?.();
            });
        }
    }
    else {
        video.pause();
        if (drift > 0.08) {
            video.currentTime = currentTime;
        }
    }
}
