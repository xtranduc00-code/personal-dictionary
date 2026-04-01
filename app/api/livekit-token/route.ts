import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getAuthUser } from "@/lib/get-auth-user";
import { MEETS_ROOM_NAME_RE } from "@/lib/meets-recent-rooms";

/**
 * Mint a LiveKit JWT. Identity comes from the logged-in user (never from the client).
 * Query: ?room=my-room-name
 */
export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const room = searchParams.get("room")?.trim() ?? "";
    if (!room || !MEETS_ROOM_NAME_RE.test(room)) {
        return NextResponse.json({ error: "Invalid room name" }, { status: 400 });
    }
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
        return NextResponse.json({ error: "LiveKit not configured" }, { status: 503 });
    }
    const identity = `u_${user.id.replace(/-/g, "")}`;
    const at = new AccessToken(apiKey, apiSecret, {
        identity,
        name: user.username.slice(0, 128),
        ttl: "1h",
    });
    at.addGrant({
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });
    const token = await at.toJwt();
    return NextResponse.json({ token });
}
