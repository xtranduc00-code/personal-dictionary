import { NextResponse, type NextRequest } from "next/server";
import {
  DOLPHIN_API_BASE,
  DOLPHIN_API_TOKEN_ENV,
} from "@/lib/dolphin/constants";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);
const ALLOWED_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;
const MAX_BODY_BYTES = 1_000_000;

type RouteContext = { params: Promise<{ path: string[] }> };

function readToken(): string | null {
  const raw = process.env[DOLPHIN_API_TOKEN_ENV]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

async function handle(
  req: NextRequest,
  ctx: RouteContext,
): Promise<Response> {
  if (!ALLOWED_METHODS.has(req.method)) {
    return NextResponse.json(
      { error: "method_not_allowed" },
      { status: 405 },
    );
  }

  const token = readToken();
  if (!token) {
    return NextResponse.json(
      {
        error: "missing_token",
        message: `${DOLPHIN_API_TOKEN_ENV} env var is not set. Add it to .env.local (Dolphin Anty → API → Generate API key) and restart the dev server.`,
      },
      { status: 500 },
    );
  }

  const { path } = await ctx.params;
  if (!Array.isArray(path) || path.length === 0) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 });
  }
  for (const seg of path) {
    if (typeof seg !== "string" || !ALLOWED_PATH_SEGMENT.test(seg)) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
  }
  const subPath = path.join("/");

  const incoming = new URL(req.url);
  if (incoming.search.length > 2048) {
    return NextResponse.json(
      { error: "query_too_long", message: "Query string exceeds 2048 chars." },
      { status: 414 },
    );
  }

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "DELETE") {
    const contentLength = req.headers.get("content-length");
    if (contentLength !== null) {
      const declared = Number(contentLength);
      if (!Number.isFinite(declared) || declared < 0) {
        return NextResponse.json(
          { error: "invalid_content_length" },
          { status: 400 },
        );
      }
      if (declared > MAX_BODY_BYTES) {
        return NextResponse.json(
          {
            error: "payload_too_large",
            message: `Declared body size ${declared} exceeds ${MAX_BODY_BYTES} bytes.`,
          },
          { status: 413 },
        );
      }
    }
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        {
          error: "payload_too_large",
          message: `Body exceeds ${MAX_BODY_BYTES} bytes.`,
        },
        { status: 413 },
      );
    }
  }

  const target = `${DOLPHIN_API_BASE}/${subPath}${incoming.search}`;

  const fwdHeaders = new Headers();
  fwdHeaders.set("Authorization", `Bearer ${token}`);
  fwdHeaders.set("Accept", "application/json");
  const ct = req.headers.get("content-type");
  if (ct) fwdHeaders.set("Content-Type", ct);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: fwdHeaders,
      body,
      signal: req.signal,
      redirect: "manual",
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "upstream_fetch_failed",
        message: err instanceof Error ? err.message : "Upstream fetch failed.",
      },
      { status: 502 },
    );
  }

  const respHeaders = new Headers();
  const upstreamCt = upstream.headers.get("content-type");
  if (upstreamCt) respHeaders.set("Content-Type", upstreamCt);
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) respHeaders.set("Retry-After", retryAfter);

  if (process.env.NODE_ENV !== "production") {
    const cloned = upstream.clone();
    cloned
      .text()
      .then((text) => {
        const preview = text.length > 2000 ? text.slice(0, 2000) + "…[truncated]" : text;
        console.log(
          `[dolphin proxy] ${req.method} ${subPath} → ${upstream.status}`,
          preview,
        );
      })
      .catch(() => {});
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
