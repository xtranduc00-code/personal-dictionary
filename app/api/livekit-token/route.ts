import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getAuthUser } from "@/lib/get-auth-user";
import { MEETS_ROOM_NAME_RE } from "@/lib/meets-recent-rooms";

/**
 * Mint a LiveKit JWT.
 * - Authenticated users: identity from session, name from username.
 * - Guests: identity & displayName from query params (no auth required).
 *
 * Query: ?room=my-room-name[&identity=guest_abc123&displayName=Guest+·+abc123]
 */
export async function GET(req: Request) {
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

    // Try authenticated user first
    const user = await getAuthUser(req);

    let identity: string;
    let displayName: string;

    if (user) {
        identity = `u_${user.id.replace(/-/g, "")}`;
        displayName = user.username.slice(0, 128);
    } else {
        // Guest flow — identity from query param
        const guestId = searchParams.get("identity")?.trim();
        if (!guestId || !/^guest_[a-z0-9-]{1,36}$/.test(guestId)) {
            return NextResponse.json({ error: "Invalid guest identity" }, { status: 400 });
        }
        identity = guestId;
        displayName = searchParams.get("displayName")?.trim() || `Guest · ${guestId.slice(-6)}`;
    }

    const at = new AccessToken(apiKey, apiSecret, {
        identity,
        name: displayName,
        ttl: "4h",
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
