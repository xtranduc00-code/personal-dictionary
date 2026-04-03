import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getAuthUser } from "@/lib/get-auth-user";
import { getR2Client } from "@/lib/r2-client";
import { R2_BUCKET, R2_MOVIES_PREFIX, R2_SUBTITLES_PREFIX } from "@/lib/r2-url";

export const runtime = "nodejs";
export const maxDuration = 60;

function isOwnedR2ObjectKey(key: string, userId: string): boolean {
    const movie = `${R2_MOVIES_PREFIX}${userId}/`;
    const sub = `${R2_SUBTITLES_PREFIX}${userId}/`;
    return key.startsWith(movie) || key.startsWith(sub);
}

export async function DELETE(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!key || !isOwnedR2ObjectKey(key, user.id)) {
        return NextResponse.json({ error: "invalid key" }, { status: 400 });
    }
    try {
        const client = getR2Client();
        await client.send(
            new DeleteObjectCommand({
                Bucket: R2_BUCKET,
                Key: key,
            }),
        );
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("r2 delete", e);
        return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
}

