import { NextRequest, NextResponse } from "next/server";
import { isAllowedGuardianEpubImageUrl } from "@/lib/guardian-epub-image-url";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (compatible; KenWorkspace/1.0; private EPUB image fetch)";
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_CT_PREFIX = "image/";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  if (!isAllowedGuardianEpubImageUrl(target)) {
    return NextResponse.json({ error: "URL not allowed." }, { status: 403 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);

  try {
    const res = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    try {
      const finalUrl = new URL(res.url);
      if (!isAllowedGuardianEpubImageUrl(finalUrl)) {
        return NextResponse.json({ error: "Redirect not allowed." }, {
          status: 403,
        });
      }
    } catch {
      return NextResponse.json({ error: "Invalid redirect URL." }, {
        status: 422,
      });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream HTTP ${res.status}` },
        { status: 422 },
      );
    }

    const ct = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    if (!ct.toLowerCase().startsWith(ALLOWED_CT_PREFIX)) {
      return NextResponse.json({ error: "Not an image." }, { status: 422 });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large." }, { status: 422 });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch image." }, {
      status: 502,
    });
  } finally {
    clearTimeout(timeout);
  }
}
