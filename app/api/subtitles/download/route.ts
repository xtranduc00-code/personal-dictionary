import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { gunzipSync } from "zlib";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getAuthUser } from "@/lib/get-auth-user";
import { getR2Client } from "@/lib/r2-client";
import { buildR2PublicUrl, R2_BUCKET, R2_SUBTITLES_PREFIX } from "@/lib/r2-url";
import { srtToVtt } from "@/lib/srt-to-vtt";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENSUBTITLES_BASE = "https://api.opensubtitles.com/api/v1";

function getApiKey(): string {
    return process.env.OPENSUBTITLES_API_KEY?.trim() || "";
}

function sanitizeName(name: string): string {
    const base = name.trim().replace(/\s+/g, "-");
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, "");
    return safe.slice(0, 120) || "subtitle";
}

function asText(buf: Buffer): string {
    return buf.toString("utf8");
}

function isGzip(buf: Buffer): boolean {
    return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function isZip(buf: Buffer): boolean {
    return (
        buf.length >= 4
        && buf[0] === 0x50
        && buf[1] === 0x4b
        && buf[2] === 0x03
        && buf[3] === 0x04
    );
}

async function extractSubtitleFromZip(buf: Buffer): Promise<{ name: string; content: Buffer } | null> {
    const zip = await JSZip.loadAsync(buf);
    const files = Object.values(zip.files).filter((f) => !f.dir);
    const pick =
        files.find((f) => /\.vtt$/i.test(f.name))
        || files.find((f) => /\.srt$/i.test(f.name))
        || null;
    if (!pick) {
        return null;
    }
    const bytes = await pick.async("uint8array");
    const content = Buffer.from(bytes);
    return { name: pick.name.split("/").pop() || "subtitle.srt", content };
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const apiKey = getApiKey();
    if (!apiKey) {
        return NextResponse.json({ error: "OpenSubtitles not configured" }, { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    const fileId = typeof body?.fileId === "number" ? body.fileId : Number(body?.fileId);
    const desiredNameRaw = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    if (!Number.isFinite(fileId) || fileId <= 0) {
        return NextResponse.json({ error: "fileId required" }, { status: 400 });
    }

    try {
        const dlRes = await fetch(`${OPENSUBTITLES_BASE}/download`, {
            method: "POST",
            headers: {
                "Api-Key": apiKey,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "KenWorkspace/1.0",
            },
            body: JSON.stringify({ file_id: fileId }),
            signal: AbortSignal.timeout(15_000),
        });
        const dlText = await dlRes.text();
        if (!dlRes.ok) {
            return NextResponse.json(
                { error: "OpenSubtitles download error", status: dlRes.status, body: dlText.slice(0, 2000) },
                { status: 502 },
            );
        }
        const dlJson = JSON.parse(dlText) as { link?: string; file_name?: string };
        const link = typeof dlJson?.link === "string" ? dlJson.link : "";
        if (!link) {
            return NextResponse.json({ error: "Missing download link" }, { status: 502 });
        }

        const fileRes = await fetch(link, { signal: AbortSignal.timeout(30_000) });
        if (!fileRes.ok) {
            return NextResponse.json({ error: "Failed to fetch subtitle file" }, { status: 502 });
        }
        const arr = await fileRes.arrayBuffer();
        let buf: Buffer = Buffer.from(new Uint8Array(arr));

        if (isGzip(buf)) {
            buf = gunzipSync(buf);
        }
        else if (isZip(buf)) {
            const extracted = await extractSubtitleFromZip(buf);
            if (!extracted) {
                return NextResponse.json({ error: "No .srt/.vtt found in zip" }, { status: 502 });
            }
            buf = extracted.content;
        }

        const ext = desiredNameRaw.toLowerCase().endsWith(".vtt")
            ? ".vtt"
            : desiredNameRaw.toLowerCase().endsWith(".srt")
                ? ".srt"
                : (dlJson.file_name?.toLowerCase().endsWith(".vtt") ? ".vtt" : ".srt");
        const baseName = sanitizeName(desiredNameRaw || dlJson.file_name || `subtitle${ext}`);
        const uploadExt = ext === ".vtt" ? ".vtt" : ".vtt";
        const baseNoExt = baseName.replace(/\.(srt|vtt)$/i, "");
        const nameWithExt = `${baseNoExt}${uploadExt}`;
        const key = `${R2_SUBTITLES_PREFIX}${user.id}/${randomUUID()}-${nameWithExt}`;
        const contentType = "text/vtt; charset=utf-8";

        const rawText = asText(buf);
        const vttText = ext === ".vtt" ? rawText : srtToVtt(rawText);

        const client = getR2Client();
        await client.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: vttText,
            ContentType: contentType,
        }));

        return NextResponse.json({ key, url: buildR2PublicUrl(key) });
    }
    catch (e) {
        console.error("opensubtitles download", e);
        return NextResponse.json({ error: "Download failed" }, { status: 500 });
    }
}

