/** LiveKit data topic — keep in sync across peers */
export const WATCH_SYNC_TOPIC = "ken-watch-sync";

export type WatchSyncEnvelope =
    | {
          v: 1;
          kind: "state";
          currentTime: number;
          playing: boolean;
          sentAt: number;
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
            return {
                v: 1,
                kind: "state",
                currentTime: o.currentTime,
                playing: o.playing,
                sentAt: o.sentAt,
            };
        }
        return null;
    }
    catch {
        return null;
    }
}

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
    if (drift > 0.35) {
        video.currentTime = currentTime;
    }
    if (playing) {
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
