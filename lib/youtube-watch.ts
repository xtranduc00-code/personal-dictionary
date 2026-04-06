/** YouTube IFrame Player API — state codes */
export const YT_STATE_PLAYING = 1;
export const YT_STATE_PAUSED = 2;
export const YT_STATE_BUFFERING = 3;

export type YtPlayerApi = {
    getCurrentTime: () => number;
    getDuration: () => number;
    getPlayerState: () => number;
    seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
    playVideo: () => void;
    pauseVideo: () => void;
    setVolume: (n: number) => void;
    mute: () => void;
    unMute: () => void;
    isMuted: () => boolean;
    destroy: () => void;
    // Playback rate
    setPlaybackRate: (rate: number) => void;
    getPlaybackRate: () => number;
    getAvailablePlaybackRates: () => number[];
    // Quality
    setPlaybackQuality: (quality: string) => void;
    getPlaybackQuality: () => string;
    getAvailableQualityLevels: () => string[];
    // Captions (unofficial but widely used)
    loadModule: (module: string) => void;
    unloadModule: (module: string) => void;
    setOption: (module: string, option: string, value: unknown) => void;
};

type YtPlayerOptions = {
    videoId: string;
    /** Kích thước player (API mặc định 640×360 nếu không truyền) */
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
        onReady?: (event: { target: YtPlayerApi }) => void;
        onStateChange?: (event: { data: number; target: YtPlayerApi }) => void;
    };
};

type YtNamespace = {
    Player: new (elementOrId: string | HTMLElement, options: YtPlayerOptions) => YtPlayerApi;
};

declare global {
    interface Window {
        YT?: YtNamespace;
        onYouTubeIframeAPIReady?: () => void;
    }
}

let iframeApiPromise: Promise<void> | null = null;

export function loadYoutubeIframeApi(): Promise<void> {
    if (typeof window === "undefined") {
        return Promise.resolve();
    }
    if (window.YT?.Player) {
        return Promise.resolve();
    }
    if (!iframeApiPromise) {
        iframeApiPromise = new Promise((resolve) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                prev?.();
                resolve();
            };
            if (!document.querySelector("script[data-yt-iframe-api=\"1\"]")) {
                const tag = document.createElement("script");
                tag.src = "https://www.youtube.com/iframe_api";
                tag.setAttribute("data-yt-iframe-api", "1");
                document.body.appendChild(tag);
            }
        });
    }
    return iframeApiPromise;
}

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeVideoId(input: string): string | null {
    const s = input.trim();
    if (!s) {
        return null;
    }
    if (YT_ID_RE.test(s)) {
        return s;
    }
    try {
        const withProto = s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
        const u = new URL(withProto);
        const host = u.hostname.replace(/^www\./, "");
        if (host === "youtu.be") {
            const id = u.pathname.replace(/^\//, "").slice(0, 11);
            return YT_ID_RE.test(id) ? id : null;
        }
        if (host === "youtube.com" || host === "m.youtube.com") {
            if (u.pathname.startsWith("/shorts/")) {
                const id = u.pathname.slice("/shorts/".length).split("/")[0]?.slice(0, 11) ?? "";
                return YT_ID_RE.test(id) ? id : null;
            }
            if (u.pathname.startsWith("/embed/")) {
                const id = u.pathname.slice("/embed/".length).split("/")[0]?.slice(0, 11) ?? "";
                return YT_ID_RE.test(id) ? id : null;
            }
            const v = u.searchParams.get("v");
            if (v && YT_ID_RE.test(v)) {
                return v;
            }
        }
    }
    catch {
        return null;
    }
    return null;
}

/** Match watch-party-protocol: avoid micro-seeks while both sides heartbeat playhead. */
const YT_DRIFT_SEEK_WHILE_PLAYING_SEC = 2.5;

export function applyRemoteYoutubeState(
    player: YtPlayerApi,
    currentTime: number,
    playing: boolean,
    onPlayBlocked?: () => void,
): void {
    if (!Number.isFinite(currentTime) || currentTime < 0) {
        return;
    }
    let now = 0;
    try {
        now = player.getCurrentTime();
    }
    catch {
        return;
    }
    const drift = Math.abs(now - currentTime);
    if (playing) {
        if (drift > YT_DRIFT_SEEK_WHILE_PLAYING_SEC) {
            player.seekTo(currentTime, true);
        }
        const st = player.getPlayerState();
        if (st !== YT_STATE_PLAYING && st !== YT_STATE_BUFFERING) {
            player.playVideo();
            if (onPlayBlocked) {
                window.setTimeout(() => {
                    try {
                        const s = player.getPlayerState();
                        if (s !== YT_STATE_PLAYING && s !== YT_STATE_BUFFERING) {
                            onPlayBlocked();
                        }
                    }
                    catch {
                        /* ignore */
                    }
                }, 450);
            }
        }
    }
    else {
        player.pauseVideo();
        if (drift > 0.08) {
            player.seekTo(currentTime, true);
        }
    }
}
