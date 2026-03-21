import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import {
    isNavLabelKey,
    NAV_LABEL_MAX_LEN,
    type NavLabelKey,
} from "@/lib/nav-label-keys";
import { supabaseForUserData } from "@/lib/supabase-server";

type OverridesRow = {
    overrides: Record<string, unknown> | null;
};

function sanitizeOverrides(raw: unknown): Partial<Record<NavLabelKey, string>> {
    if (!raw || typeof raw !== "object")
        return {};
    const out: Partial<Record<NavLabelKey, string>> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!isNavLabelKey(k))
            continue;
        if (typeof v !== "string")
            continue;
        const t = v.trim().replace(/\s+/g, " ").slice(0, NAV_LABEL_MAX_LEN);
        if (t.length > 0)
            out[k] = t;
    }
    return out;
}

export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const db = supabaseForUserData();
        const { data, error } = await db
            .from("user_nav_label_overrides")
            .select("overrides")
            .eq("user_id", user.id)
            .maybeSingle();
        if (error)
            throw error;
        const row = data as OverridesRow | null;
        const overrides = sanitizeOverrides(row?.overrides ?? {});
        return NextResponse.json({ overrides });
    }
    catch (e) {
        console.error("nav-labels GET", e);
        return NextResponse.json({ error: "Failed to load" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        const patch = (body as { patch?: unknown }).patch;
        if (!patch || typeof patch !== "object")
            return NextResponse.json({ error: "patch object required" }, { status: 400 });

        const db = supabaseForUserData();
        const { data: existing } = await db
            .from("user_nav_label_overrides")
            .select("overrides")
            .eq("user_id", user.id)
            .maybeSingle();
        const prev = sanitizeOverrides(
            (existing as OverridesRow | null)?.overrides ?? {},
        );
        const next: Partial<Record<NavLabelKey, string>> = { ...prev };

        for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
            if (!isNavLabelKey(k))
                continue;
            if (v === null || v === "") {
                delete next[k];
                continue;
            }
            if (typeof v !== "string")
                continue;
            const t = v.trim().replace(/\s+/g, " ").slice(0, NAV_LABEL_MAX_LEN);
            if (t.length === 0)
                delete next[k];
            else
                next[k] = t;
        }

        const now = new Date().toISOString();
        const { error: upErr } = await db.from("user_nav_label_overrides").upsert({
            user_id: user.id,
            overrides: next,
            updated_at: now,
        }, { onConflict: "user_id" });
        if (upErr)
            throw upErr;
        return NextResponse.json({ overrides: next });
    }
    catch (e) {
        console.error("nav-labels PATCH", e);
        return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
}
