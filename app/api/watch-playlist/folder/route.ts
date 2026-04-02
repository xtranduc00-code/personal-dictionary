import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const MAX_FOLDER = 120;

/** Rename all clips in a folder (same user). */
export async function PATCH(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const body = await req.json().catch(() => ({}));
        const oldName =
            typeof body?.oldFolderName === "string"
                ? body.oldFolderName.trim().slice(0, MAX_FOLDER)
                : "";
        const newNameRaw =
            typeof body?.newFolderName === "string" ? body.newFolderName.trim() : "";
        const newName = newNameRaw.slice(0, MAX_FOLDER) || "General";
        if (!oldName) {
            return NextResponse.json({ error: "oldFolderName required" }, { status: 400 });
        }
        if (oldName === newName) {
            return NextResponse.json({ ok: true, updated: 0 });
        }
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("watch_playlist")
            .update({ folder_name: newName })
            .eq("user_id", user.id)
            .eq("folder_name", oldName)
            .select("id");
        if (error) {
            throw error;
        }
        return NextResponse.json({ ok: true, updated: (data ?? []).length });
    }
    catch (e) {
        console.error("watch-playlist folder PATCH", e);
        return NextResponse.json({ error: "Failed to rename folder" }, { status: 500 });
    }
}

/** Delete all clips in a folder. */
export async function DELETE(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    const folderName = (url.searchParams.get("folderName") ?? "").trim().slice(0, MAX_FOLDER);
    if (!folderName) {
        return NextResponse.json({ error: "folderName query required" }, { status: 400 });
    }
    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("watch_playlist")
            .delete()
            .eq("user_id", user.id)
            .eq("folder_name", folderName)
            .select("id");
        if (error) {
            throw error;
        }
        return NextResponse.json({ ok: true, deleted: (data ?? []).length });
    }
    catch (e) {
        console.error("watch-playlist folder DELETE", e);
        return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }
}
