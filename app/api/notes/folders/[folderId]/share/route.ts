import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ folderId: string }> };

function normUsername(raw: string): string {
  const u = raw.trim().toLowerCase();
  return u.replace(/^@+/, "");
}

/** List people this folder is shared with (owner only). */
export async function GET(req: Request, ctx: Ctx) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { folderId } = await ctx.params;
  const db = supabaseForUserData();
  try {
    const { data: folder, error: fErr } = await db
      .from("note_folders")
      .select("id,user_id")
      .eq("id", folderId)
      .maybeSingle();
    if (fErr || !folder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (String(folder.user_id) !== String(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: rows, error } = await db
      .from("note_folder_shares")
      .select("id, role, shared_with_user_id, created_at")
      .eq("folder_id", folderId)
      .order("created_at", { ascending: true });
    if (error) {
      throw error;
    }

    const ids = [...new Set((rows ?? []).map((r) => String(r.shared_with_user_id)))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: users, error: uErr } = await db
        .from("auth_users")
        .select("id, username")
        .in("id", ids);
      if (!uErr && users) {
        for (const u of users) {
          names.set(String(u.id), String(u.username ?? ""));
        }
      }
    }

    const list = (rows ?? []).map((r) => ({
      id: String(r.id),
      role: String(r.role ?? "editor"),
      username: names.get(String(r.shared_with_user_id)) ?? "",
      sharedWithUserId: String(r.shared_with_user_id),
      createdAt: String(r.created_at ?? ""),
    }));
    return NextResponse.json({ shares: list });
  } catch (e) {
    console.error("note_folder_shares GET", e);
    return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
  }
}

/** Share this folder subtree with a user by username (owner only). */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { folderId } = await ctx.params;
  const db = supabaseForUserData();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const username = normUsername(
    typeof (body as { username?: unknown }).username === "string"
      ? (body as { username: string }).username
      : "",
  );
  const roleRaw = (body as { role?: unknown }).role;
  const role = roleRaw === "viewer" ? "viewer" : "editor";

  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  try {
    const { data: folder, error: fErr } = await db
      .from("note_folders")
      .select("id,user_id")
      .eq("id", folderId)
      .maybeSingle();
    if (fErr || !folder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (String(folder.user_id) !== String(user.id)) {
      return NextResponse.json({ error: "Only the owner can share this folder" }, { status: 403 });
    }

    const { data: target, error: findErr } = await db
      .from("auth_users")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();
    if (findErr || !target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (String(target.id) === String(user.id)) {
      return NextResponse.json({ error: "Cannot share with yourself" }, { status: 400 });
    }

    const { data: inserted, error: insErr } = await db
      .from("note_folder_shares")
      .insert({
        owner_user_id: user.id,
        folder_id: folderId,
        shared_by_user_id: user.id,
        shared_with_user_id: target.id,
        role,
      })
      .select("id, role, created_at")
      .single();

    if (insErr) {
      if (insErr.code === "23505") {
        return NextResponse.json({ error: "Already shared with this user" }, { status: 409 });
      }
      console.error("note_folder_shares insert", insErr);
      return NextResponse.json({ error: "Failed to share" }, { status: 500 });
    }

    return NextResponse.json({
      id: String(inserted.id),
      role: String(inserted.role ?? role),
      username: String(target.username ?? ""),
      sharedWithUserId: String(target.id),
      createdAt: String(inserted.created_at ?? ""),
    });
  } catch (e) {
    console.error("note_folder_shares POST", e);
    return NextResponse.json({ error: "Failed to share" }, { status: 500 });
  }
}

/** Revoke folder share by username (owner only). */
export async function DELETE(req: Request, ctx: Ctx) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { folderId } = await ctx.params;
  const db = supabaseForUserData();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const username = normUsername(
    typeof (body as { username?: unknown }).username === "string"
      ? (body as { username: string }).username
      : "",
  );
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  try {
    const { data: folder, error: fErr } = await db
      .from("note_folders")
      .select("id,user_id")
      .eq("id", folderId)
      .maybeSingle();
    if (fErr || !folder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (String(folder.user_id) !== String(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: target, error: findErr } = await db
      .from("auth_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (findErr || !target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { error: delErr } = await db
      .from("note_folder_shares")
      .delete()
      .eq("folder_id", folderId)
      .eq("shared_with_user_id", target.id);
    if (delErr) {
      console.error("note_folder_shares delete", delErr);
      return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("note_folder_shares DELETE", e);
    return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
  }
}

