import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import { parseYouTubeVideoId } from "@/lib/youtube-watch";
import { isR2PublicMoviesUrl, isR2PublicSubtitlesUrl } from "@/lib/r2-url";

const MAX_TITLE = 200;
const MAX_URL = 500;
const MAX_FOLDER = 120;

type Row = {
    id: string;
    folder_name: string;
    title: string;
    youtube_url: string;
    subtitle_url: string | null;
    sort_order: number;
    created_at: string;
};

export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("watch_playlist")
            .select("id,folder_name,title,youtube_url,subtitle_url,sort_order,created_at")
            .eq("user_id", user.id)
            .order("folder_name", { ascending: true })
            .order("sort_order", { ascending: true })
            .order("title", { ascending: true });
        if (error) {
            throw error;
        }
        const clips = (data ?? []).map((r) => ({
            id: String(r.id),
            folderName: String(r.folder_name ?? "General"),
            title: String(r.title ?? ""),
            youtubeUrl: String(r.youtube_url ?? ""),
            subtitleUrl: r.subtitle_url ? String(r.subtitle_url) : "",
            sortOrder: Number(r.sort_order ?? 0),
            createdAt: String(r.created_at ?? ""),
        }));
        return NextResponse.json({ clips });
    }
    catch (e) {
        console.error("watch-playlist GET", e);
        return NextResponse.json({ error: "Failed to load playlist" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const body = await req.json().catch(() => ({}));
        const folderRaw = typeof body?.folderName === "string" ? body.folderName.trim() : "";
        const folderName = folderRaw.slice(0, MAX_FOLDER) || "General";
        const title =
            typeof body?.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";
        const youtubeUrl =
            typeof body?.youtubeUrl === "string" ? body.youtubeUrl.trim().slice(0, MAX_URL) : "";
        const subtitleUrl =
            typeof body?.subtitleUrl === "string" ? body.subtitleUrl.trim().slice(0, MAX_URL) : "";
        if (!title) {
            return NextResponse.json({ error: "title required" }, { status: 400 });
        }
        if (!youtubeUrl) {
            return NextResponse.json({ error: "youtubeUrl required" }, { status: 400 });
        }
        const isYoutube = Boolean(parseYouTubeVideoId(youtubeUrl));
        const isR2 = isR2PublicMoviesUrl(youtubeUrl);
        if (!isYoutube && !isR2) {
            return NextResponse.json({ error: "invalid url" }, { status: 400 });
        }
        if (subtitleUrl && !isR2PublicSubtitlesUrl(subtitleUrl)) {
            return NextResponse.json({ error: "invalid subtitle url" }, { status: 400 });
        }
        const sortOrder =
            typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)
                ? Math.floor(body.sortOrder)
                : 0;

        const db = supabaseForUserData();
        const { data, error } = await db
            .from("watch_playlist")
            .insert({
                user_id: user.id,
                folder_name: folderName,
                title,
                youtube_url: youtubeUrl,
                subtitle_url: subtitleUrl || null,
                sort_order: sortOrder,
            })
            .select("id,folder_name,title,youtube_url,subtitle_url,sort_order,created_at")
            .single();
        if (error) {
            throw error;
        }
        const r = data as Row;
        return NextResponse.json({
            clip: {
                id: String(r.id),
                folderName: String(r.folder_name ?? ""),
                title: String(r.title ?? ""),
                youtubeUrl: String(r.youtube_url ?? ""),
                subtitleUrl: r.subtitle_url ? String(r.subtitle_url) : "",
                sortOrder: Number(r.sort_order ?? 0),
                createdAt: String(r.created_at ?? ""),
            },
        });
    }
    catch (e) {
        console.error("watch-playlist POST", e);
        return NextResponse.json({ error: "Failed to save clip" }, { status: 500 });
    }
}
