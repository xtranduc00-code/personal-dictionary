import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

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

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = supabaseForUserData();
    const { data, error } = await db
      .from("note_folders")
      .select("id,name,sort_order,created_at,parent_id")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      throw error;
    }
    const list = (data ?? []).map((r) => mapFolderRow(r));
    return NextResponse.json({ folders: list });
  } catch (e) {
    console.error("note_folders GET", e);
    return NextResponse.json({ error: "Failed to load folders" }, {
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const parentRaw = body?.parentId;
    const parentId =
      parentRaw != null &&
        parentRaw !== "" &&
        typeof parentRaw === "string"
        ? parentRaw.trim()
        : null;

    const db = supabaseForUserData();

    if (parentId) {
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

    let sortOrder = 0;
    const { data: siblings, error: sErr } = parentId
      ? await db
        .from("note_folders")
        .select("sort_order")
        .eq("user_id", user.id)
        .eq("parent_id", parentId)
      : await db
        .from("note_folders")
        .select("sort_order")
        .eq("user_id", user.id)
        .is("parent_id", null);
    if (sErr) {
      throw sErr;
    }
    const orders = (siblings ?? []).map((s) => Number(s.sort_order ?? 0));
    if (orders.length > 0) {
      sortOrder = Math.max(...orders) + 1;
    }

    const insertRow: Record<string, unknown> = {
      user_id: user.id,
      name,
      sort_order: sortOrder,
    };
    if (parentId) {
      insertRow.parent_id = parentId;
    }

    const { data, error } = await db
      .from("note_folders")
      .insert(insertRow)
      .select("id,name,sort_order,created_at,parent_id")
      .single();
    if (error) {
      throw error;
    }
    return NextResponse.json({ folder: mapFolderRow(data) });
  } catch (e) {
    console.error("note_folders POST", e);
    return NextResponse.json({ error: "Failed to create folder" }, {
      status: 500,
    });
  }
}
