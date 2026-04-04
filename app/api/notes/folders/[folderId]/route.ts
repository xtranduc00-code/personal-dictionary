import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { isDescendantOf, type NoteFolderRow } from "@/lib/note-folder-tree";
import { supabaseForUserData } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ folderId: string }> };

function mapFolderRow(r: {
  id: unknown;
  name: unknown;
  sort_order?: unknown;
  created_at?: unknown;
  parent_id?: unknown;
}) {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at ?? ""),
    parentId:
      r.parent_id != null && r.parent_id !== ""
        ? String(r.parent_id)
        : null,
  };
}

async function loadUserFolders(
  db: ReturnType<typeof supabaseForUserData>,
  userId: string,
): Promise<NoteFolderRow[]> {
  const { data, error } = await db
    .from("note_folders")
    .select("id,name,sort_order,parent_id")
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    parentId:
      r.parent_id != null && r.parent_id !== ""
        ? String(r.parent_id)
        : null,
  }));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { folderId } = await ctx.params;
  const db = supabaseForUserData();
  try {
    const body = await req.json().catch(() => ({}));
    const nameRaw = body?.name;
    const name =
      typeof nameRaw === "string" ? nameRaw.trim() : undefined;
    const hasParent = Object.prototype.hasOwnProperty.call(body, "parentId");
    const parentRaw = body?.parentId;
    const parentId =
      hasParent &&
        (parentRaw === null || parentRaw === "")
        ? null
        : typeof parentRaw === "string" && parentRaw.trim()
        ? parentRaw.trim()
        : hasParent
        ? null
        : undefined;

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (name === undefined && !hasParent) {
      return NextResponse.json(
        { error: "Provide name and/or parentId" },
        { status: 400 },
      );
    }

    if (parentId !== undefined && parentId !== null) {
      if (parentId === folderId) {
        return NextResponse.json(
          { error: "Folder cannot be its own parent" },
          { status: 400 },
        );
      }
      const allFolders = await loadUserFolders(db, user.id);
      if (isDescendantOf(allFolders, parentId, folderId)) {
        return NextResponse.json(
          { error: "Cannot move folder into its descendant" },
          { status: 400 },
        );
      }
      const { data: parentRow, error: pErr } = await db
        .from("note_folders")
        .select("id")
        .eq("id", parentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (pErr) {
        throw pErr;
      }
      if (!parentRow) {
        return NextResponse.json({ error: "Parent folder not found" }, {
          status: 400,
        });
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      updates.name = name;
    }
    if (hasParent) {
      updates.parent_id = parentId;
      let sortOrder = 0;
      const { data: siblings, error: sErr } = parentId
        ? await db
          .from("note_folders")
          .select("sort_order")
          .eq("user_id", user.id)
          .neq("id", folderId)
          .eq("parent_id", parentId)
        : await db
          .from("note_folders")
          .select("sort_order")
          .eq("user_id", user.id)
          .neq("id", folderId)
          .is("parent_id", null);
      if (sErr) {
        throw sErr;
      }
      const orders = (siblings ?? []).map((s) => Number(s.sort_order ?? 0));
      if (orders.length > 0) {
        sortOrder = Math.max(...orders) + 1;
      }
      updates.sort_order = sortOrder;
    }

    const { data, error } = await db
      .from("note_folders")
      .update(updates)
      .eq("id", folderId)
      .eq("user_id", user.id)
      .select("id,name,sort_order,created_at,parent_id")
      .single();
    if (error) {
      throw error;
    }
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ folder: mapFolderRow(data) });
  } catch (e) {
    console.error("note_folders PATCH", e);
    return NextResponse.json({ error: "Failed to update folder" }, {
      status: 500,
    });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { folderId } = await ctx.params;
  const db = supabaseForUserData();
  try {
    const { error } = await db
      .from("note_folders")
      .delete()
      .eq("id", folderId)
      .eq("user_id", user.id);
    if (error) {
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("note_folders DELETE", e);
    return NextResponse.json({ error: "Failed to delete folder" }, {
      status: 500,
    });
  }
}
