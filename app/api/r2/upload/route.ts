import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";
import Busboy from "busboy";
import { Upload } from "@aws-sdk/lib-storage";
import { getAuthUser } from "@/lib/get-auth-user";
import { getR2Client } from "@/lib/r2-client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { srtToVtt } from "@/lib/srt-to-vtt";
import {
    buildR2PublicUrl,
    R2_BUCKET,
    R2_MOVIES_PREFIX,
    R2_SUBTITLES_PREFIX,
} from "@/lib/r2-url";

export const runtime = "nodejs";
/** Netlify: raise “Function timeout” in UI if large videos still stop early (sync upload = one function run). */
export const maxDuration = 900;

const MAX_BYTES = 20_000_000_000; // 20GB safety limit for large videos

function sanitizeName(name: string): string {
    const base = name.trim().replace(/\s+/g, "-");
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, "");
    return safe.slice(0, 120) || "video";
}

function looksLikeVideoName(name: string): boolean {
    return /\.(mkv|webm|mp4|mov|m4v)$/i.test(name || "");
}

function looksLikeSubtitleName(name: string): boolean {
    return /\.(srt|vtt)$/i.test(name || "");
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }
    const bodyStream = req.body ? Readable.fromWeb(req.body as unknown as WebReadableStream) : null;
    if (!bodyStream) {
        return NextResponse.json({ error: "Missing body" }, { status: 400 });
    }

    try {
        const client = getR2Client();
        const result = await new Promise<{ key: string; url: string }>((resolve, reject) => {
            let settled = false;
            let uploaded = false;
            let bytes = 0;
            let kind: "video" | "subtitle" = "video";

            const bb = Busboy({
                headers: { "content-type": contentType },
                limits: { fileSize: MAX_BYTES, files: 1 },
            });

            const settleOnce = (fn: () => void) => {
                if (settled) {
                    return;
                }
                settled = true;
                fn();
            };

            const onAbort = () => {
                // Client disconnected/cancelled. Avoid bubbling ECONNRESET as uncaughtException.
                try {
                    bb.removeAllListeners();
                    bodyStream.unpipe(bb);
                    bb.destroy();
                    bodyStream.destroy();
                }
                catch {
                    /* ignore */
                }
                settleOnce(() => reject(new Error("ABORTED")));
            };

            req.signal.addEventListener("abort", onAbort, { once: true });
            bodyStream.on("error", onAbort);

            bb.on("field", (name, val) => {
                if (name === "kind") {
                    const k = String(val || "").trim().toLowerCase();
                    kind = k === "subtitle" ? "subtitle" : "video";
                }
            });

            bb.on("file", (_field, file, info) => {
                if (uploaded) {
                    file.resume();
                    return;
                }
                uploaded = true;
                const filename = sanitizeName(info.filename || "video");
                const mime = info.mimeType || "application/octet-stream";
                if (
                    kind === "video"
                    && !(mime.startsWith("video/") || looksLikeVideoName(filename))
                ) {
                    file.resume();
                    if (!settled) {
                        settled = true;
                        reject(new Error("INVALID_VIDEO_TYPE"));
                    }
                    return;
                }
                if (
                    kind === "subtitle"
                    && !(mime === "text/vtt" || mime.startsWith("text/") || looksLikeSubtitleName(filename))
                ) {
                    file.resume();
                    if (!settled) {
                        settled = true;
                        reject(new Error("INVALID_SUBTITLE_TYPE"));
                    }
                    return;
                }
                const prefix = kind === "subtitle" ? R2_SUBTITLES_PREFIX : R2_MOVIES_PREFIX;
                const isSrt = kind === "subtitle" && /\.srt$/i.test(filename);
                const finalName =
                    kind === "subtitle"
                        ? filename.replace(/\.(srt|vtt)$/i, ".vtt")
                        : filename;
                const key = `${prefix}${user.id}/${randomUUID()}-${finalName}`;
                file.on("data", (chunk: Buffer) => {
                    bytes += chunk.length;
                });
                file.on("limit", () => {
                    settleOnce(() => reject(new Error("FILE_TOO_LARGE")));
                });
                if (kind === "subtitle") {
                    const chunks: Buffer[] = [];
                    file.on("data", (chunk: Buffer) => {
                        chunks.push(chunk);
                    });
                    file.on("end", async () => {
                        try {
                            const raw = Buffer.concat(chunks).toString("utf8");
                            const vtt = isSrt ? srtToVtt(raw) : (raw.startsWith("WEBVTT") ? raw : `WEBVTT\n\n${raw}`);
                            await client.send(new PutObjectCommand({
                                Bucket: R2_BUCKET,
                                Key: key,
                                Body: vtt,
                                ContentType: "text/vtt; charset=utf-8",
                            }));
                            settleOnce(() => resolve({ key, url: buildR2PublicUrl(key) }));
                        }
                        catch (e) {
                            settleOnce(() => reject(e));
                        }
                    });
                    return;
                }

                const up = new Upload({
                    client,
                    params: {
                        Bucket: R2_BUCKET,
                        Key: key,
                        Body: file,
                        ContentType: mime,
                    },
                });
                up.done()
                    .then(() => {
                        settleOnce(() => resolve({ key, url: buildR2PublicUrl(key) }));
                    })
                    .catch((e) => {
                        settleOnce(() => reject(e));
                    });
            });

            bb.on("error", (e) => {
                settleOnce(() => reject(e));
            });
            bb.on("finish", () => {
                if (!uploaded && !settled) {
                    settleOnce(() => reject(new Error("MISSING_FILE")));
                }
                if (uploaded && bytes <= 0 && !settled) {
                    settleOnce(() => reject(new Error("EMPTY_FILE")));
                }
            });

            bodyStream.pipe(bb);
        });
        return NextResponse.json(result);
    }
    catch (e) {
        if (e instanceof Error && e.message === "ABORTED") {
            // Client cancelled upload; don't crash dev server.
            return NextResponse.json({ error: "aborted" }, { status: 499 });
        }
        if (e instanceof Error && e.message === "INVALID_VIDEO_TYPE") {
            return NextResponse.json({ error: "Invalid video type" }, { status: 400 });
        }
        if (e instanceof Error && e.message === "INVALID_SUBTITLE_TYPE") {
            return NextResponse.json({ error: "Invalid subtitle type" }, { status: 400 });
        }
        if (e instanceof Error && e.message === "FILE_TOO_LARGE") {
            return NextResponse.json({ error: `File too large (max ${Math.floor(MAX_BYTES / 1_000_000_000)}GB)` }, { status: 400 });
        }
        if (e instanceof Error && (e.message === "MISSING_FILE" || e.message === "EMPTY_FILE")) {
            return NextResponse.json({ error: "file required" }, { status: 400 });
        }
        if (e instanceof Error && e.message === "R2_CLIENT_NOT_CONFIGURED") {
            return NextResponse.json(
                {
                    error: "R2 not configured on server",
                    code: "R2_CLIENT_NOT_CONFIGURED",
                },
                { status: 500 },
            );
        }
        console.error("r2 upload", e);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}

