import type { LocalParticipant, RemoteParticipant, Room, ScreenShareCaptureOptions } from "livekit-client";
import { Track } from "livekit-client";

/* ── Mime type selection ── */

let cachedWebmMime: string | undefined | null = null;

export function chooseWebmMimeType(): string | undefined {
    if (cachedWebmMime !== null) return cachedWebmMime;
    if (typeof MediaRecorder === "undefined") {
        cachedWebmMime = undefined;
        return undefined;
    }
    for (const type of [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
    ]) {
        if (MediaRecorder.isTypeSupported(type)) {
            cachedWebmMime = type;
            return type;
        }
    }
    cachedWebmMime = undefined;
    return undefined;
}

/* ── Room recording: direct track capture + mixed audio ── */

export type ComposedRecordingHandle = {
    stream: MediaStream;
    cleanup: () => void;
    /** True if we started screen share for recording (should stop it when recording stops). */
    ownsScreenShare: boolean;
};

/**
 * Build a recording stream from LiveKit participant tracks.
 *
 * Video priority: local screen share > remote screen > remote cam > local cam.
 * If no video is available, starts LiveKit screen share (single picker) then uses that track.
 *
 * Audio: mixes all tracks (mic + remote + screen audio) via Web Audio API.
 */
export async function buildRoomRecordingStream(
    room: Room,
    screenShareCaptureOpts?: ScreenShareCaptureOptions,
): Promise<ComposedRecordingHandle | null> {
    const lp = room.localParticipant;
    let ownsScreenShare = false;

    // -- Find the best video track --
    let primaryVideoTrack = findBestVideoTrack(room);

    // If no video available, start screen share via LiveKit (single picker, shared with call)
    if (!primaryVideoTrack) {
        try {
            await lp.setScreenShareEnabled(true, screenShareCaptureOpts);
            // Wait briefly for the track to be published
            await waitForTrack(lp, Track.Source.ScreenShare, 3000);
            primaryVideoTrack = getLiveTrack(lp, Track.Source.ScreenShare);
            if (primaryVideoTrack) ownsScreenShare = true;
        } catch {
            // User cancelled the picker
        }
    }

    // -- Collect all audio tracks --
    const allAudioTracks: MediaStreamTrack[] = [];
    const collectAudio = (p: LocalParticipant | RemoteParticipant) => {
        const mic = getLiveTrack(p, Track.Source.Microphone);
        if (mic) allAudioTracks.push(mic);
        const screenAud = getLiveTrack(p, Track.Source.ScreenShareAudio);
        if (screenAud) allAudioTracks.push(screenAud);
    };
    collectAudio(lp);
    room.remoteParticipants.forEach((p) => collectAudio(p));

    if (!primaryVideoTrack && allAudioTracks.length === 0) return null;

    // -- Mix audio via Web Audio API --
    let audioCtx: AudioContext | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    const sourceNodes: MediaStreamAudioSourceNode[] = [];

    if (allAudioTracks.length > 0) {
        try {
            audioCtx = new AudioContext();
            destination = audioCtx.createMediaStreamDestination();
            for (const mst of allAudioTracks) {
                const src = audioCtx.createMediaStreamSource(new MediaStream([mst]));
                src.connect(destination);
                sourceNodes.push(src);
            }
        } catch {
            // Audio mixing failed — proceed video-only
        }
    }

    // -- Combine into final stream --
    const finalTracks: MediaStreamTrack[] = [];
    if (primaryVideoTrack) finalTracks.push(primaryVideoTrack);
    if (destination) {
        const at = destination.stream.getAudioTracks()[0];
        if (at) finalTracks.push(at);
    }

    if (finalTracks.length === 0) return null;

    const finalStream = new MediaStream(finalTracks);

    const cleanup = () => {
        sourceNodes.forEach((s) => {
            try { s.disconnect(); } catch { /* */ }
        });
        if (audioCtx && audioCtx.state !== "closed") {
            void audioCtx.close();
        }
    };

    return { stream: finalStream, cleanup, ownsScreenShare };
}

function findBestVideoTrack(room: Room): MediaStreamTrack | null {
    const lp = room.localParticipant;

    // Priority 1: local screen share
    const localScreen = getLiveTrack(lp, Track.Source.ScreenShare);
    if (localScreen) return localScreen;

    // Priority 2: remote screen / remote camera
    let remoteCam: MediaStreamTrack | null = null;
    for (const [, p] of room.remoteParticipants) {
        const rs = getLiveTrack(p, Track.Source.ScreenShare);
        if (rs) return rs;
        if (!remoteCam) remoteCam = getLiveTrack(p, Track.Source.Camera);
    }
    if (remoteCam) return remoteCam;

    // Priority 3: local camera
    return getLiveTrack(lp, Track.Source.Camera);
}

function getLiveTrack(
    p: LocalParticipant | RemoteParticipant,
    source: Track.Source,
): MediaStreamTrack | null {
    const mst = p.getTrackPublication(source)?.track?.mediaStreamTrack;
    return mst && mst.readyState === "live" ? mst : null;
}

/** Wait for a track publication to appear on a participant. */
function waitForTrack(
    p: LocalParticipant,
    source: Track.Source,
    timeoutMs: number,
): Promise<void> {
    return new Promise((resolve) => {
        // Already published?
        if (getLiveTrack(p, source)) { resolve(); return; }

        const timer = setTimeout(resolve, timeoutMs);
        const check = () => {
            if (getLiveTrack(p, source)) {
                clearTimeout(timer);
                resolve();
            }
        };
        // Poll briefly — LiveKit publishes track synchronously after setScreenShareEnabled resolves
        const poll = setInterval(check, 100);
        setTimeout(() => { clearInterval(poll); resolve(); }, timeoutMs);
    });
}
