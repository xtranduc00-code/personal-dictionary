import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import { parseYouTubeVideoId } from "@/lib/youtube-watch";
import { isR2PublicMoviesUrl, isR2PublicSubtitlesUrl } from "@/lib/r2-url";

const MAX_TITLE = 200;
const MAX_URL = 500;
const MAX_FOLDER = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await ctx.params;
    if (!id || typeof id !== "string") {
        return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    try {
        const body = await req.json().catch(() => ({}));
        const updates: Record<string, string | number | null> = {};
        if (typeof body?.folderName === "string") {
            const f = body.folderName.trim().slice(0, MAX_FOLDER) || "General";
            updates.folder_name = f;
        }
        if (typeof body?.title === "string") {
            const t = body.title.trim().slice(0, MAX_TITLE);
            if (!t) {
                return NextResponse.json({ error: "title empty" }, { status: 400 });
            }
            updates.title = t;
        }
        if (typeof body?.youtubeUrl === "string") {
            const u = body.youtubeUrl.trim().slice(0, MAX_URL);
            if (!u) {
                return NextResponse.json({ error: "youtubeUrl empty" }, { status: 400 });
            }
            const isYoutube = Boolean(parseYouTubeVideoId(u));
            const isR2 = isR2PublicMoviesUrl(u);
            if (!isYoutube && !isR2) {
                return NextResponse.json({ error: "invalid url" }, { status: 400 });
            }
            updates.youtube_url = u;
        }
        if (typeof body?.subtitleUrl === "string") {
            const s = body.subtitleUrl.trim().slice(0, MAX_URL);
            if (s && !isR2PublicSubtitlesUrl(s)) {
                return NextResponse.json({ error: "invalid subtitle url" }, { status: 400 });
            }
            updates.subtitle_url = s || null;
        }
        if (typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
            updates.sort_order = Math.floor(body.sortOrder);
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "no fields to update" }, { status: 400 });
        }

        const db = supabaseForUserData();
        const { data, error } = await db
            .from("watch_playlist")
            .update(updates)
            .eq("id", id)
            .eq("user_id", user.id)
            .select("id,folder_name,title,youtube_url,subtitle_url,sort_order,created_at")
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({
            clip: {
                id: String(data.id),
                folderName: String(data.folder_name ?? ""),
                title: String(data.title ?? ""),
                youtubeUrl: String(data.youtube_url ?? ""),
                subtitleUrl: data.subtitle_url ? String(data.subtitle_url) : "",
                sortOrder: Number(data.sort_order ?? 0),
                createdAt: String(data.created_at ?? ""),
            },
        });
    }
    catch (e) {
        console.error("watch-playlist PATCH", e);
        return NextResponse.json({ error: "Failed to update clip" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, ctx: Ctx) {
    const user = await getAuthUser(_req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await ctx.params;
    if (!id || typeof id !== "string") {
        return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("watch_playlist")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id)
            .select("id");
        if (error) {
            throw error;
        }
        if (!data?.length) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("watch-playlist DELETE", e);
        return NextResponse.json({ error: "Failed to delete clip" }, { status: 500 });
    }
}
