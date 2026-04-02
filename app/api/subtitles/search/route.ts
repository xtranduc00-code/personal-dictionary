import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";

export const runtime = "nodejs";
export const maxDuration = 30;

const OPENSUBTITLES_BASE = "https://api.opensubtitles.com/api/v1";

function getApiKey(): string {
    return process.env.OPENSUBTITLES_API_KEY?.trim() || "";
}

export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const apiKey = getApiKey();
    if (!apiKey) {
        return NextResponse.json({ error: "OpenSubtitles not configured" }, { status: 500 });
    }
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("query") || "").trim();
    const languages = (searchParams.get("languages") || "en").trim();
    if (!query) {
        return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    const url = new URL(`${OPENSUBTITLES_BASE}/subtitles`);
    url.searchParams.set("query", query);
    url.searchParams.set("languages", languages);
    url.searchParams.set("order_by", "download_count");
    url.searchParams.set("order_direction", "desc");

    try {
        const res = await fetch(url.toString(), {
            headers: {
                "Api-Key": apiKey,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "KenWorkspace/1.0",
            },
            signal: AbortSignal.timeout(15_000),
        });
        const text = await res.text();
        if (!res.ok) {
            return NextResponse.json(
                { error: "OpenSubtitles error", status: res.status, body: text.slice(0, 2000) },
                { status: 502 },
            );
        }
        const raw = JSON.parse(text) as unknown;
        type OsFile = { file_id?: number };
        type OsItem = {
            attributes?: {
                files?: OsFile[];
                language?: string;
                download_count?: number;
                release?: string;
                movie_name?: string;
                feature_details?: { title?: string; movie_name?: string; year?: number };
            };
        };
        const items =
            typeof raw === "object"
            && raw
            && "data" in raw
            && Array.isArray((raw as { data?: unknown }).data)
                ? ((raw as { data: unknown[] }).data as OsItem[])
                : [];
        const results = items
            .map((it) => {
                const attrs = it.attributes ?? {};
                const files = Array.isArray(attrs.files) ? attrs.files : [];
                const fileId = Number(files[0]?.file_id);
                if (!Number.isFinite(fileId) || fileId <= 0) {
                    return null;
                }
                const fd = attrs.feature_details ?? {};
                const title = String(fd.title || attrs.release || attrs.movie_name || fd.movie_name || "Subtitle");
                const year = Number(fd.year || 0) || 0;
                const lang = typeof attrs.language === "string" ? attrs.language : "";
                const downloads = Number(attrs.download_count || 0);
                return { fileId, title, year, lang, downloads };
            })
            .filter(Boolean)
            .slice(0, 50);
        return NextResponse.json({ results });
    }
    catch (e) {
        console.error("opensubtitles search", e);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}

