import { NextResponse } from "next/server";
import { spotifyAuthHeader } from "@/lib/spotify/access-token";
import { SPOTIFY_API } from "@/lib/spotify/constants";

function playerQuery(
  deviceId: string | undefined,
  params: Record<string, string>,
) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    sp.set(k, v);
  }
  if (deviceId) sp.set("device_id", deviceId);
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export async function GET() {
  const auth = await spotifyAuthHeader();
  if (!auth) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const res = await fetch(`${SPOTIFY_API}/me/player`, {
    headers: { Authorization: auth },
  });

  if (res.status === 204) {
    return NextResponse.json({ item: null, is_playing: false });
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: await res.text() },
      { status: res.status },
    );
  }
  return NextResponse.json(await res.json());
}

export async function POST(req: Request) {
  const auth = await spotifyAuthHeader();
  if (!auth) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const body = (await req.json()) as {
    action:
      | "play"
      | "pause"
      | "next"
      | "previous"
      | "transfer"
      | "seek"
      | "set_shuffle"
      | "set_repeat";
    device_id?: string;
    uris?: string[];
    context_uri?: string;
    position?: number;
    position_ms?: number;
    shuffle_state?: boolean;
    repeat_state?: "off" | "context" | "track";
  };

  const dq = body.device_id
    ? `?device_id=${encodeURIComponent(body.device_id)}`
    : "";

  switch (body.action) {
    case "play": {
      const url = `${SPOTIFY_API}/me/player/play${dq}`;
      const payload: Record<string, unknown> = {};
      if (body.uris && body.uris.length > 0) {
        payload.uris = body.uris;
      } else if (body.context_uri) {
        payload.context_uri = body.context_uri;
        if (typeof body.position === "number") {
          payload.offset = { position: body.position };
        }
      }
      /* Empty body = resume current playback (Spotify Web API). */
      const r = await fetch(url, {
        method: "PUT",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok && r.status !== 204) {
        const errText = await r.text();
        if (process.env.NODE_ENV === "development") {
          console.warn("[spotify:api] play failed", {
            status: r.status,
            device_id: body.device_id,
            has_uris: Boolean(body.uris?.length),
            has_context: Boolean(body.context_uri),
            body_preview: errText.slice(0, 400),
          });
        }
        return NextResponse.json({ error: errText }, { status: r.status });
      }
      return NextResponse.json({ ok: true });
    }
    case "pause": {
      const r = await fetch(`${SPOTIFY_API}/me/player/pause${dq}`, {
        method: "PUT",
        headers: { Authorization: auth },
      });
      if (!r.ok && r.status !== 204) {
        return NextResponse.json(
          { error: await r.text() },
          { status: r.status },
        );
      }
      return NextResponse.json({ ok: true });
    }
    case "next": {
      const r = await fetch(`${SPOTIFY_API}/me/player/next${dq}`, {
        method: "POST",
        headers: { Authorization: auth },
      });
      if (!r.ok && r.status !== 204) {
        return NextResponse.json(
          { error: await r.text() },
          { status: r.status },
        );
      }
      return NextResponse.json({ ok: true });
    }
    case "previous": {
      const r = await fetch(`${SPOTIFY_API}/me/player/previous${dq}`, {
        method: "POST",
        headers: { Authorization: auth },
      });
      if (!r.ok && r.status !== 204) {
        return NextResponse.json(
          { error: await r.text() },
          { status: r.status },
        );
      }
      return NextResponse.json({ ok: true });
    }
    case "transfer": {
      if (!body.device_id) {
        return NextResponse.json(
          { error: "device_id required" },
          { status: 400 },
        );
      }
      const r = await fetch(`${SPOTIFY_API}/me/player`, {
        method: "PUT",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          device_ids: [body.device_id],
          play: false,
        }),
      });
      if (!r.ok && r.status !== 204) {
        return NextResponse.json(
          { error: await r.text() },
          { status: r.status },
        );
      }
      return NextResponse.json({ ok: true });
    }
    case "seek": {
      if (!body.device_id || typeof body.position_ms !== "number") {
        return NextResponse.json(
          { error: "device_id and position_ms required" },
          { status: 400 },
        );
      }
      const q = playerQuery(body.device_id, {
        position_ms: String(Math.max(0, Math.floor(body.position_ms))),
      });
      const r = await fetch(`${SPOTIFY_API}/me/player/seek${q}`, {
        method: "PUT",
        headers: { Authorization: auth },
      });
      if (!r.ok && r.status !== 204) {
        return NextResponse.json(
          { error: await r.text() },
          { status: r.status },
        );
      }
      return NextResponse.json({ ok: true });
    }
    case "set_shuffle": {
      if (!body.device_id || typeof body.shuffle_state !== "boolean") {
        return NextResponse.json(
          { error: "device_id and shuffle_state required" },
          { status: 400 },
        );
      }
      const q = playerQuery(body.device_id, {
        state: String(body.shuffle_state),
      });
      const r = await fetch(`${SPOTIFY_API}/me/player/shuffle${q}`, {
        method: "PUT",
        headers: { Authorization: auth },
      });
      if (!r.ok && r.status !== 204) {
        return NextResponse.json(
          { error: await r.text() },
          { status: r.status },
        );
      }
      return NextResponse.json({ ok: true });
    }
    case "set_repeat": {
      if (
        !body.device_id ||
        !body.repeat_state ||
        !["off", "context", "track"].includes(body.repeat_state)
      ) {
        return NextResponse.json(
          { error: "device_id and repeat_state (off|context|track) required" },
          { status: 400 },
        );
      }
      const q = playerQuery(body.device_id, { state: body.repeat_state });
      const r = await fetch(`${SPOTIFY_API}/me/player/repeat${q}`, {
        method: "PUT",
        headers: { Authorization: auth },
      });
      if (!r.ok && r.status !== 204) {
        return NextResponse.json(
          { error: await r.text() },
          { status: r.status },
        );
      }
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
