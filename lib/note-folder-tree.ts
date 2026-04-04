export type NoteFolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

export type FolderTreeNode = NoteFolderRow & { children: FolderTreeNode[] };

export function buildFolderTree(folders: NoteFolderRow[]): FolderTreeNode[] {
  const map = new Map<string, FolderTreeNode>();
  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }
  const roots: FolderTreeNode[] = [];
  for (const f of folders) {
    const node = map.get(f.id);
    if (!node) continue;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRecursive = (nodes: FolderTreeNode[]) => {
    nodes.sort(
      (a, b) =>
        (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, "en"),
    );
    for (const n of nodes) sortRecursive(n.children);
  };
  sortRecursive(roots);
  return roots;
}

/** Ancestors from root → target (includes target). */
export function getFolderPath(
  folders: NoteFolderRow[],
  folderId: string,
): NoteFolderRow[] {
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const chain: NoteFolderRow[] = [];
  let cur: NoteFolderRow | undefined = byId.get(folderId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

export function isDescendantOf(
  folders: NoteFolderRow[],
  folderId: string,
  ancestorId: string,
): boolean {
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  let cur = byId.get(folderId);
  const guard = new Set<string>();
  while (cur?.parentId && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.parentId === ancestorId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

/** Flatten tree for <select> labels with depth prefix. */
export function flattenFolderTreeForSelect(
  nodes: FolderTreeNode[],
  depth = 0,
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const pad = depth === 0 ? "" : `${"· ".repeat(depth)}`;
  for (const n of nodes) {
    out.push({ id: n.id, label: `${pad}${n.name}`.trim() });
    out.push(...flattenFolderTreeForSelect(n.children, depth + 1));
  }
  return out;
}
