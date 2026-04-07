import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getAuthUser } from "@/lib/get-auth-user";
import { getR2Client } from "@/lib/r2-client";
import { buildR2PublicUrl, R2_BUCKET, R2_CHAT_FILES_PREFIX } from "@/lib/r2-url";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 50_000_000; // 50 MB

const ALLOWED_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|png|jpe?g|gif|webp)$/i;

function sanitizeName(name: string): string {
    const base = name.trim().replace(/\s+/g, "-");
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, "");
    return safe.slice(0, 120) || "file";
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const contentType =
        typeof body?.contentType === "string" && body.contentType.trim()
            ? body.contentType.trim().slice(0, 200)
            : "application/octet-stream";
    const size = typeof body?.size === "number" ? body.size : Number(body?.size);

    if (!fileName) {
        return NextResponse.json({ error: "fileName required" }, { status: 400 });
    }
    if (!ALLOWED_EXTENSIONS.test(fileName)) {
        return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }
    if (Number.isFinite(size) && (size <= 0 || size > MAX_BYTES)) {
        return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 400 });
    }

    const safe = sanitizeName(fileName);
    const key = `${R2_CHAT_FILES_PREFIX}${user.id}/${randomUUID()}-${safe}`;

    try {
        const client = getR2Client();
        const cmd = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            ContentType: contentType,
        });
        const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 3600 });
        return NextResponse.json({
            uploadUrl,
            url: buildR2PublicUrl(key),
            key,
            contentType,
        });
    } catch (e) {
        if (e instanceof Error && e.message === "R2_CLIENT_NOT_CONFIGURED") {
            return NextResponse.json(
                { error: "R2 not configured on server", code: "R2_CLIENT_NOT_CONFIGURED" },
                { status: 500 },
            );
        }
        console.error("r2 chat-presign", e);
        return NextResponse.json({ error: "Presign failed" }, { status: 500 });
    }
}
