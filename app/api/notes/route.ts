import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

function mapNoteRow(
    r: {
        id: string;
        title: string | null;
        body: string | null;
        pinned: boolean | null;
        created_at: string;
        updated_at: string;
    },
    extra: {
        access: "owner" | "shared";
        role?: "viewer" | "editor";
        ownerUsername?: string;
    },
) {
    return {
        id: r.id,
        title: r.title ?? "",
        body: r.body ?? "",
        pinned: Boolean(r.pinned),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        access: extra.access,
        ...(extra.role ? { role: extra.role } : {}),
        ...(extra.ownerUsername ? { ownerUsername: extra.ownerUsername } : {}),
    };
}

export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const db = supabaseForUserData();
        const userId = String(user.id);
        const { data: owned, error: oErr } = await db
            .from("notes")
            .select("id,title,body,pinned,created_at,updated_at")
            .eq("user_id", userId)
            .order("pinned", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(500);
        if (oErr) {
            throw oErr;
        }

        const { data: shareRows, error: sErr } = await db
            .from("note_shares")
            .select("note_id, role")
            .eq("shared_with_user_id", userId);
        if (sErr) {
            throw sErr;
        }

        const sharedIds = (shareRows ?? []).map((s) => String(s.note_id)).filter(Boolean);
        const roleByNote = new Map<string, "viewer" | "editor">(
            (shareRows ?? []).map((s) => [
                String(s.note_id),
                s.role === "viewer" ? ("viewer" as const) : ("editor" as const),
            ]),
        );

        let sharedNotes: Array<{
            id: string;
            title: string | null;
            body: string | null;
            pinned: boolean | null;
            created_at: string;
            updated_at: string;
            user_id: string;
        }> = [];

        if (sharedIds.length > 0) {
            const { data: sn, error: nErr } = await db
                .from("notes")
                .select("id,title,body,pinned,created_at,updated_at,user_id")
                .in("id", sharedIds);
            if (nErr) {
                throw nErr;
            }
            sharedNotes = sn ?? [];
        }

        const ownerIds = [...new Set(sharedNotes.map((n) => String(n.user_id)))];
        const ownerNameById = new Map<string, string>();
        if (ownerIds.length > 0) {
            const { data: owners, error: uErr } = await db
                .from("auth_users")
                .select("id, username")
                .in("id", ownerIds);
            if (!uErr && owners) {
                for (const o of owners) {
                    ownerNameById.set(o.id, o.username ?? "");
                }
            }
        }

        const ownedList = (owned ?? []).map((r) => mapNoteRow(r, { access: "owner" }));
        const sharedList = sharedNotes.map((r) =>
            mapNoteRow(r, {
                access: "shared",
                role: roleByNote.get(r.id) ?? "editor",
                ownerUsername: ownerNameById.get(r.user_id) ?? "",
            }),
        );

        const merged = [...ownedList, ...sharedList].sort((a, b) => {
            if (a.pinned !== b.pinned) {
                return a.pinned ? -1 : 1;
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        return NextResponse.json(merged);
    }
    catch (e) {
        console.error("notes GET", e);
        return NextResponse.json({ error: "Failed to load notes" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const body = await req.json().catch(() => ({}));
        const title = typeof body?.title === "string" ? body.title : "";
        const bodyText = typeof body?.body === "string" ? body.body : "";
        const { data, error } = await supabaseForUserData()
            .from("notes")
            .insert({ user_id: user.id, title, body: bodyText })
            .select("id,title,body,pinned,created_at,updated_at")
            .single();
        if (error) {
            throw error;
        }
        return NextResponse.json({
            ...mapNoteRow(data, { access: "owner" }),
        });
    }
    catch (e) {
        console.error("notes POST", e);
        return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
    }
}
