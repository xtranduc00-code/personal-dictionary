"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

/**
 * Client-side WebM → MP4 conversion via ffmpeg.wasm.
 *
 * The command stream-copies video and re-encodes audio to AAC so the MP4 is
 * widely playable. If the browser recorded VP8/VP9 (which MP4 does not
 * universally play back), callers must treat a throw as "use .webm fallback".
 */

const CORE_VERSION = "0.12.6";
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(): Promise<FFmpeg> {
    if (ffmpegInstance) {
        return ffmpegInstance;
    }
    if (loadPromise) {
        return loadPromise;
    }
    loadPromise = (async () => {
        const ff = new FFmpeg();
        const [coreURL, wasmURL] = await Promise.all([
            toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
            toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
        ]);
        await ff.load({ coreURL, wasmURL });
        ffmpegInstance = ff;
        return ff;
    })();
    try {
        return await loadPromise;
    } catch (e) {
        loadPromise = null;
        throw e;
    }
}

export type ConvertProgress = (percent: number) => void;

export async function convertWebmToMp4(
    input: Blob,
    onProgress?: ConvertProgress,
): Promise<Blob> {
    const ff = await getFfmpeg();

    const handleProgress = ({ progress }: { progress: number }) => {
        if (!onProgress) return;
        const clamped = Math.max(0, Math.min(1, progress));
        onProgress(Math.round(clamped * 100));
    };
    ff.on("progress", handleProgress);

    try {
        await ff.writeFile("input.webm", await fetchFile(input));
        await ff.exec([
            "-i",
            "input.webm",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "output.mp4",
        ]);
        const out = await ff.readFile("output.mp4");
        const bytes = typeof out === "string" ? new TextEncoder().encode(out) : out;
        return new Blob([bytes as BlobPart], { type: "video/mp4" });
    } finally {
        ff.off("progress", handleProgress);
        // Clean the virtual FS so consecutive conversions start fresh.
        try {
            await ff.deleteFile("input.webm");
        } catch {
            /* ignore */
        }
        try {
            await ff.deleteFile("output.mp4");
        } catch {
            /* ignore */
        }
    }
}
