"use client";

export type TreeNode = { text: string; children: TreeNode[] };

/** Parse indented `- item` lines (2 spaces per level). */
export function parseMindmapTreeSource(source: string): TreeNode[] {
    const lines = source.split("\n").map((l) => l.replace(/\r$/, ""));
    const root: TreeNode = { text: "", children: [] };
    const stack: TreeNode[] = [root];

    for (const line of lines) {
        const m = line.match(/^(\s*)-\s+(.*)$/);
        if (!m)
            continue;
        const indent = m[1]!.replace(/\t/g, "  ").length;
        const depth = Math.floor(indent / 2);
        const text = m[2]!.trim();
        if (!text)
            continue;
        const node: TreeNode = { text, children: [] };
        while (stack.length > depth + 1)
            stack.pop();
        const parent = stack[stack.length - 1]!;
        parent.children.push(node);
        stack.push(node);
    }
    return root.children;
}

function Branch({ nodes }: { nodes: TreeNode[] }) {
    if (nodes.length === 0)
        return null;
    return (
        <ul className="my-0 list-none space-y-1.5 border-l border-zinc-200 py-1 pl-3 dark:border-zinc-600">
            {nodes.map((n, i) => (
                <li key={`${i}-${n.text.slice(0, 24)}`} className="text-sm leading-snug text-zinc-800 dark:text-zinc-200">
                    <span className="font-medium">{n.text}</span>
                    {n.children.length > 0 ? <Branch nodes={n.children}/> : null}
                </li>
            ))}
        </ul>
    );
}

export function StudyKitMindmapTree({ source }: { source: string }) {
    const roots = parseMindmapTreeSource(source);
    if (roots.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                (No tree lines — expected lines like <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">- Topic</code> with 2 spaces per sub-level.)
            </p>
        );
    }
    return (
        <div className="my-3 rounded-2xl border border-violet-200/80 bg-violet-50/40 px-4 py-3 dark:border-violet-500/25 dark:bg-violet-950/25">
            <Branch nodes={roots}/>
        </div>
    );
}
