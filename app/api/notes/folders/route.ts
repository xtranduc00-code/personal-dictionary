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

    const byId = new Map<string, ReturnType<typeof mapFolderRow>>();
    for (const r of data ?? []) {
      const row = mapFolderRow(r);
      if (row.id) byId.set(row.id, row);
    }

    // Include shared folder subtree structure (folders only; notes are loaded separately).
    // If the table/migration is missing, degrade gracefully.
    try {
      const { data: folderShares, error: fsErr } = await db
        .from("note_folder_shares")
        .select("folder_id, owner_user_id")
        .eq("shared_with_user_id", user.id);
      if (fsErr) {
        throw fsErr;
      }

      const shares = (folderShares ?? [])
        .map((r) => ({
          folderId: String((r as { folder_id?: unknown }).folder_id ?? ""),
          ownerUserId: String((r as { owner_user_id?: unknown }).owner_user_id ?? ""),
        }))
        .filter((s) => s.folderId && s.ownerUserId);

      if (shares.length > 0) {
        const ownerIds = [...new Set(shares.map((s) => s.ownerUserId))];
        const { data: allFolders, error: allErr } = await db
          .from("note_folders")
          .select("id,name,sort_order,created_at,parent_id,user_id")
          .in("user_id", ownerIds);
        if (allErr) {
          throw allErr;
        }

        const foldersByOwner = new Map<
          string,
          Array<{
            id: string;
            parentId: string | null;
            raw: {
              id: unknown;
              name: unknown;
              sort_order?: unknown;
              created_at?: unknown;
              parent_id?: unknown;
            };
          }>
        >();

        for (const r of allFolders ?? []) {
          const ownerId = String((r as { user_id?: unknown }).user_id ?? "");
          const id = String((r as { id?: unknown }).id ?? "");
          if (!ownerId || !id) continue;
          const parentRaw = (r as { parent_id?: unknown }).parent_id;
          const parentId =
            parentRaw != null && parentRaw !== "" ? String(parentRaw) : null;
          const arr = foldersByOwner.get(ownerId) ?? [];
          arr.push({
            id,
            parentId,
            raw: {
              id: (r as { id?: unknown }).id,
              name: (r as { name?: unknown }).name,
              sort_order: (r as { sort_order?: unknown }).sort_order,
              created_at: (r as { created_at?: unknown }).created_at,
              parent_id: (r as { parent_id?: unknown }).parent_id,
            },
          });
          foldersByOwner.set(ownerId, arr);
        }

        for (const { ownerUserId, folderId } of shares) {
          const folders = foldersByOwner.get(ownerUserId) ?? [];
          if (folders.length === 0) continue;

          const parentById = new Map<string, string | null>();
          const childrenByParent = new Map<string | null, string[]>();
          const rawById = new Map<string, (typeof folders)[number]["raw"]>();

          for (const f of folders) {
            parentById.set(f.id, f.parentId);
            rawById.set(f.id, f.raw);
            const kids = childrenByParent.get(f.parentId) ?? [];
            kids.push(f.id);
            childrenByParent.set(f.parentId, kids);
          }

          const include = new Set<string>();

          // Descendants
          const queue: string[] = [folderId];
          for (let i = 0; i < queue.length; i++) {
            const cur = queue[i];
            if (!cur || include.has(cur)) continue;
            include.add(cur);
            const kids = childrenByParent.get(cur);
            if (kids) queue.push(...kids);
          }

          // Ancestors for structure
          let cur: string | null = folderId;
          const seen = new Set<string>();
          while (cur && !seen.has(cur)) {
            seen.add(cur);
            include.add(cur);
            cur = parentById.get(cur) ?? null;
          }

          for (const id of include) {
            const raw = rawById.get(id);
            if (!raw) continue;
            const row = mapFolderRow(raw);
            if (row.id && !byId.has(row.id)) {
              byId.set(row.id, row);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[note_folders GET] skipping shared folders (migration missing or error)", e);
    }

    const list = [...byId.values()];
    // Stable-ish ordering: sortOrder then name (matches old behavior for owned folders)
    list.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

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
