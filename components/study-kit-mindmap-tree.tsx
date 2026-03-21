"use client";

import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export type MindmapConceptKind = "routing" | "dijkstra" | "bellman" | "default";

export type TreeNode = {
    text: string;
    /** From `[rt] ` / `[dj] ` / `[bf] ` prefix in source (stripped from `text`). */
    branchTag?: MindmapConceptKind;
    children: TreeNode[];
};

function parseTaggedLabel(raw: string): { text: string; tag?: MindmapConceptKind } {
    const m = raw.match(/^\[(rt|dj|bf)\]\s+/i);
    if (!m)
        return { text: raw };
    const code = m[1]!.toLowerCase();
    const tag: MindmapConceptKind =
        code === "rt" ? "routing" : code === "dj" ? "dijkstra" : "bellman";
    return { text: raw.slice(m[0]!.length).trim(), tag };
}

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
        const rawLabel = m[2]!.trim();
        if (!rawLabel)
            continue;
        const { text, tag } = parseTaggedLabel(rawLabel);
        if (!text)
            continue;
        const node: TreeNode = { text, children: [] };
        if (tag)
            node.branchTag = tag;
        while (stack.length > depth + 1)
            stack.pop();
        const parent = stack[stack.length - 1]!;
        parent.children.push(node);
        stack.push(node);
    }
    return root.children;
}

function inferConceptFromText(label: string): MindmapConceptKind {
    const t = label.toLowerCase();
    if (/\bbellman|distance[- ]vector|\bdv\b/.test(t))
        return "bellman";
    if (/\bdijkstra|link[- ]state/.test(t))
        return "dijkstra";
    if (/routing table|forwarding (table|info)?|\bfib\b|\bcef\b|routing\s+table/.test(t))
        return "routing";
    return "default";
}

type LaidOut = TreeNode & { _depth: number; _y: number };

function cloneForLayout(n: TreeNode, depth: number): LaidOut {
    return {
        ...n,
        _depth: depth,
        _y: 0,
        children: n.children.map((c) => cloneForLayout(c, depth + 1)),
    };
}

function assignY(nodes: LaidOut[]): number {
    let leafCursor = 0;
    function walk(node: LaidOut): void {
        if (node.children.length === 0) {
            node._y = leafCursor;
            leafCursor++;
            return;
        }
        for (const c of node.children as LaidOut[])
            walk(c);
        const ys = (node.children as LaidOut[]).map((c) => c._y);
        node._y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    for (const r of nodes)
        walk(r);
    return leafCursor;
}

type FlatNode = {
    text: string;
    depth: number;
    y: number;
    concept: MindmapConceptKind;
    parent?: FlatNode;
};

function flatten(nodes: LaidOut[], parent: FlatNode | undefined, inherited: MindmapConceptKind): FlatNode[] {
    const out: FlatNode[] = [];
    for (const n of nodes) {
        const fromTag = n.branchTag;
        const fromKw = inferConceptFromText(n.text);
        const concept: MindmapConceptKind =
            fromTag ?? (fromKw !== "default" ? fromKw : inherited);
        const self: FlatNode = { text: n.text, depth: n._depth, y: n._y, parent, concept };
        out.push(self);
        out.push(...flatten(n.children as LaidOut[], self, concept));
    }
    return out;
}

function collectSubtreeNodes(root: FlatNode, all: FlatNode[]): Set<FlatNode> {
    const set = new Set<FlatNode>([root]);
    let prev = -1;
    while (set.size !== prev) {
        prev = set.size;
        for (const n of all) {
            if (n.parent && set.has(n.parent))
                set.add(n);
        }
    }
    return set;
}

function highlightNodesForFocus(flatList: FlatNode[], focusIdx: number): Set<FlatNode> {
    const center = flatList[focusIdx];
    if (!center)
        return new Set();
    const sub = collectSubtreeNodes(center, flatList);
    const path = new Set<FlatNode>();
    let cur: FlatNode | undefined = center;
    while (cur) {
        path.add(cur);
        cur = cur.parent;
    }
    return new Set([...sub, ...path]);
}

/** Layout tuned for readability on result page (larger type + boxes than first revision). */
const COL = 220;
const ROW = 82;
const BOX_W = 200;
const BOX_H = 74;
const PAD = 36;
const RADIUS = 14;
const LABEL_FONT_PX = 15;
const LABEL_INSET = 10;
const DISPLAY_SCALE = 1.48;

const CONCEPT_PALETTE_LIGHT: Record<MindmapConceptKind, { fill: string; stroke: string; text: string }> = {
    routing: { fill: "#d1fae5", stroke: "#059669", text: "#065f46" },
    dijkstra: { fill: "#dbeafe", stroke: "#2563eb", text: "#1e40af" },
    bellman: { fill: "#ffedd5", stroke: "#ea580c", text: "#9a3412" },
    default: { fill: "#f1f5f9", stroke: "#64748b", text: "#334155" },
};

const CONCEPT_PALETTE_DARK: Record<MindmapConceptKind, { fill: string; stroke: string; text: string }> = {
    routing: { fill: "#14532d", stroke: "#34d399", text: "#d1fae5" },
    dijkstra: { fill: "#1e3a5a", stroke: "#60a5fa", text: "#dbeafe" },
    bellman: { fill: "#7c2d12", stroke: "#fb923c", text: "#ffedd5" },
    default: { fill: "#27272a", stroke: "#a1a1aa", text: "#e4e4e7" },
};

function useHtmlDarkClass(): boolean {
    const [dark, setDark] = useState(false);
    useEffect(() => {
        const el = document.documentElement;
        const sync = () => setDark(el.classList.contains("dark"));
        sync();
        const mo = new MutationObserver(sync);
        mo.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => mo.disconnect();
    }, []);
    return dark;
}

type PixelPos = { x: number; y: number; cx: number; cy: number; rx: number };

type MindmapLayout = {
    width: number;
    height: number;
    flatList: FlatNode[];
    edges: { p: FlatNode; c: FlatNode }[];
    pos: (n: FlatNode) => PixelPos;
};

function useMindmapLayout(roots: TreeNode[]): MindmapLayout {
    return useMemo(() => {
        const laid = roots.map((r) => cloneForLayout(r, 0));
        assignY(laid);
        const flatList = flatten(laid, undefined, "default");
        const maxDepth = flatList.length ? Math.max(...flatList.map((n) => n.depth)) : 0;
        const minY = flatList.length ? Math.min(...flatList.map((n) => n.y)) : 0;
        const maxY = flatList.length ? Math.max(...flatList.map((n) => n.y)) : 0;
        const ySpan = Math.max(1, maxY - minY);
        const height = PAD * 2 + (ySpan + 1) * ROW;
        const width = PAD * 2 + (maxDepth + 1) * COL + BOX_W;

        const pos = (n: FlatNode): PixelPos => {
            const x = PAD + n.depth * COL;
            const yNorm = n.y - minY;
            const y = PAD + yNorm * ROW + (ROW - BOX_H) / 2;
            return {
                x,
                y,
                cx: x + BOX_W / 2,
                cy: y + BOX_H / 2,
                rx: x + BOX_W,
            };
        };

        const edges: { p: FlatNode; c: FlatNode }[] = [];
        for (const n of flatList) {
            for (const child of flatList) {
                if (child.parent === n)
                    edges.push({ p: n, c: child });
            }
        }

        return { width, height, flatList, edges, pos };
    }, [roots]);
}

type SvgDrawingProps = {
    layout: MindmapLayout;
    displayScale: number;
    focusFlatIndex: number | null;
    selectedFlatIndex: number | null;
    onHoverIndex: (i: number | null) => void;
    onSelectIndex: (i: number) => void;
};

const MindmapSvgDrawing = forwardRef<SVGSVGElement, SvgDrawingProps>(function MindmapSvgDrawing(
    { layout, displayScale, focusFlatIndex, selectedFlatIndex, onHoverIndex, onSelectIndex },
    ref,
) {
    const dark = useHtmlDarkClass();
    const paletteMap = dark ? CONCEPT_PALETTE_DARK : CONCEPT_PALETTE_LIGHT;
    const filterId = `sk-mm-${useId().replace(/:/g, "")}`;

    const { width, height, flatList, edges, pos } = layout;
    const sw = width * displayScale;
    const sh = height * displayScale;

    const highlightSet = useMemo(() => {
        if (focusFlatIndex === null)
            return null;
        return highlightNodesForFocus(flatList, focusFlatIndex);
    }, [focusFlatIndex, flatList]);

    const dimGraph = focusFlatIndex !== null;

    return (
        <svg
            ref={ref}
            width={sw}
            height={sh}
            viewBox={`0 0 ${width} ${height}`}
            className="block shrink-0 select-none [&_[data-mm-node-hit]]:cursor-pointer"
            role="img"
            aria-label="Mind map tree diagram"
            preserveAspectRatio="xMidYMid meet"
        >
            <defs>
                <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.14" />
                </filter>
            </defs>

            {edges.map(({ p, c }, i) => {
                const A = pos(p);
                const B = pos(c);
                const midX = (A.rx + B.x) / 2;
                const d = `M ${A.rx} ${A.cy} L ${midX} ${A.cy} L ${midX} ${B.cy} L ${B.x} ${B.cy}`;
                const hl = Boolean(highlightSet?.has(p) && highlightSet.has(c));
                const baseStroke = dark ? "rgba(148,163,184,0.5)" : "rgba(71,85,105,0.38)";
                const hiStroke = dark ? "rgba(96,165,250,0.95)" : "rgba(37,99,235,0.88)";
                return (
                    <path
                        key={`e-${i}`}
                        d={d}
                        fill="none"
                        stroke={hl ? hiStroke : baseStroke}
                        strokeWidth={hl ? 4 : 2.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={dimGraph && !hl ? 0.28 : 1}
                        style={{ transition: "opacity 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease" }}
                    />
                );
            })}

            {flatList.map((n, i) => {
                const { x, y } = pos(n);
                const { fill, stroke, text } = paletteMap[n.concept];
                const foW = BOX_W - LABEL_INSET * 2;
                const foH = BOX_H - LABEL_INSET * 2;
                const hl = Boolean(highlightSet?.has(n));
                const selected = selectedFlatIndex === i;
                const dimNode = dimGraph && !hl;
                return (
                    <g
                        key={`n-${i}-${n.text.slice(0, 12)}`}
                        filter={`url(#${filterId})`}
                        opacity={dimNode ? 0.38 : 1}
                        style={{ transition: "opacity 0.15s ease" }}
                    >
                        <rect
                            x={x}
                            y={y}
                            width={BOX_W}
                            height={BOX_H}
                            rx={RADIUS}
                            ry={RADIUS}
                            fill={fill}
                            stroke={selected ? (dark ? "#93c5fd" : "#1d4ed8") : stroke}
                            strokeWidth={selected ? 3.25 : hl ? 2.75 : 2}
                        />
                        <foreignObject
                            x={x + LABEL_INSET}
                            y={y + LABEL_INSET}
                            width={foW}
                            height={foH}
                            style={{ pointerEvents: "none", overflow: "hidden" }}
                        >
                            <div
                                {...({ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, unknown>)}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxSizing: "border-box",
                                    padding: "1px 2px",
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    style={{
                                        maxWidth: "100%",
                                        maxHeight: "100%",
                                        margin: "0 auto",
                                        overflow: "hidden",
                                        display: "-webkit-box",
                                        WebkitBoxOrient: "vertical",
                                        WebkitLineClamp: 3,
                                        wordBreak: "break-word",
                                        overflowWrap: "anywhere",
                                        hyphens: "auto",
                                        textAlign: "center",
                                        fontFamily:
                                            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                                        fontSize: `${LABEL_FONT_PX}px`,
                                        fontWeight: 700,
                                        lineHeight: 1.18,
                                        color: text,
                                    }}
                                >
                                    {n.text}
                                </div>
                            </div>
                        </foreignObject>
                        <rect
                            data-mm-node-hit=""
                            x={x}
                            y={y}
                            width={BOX_W}
                            height={BOX_H}
                            rx={RADIUS}
                            ry={RADIUS}
                            fill="transparent"
                            stroke="none"
                            pointerEvents="all"
                            onPointerEnter={() => onHoverIndex(i)}
                            onPointerLeave={() => onHoverIndex(null)}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectIndex(i);
                            }}
                        />
                    </g>
                );
            })}
        </svg>
    );
});
MindmapSvgDrawing.displayName = "MindmapSvgDrawing";

type DragState = { x: number; y: number; sl: number; st: number };

const DEFAULT_ZOOM_MUL = 0.55;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.35;
const ZOOM_STEP = 0.14;

function escapeHtmlTitle(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function mindmapDownloadBasename(roots: TreeNode[]): string {
    const raw = roots[0]?.text?.trim() || "mind-map";
    const slug = raw
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]+/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 48);
    return slug || "mind-map";
}

function buildAskPrompt(nodeLabel: string): string {
    return `Explain this mind map node in the context of my study sheet: "${nodeLabel}"`;
}

function MindmapScrollCanvas({
    roots,
    panHint,
    interactiveHint,
    zoomInLabel,
    zoomOutLabel,
    zoomResetLabel,
    zoomDefaultShort,
    downloadHtmlLabel,
    nodeDetailTitle,
    copyAskLabel,
    askCopiedLabel,
    dismissLabel,
}: {
    roots: TreeNode[];
    panHint: string;
    interactiveHint: string;
    zoomInLabel: string;
    zoomOutLabel: string;
    zoomResetLabel: string;
    zoomDefaultShort: string;
    downloadHtmlLabel: string;
    nodeDetailTitle: string;
    copyAskLabel: string;
    askCopiedLabel: string;
    dismissLabel: string;
}) {
    const layout = useMindmapLayout(roots);
    const scrollRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const [zoomMul, setZoomMul] = useState(DEFAULT_ZOOM_MUL);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    const focusIdx = hoveredIdx !== null ? hoveredIdx : selectedIdx;

    const onSelectIndex = useCallback((i: number) => {
        setSelectedIdx((prev) => (prev === i ? null : i));
    }, []);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        const t = e.target as Element | null;
        if (t?.closest?.("[data-mm-node-hit]"))
            return;
        if (e.button !== 0)
            return;
        const el = scrollRef.current;
        if (!el)
            return;
        dragRef.current = {
            x: e.clientX,
            y: e.clientY,
            sl: el.scrollLeft,
            st: el.scrollTop,
        };
    }, []);

    useEffect(() => {
        const move = (e: MouseEvent) => {
            const d = dragRef.current;
            const el = scrollRef.current;
            if (!d || !el)
                return;
            el.scrollLeft = d.sl - (e.clientX - d.x);
            el.scrollTop = d.st - (e.clientY - d.y);
        };
        const up = () => {
            dragRef.current = null;
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        return () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };
    }, []);

    const displayScale = DISPLAY_SCALE * zoomMul;
    const zoomPct = Math.round(zoomMul * 100);

    const onDownloadHtml = useCallback(() => {
        const svg = svgRef.current;
        if (!svg)
            return;
        const markup = svg.outerHTML;
        const base = mindmapDownloadBasename(roots);
        const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtmlTitle(base)}</title>
<style>
html,body{margin:0;background:#f8fafc;}
body{display:flex;justify-content:center;align-items:flex-start;padding:16px;box-sizing:border-box;min-height:100vh;}
svg{display:block;max-width:100%;height:auto;}
</style>
</head>
<body>
${markup}
</body>
</html>`;
        const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}.html`;
        a.rel = "noopener";
        a.click();
        URL.revokeObjectURL(url);
    }, [roots]);

    const selectedNode = selectedIdx !== null ? layout.flatList[selectedIdx] ?? null : null;

    const copyAsk = useCallback(async () => {
        if (!selectedNode)
            return;
        const text = buildAskPrompt(selectedNode.text);
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
        }
        catch {
            setCopied(false);
        }
    }, [selectedNode]);

    return (
        <div>
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-end gap-2">
                <span className="inline-flex min-h-8 min-w-[2.75rem] max-w-[4rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-violet-200/70 bg-white/90 px-1 text-center text-[11px] font-semibold leading-none tabular-nums text-violet-800 dark:border-violet-500/35 dark:bg-zinc-900/80 dark:text-violet-200">
                    {zoomPct}%
                </span>
                <div className="flex min-h-8 min-w-0 shrink-0 overflow-hidden rounded-lg border border-violet-200/80 bg-white/90 shadow-sm dark:border-violet-500/30 dark:bg-zinc-900/80">
                    <button
                        type="button"
                        className="flex min-w-8 max-w-[2.5rem] shrink-0 items-center justify-center border-r border-violet-200/80 px-2 py-1 text-center text-base font-semibold leading-none text-violet-800 transition hover:bg-violet-50 active:bg-violet-100 dark:border-violet-500/30 dark:text-violet-200 dark:hover:bg-violet-950/50 dark:active:bg-violet-900/40"
                        aria-label={zoomOutLabel}
                        onClick={() => setZoomMul((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                    >
                        −
                    </button>
                    <button
                        type="button"
                        className="max-w-[4.5rem] shrink-0 truncate border-r border-violet-200/80 px-1.5 py-1 text-center text-[10px] font-semibold leading-tight text-violet-800 transition hover:bg-violet-50 active:bg-violet-100 dark:border-violet-500/30 dark:text-violet-200 dark:hover:bg-violet-950/50 dark:active:bg-violet-900/40 sm:max-w-[5.5rem] sm:text-xs"
                        title={zoomResetLabel}
                        aria-label={zoomResetLabel}
                        onClick={() => setZoomMul(DEFAULT_ZOOM_MUL)}
                    >
                        {zoomDefaultShort}
                    </button>
                    <button
                        type="button"
                        className="flex min-w-8 max-w-[2.5rem] shrink-0 items-center justify-center px-2 py-1 text-center text-base font-semibold leading-none text-violet-800 transition hover:bg-violet-50 active:bg-violet-100 dark:text-violet-200 dark:hover:bg-violet-950/50 dark:active:bg-violet-900/40"
                        aria-label={zoomInLabel}
                        onClick={() => setZoomMul((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
                    >
                        +
                    </button>
                </div>
                <button
                    type="button"
                    className="inline-flex min-h-8 max-w-full shrink-0 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-violet-200/80 bg-white/90 px-2.5 py-1 text-center text-[10px] font-semibold leading-none text-violet-800 shadow-sm transition hover:bg-violet-50 active:bg-violet-100 dark:border-violet-500/30 dark:bg-zinc-900/80 dark:text-violet-200 dark:hover:bg-violet-950/50 dark:active:bg-violet-900/40 sm:text-xs"
                    aria-label={downloadHtmlLabel}
                    onClick={onDownloadHtml}
                >
                    {downloadHtmlLabel}
                </button>
            </div>

            {selectedNode ? (
                <div className="mb-2 rounded-xl border border-violet-200/70 bg-white/95 px-3 py-2.5 shadow-sm dark:border-violet-500/25 dark:bg-zinc-900/85">
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                            {nodeDetailTitle}
                        </p>
                        <button
                            type="button"
                            className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium text-[#64748B] hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            onClick={() => setSelectedIdx(null)}
                        >
                            {dismissLabel}
                        </button>
                    </div>
                    <p className="mt-1 text-[13px] font-semibold leading-snug text-[#0f172a] dark:text-zinc-100">
                        {selectedNode.text}
                    </p>
                    <button
                        type="button"
                        className="mt-2 w-full rounded-lg border border-blue-200/90 bg-blue-50/90 px-3 py-2 text-center text-[11px] font-semibold text-blue-900 transition hover:bg-blue-100/90 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-900/50"
                        onClick={() => void copyAsk()}
                    >
                        {copied ? askCopiedLabel : copyAskLabel}
                    </button>
                </div>
            ) : null}

            <div
                ref={scrollRef}
                role="presentation"
                onMouseDown={onMouseDown}
                className={[
                    "max-h-[min(82vh,900px)] w-full cursor-grab overflow-auto rounded-xl border border-violet-200/60 bg-white/80 p-2 shadow-inner sm:p-3 dark:border-violet-500/20 dark:bg-zinc-950/50",
                    "[scrollbar-width:thin]",
                ].join(" ")}
            >
                <MindmapSvgDrawing
                    ref={svgRef}
                    layout={layout}
                    displayScale={displayScale}
                    focusFlatIndex={focusIdx}
                    selectedFlatIndex={selectedIdx}
                    onHoverIndex={setHoveredIdx}
                    onSelectIndex={onSelectIndex}
                />
            </div>
            <p className="mt-2 text-center text-[10px] leading-snug text-[#64748B] dark:text-zinc-500">
                {panHint}
            </p>
            <p className="mt-1 text-center text-[10px] leading-snug text-[#94A3B8] dark:text-zinc-500">
                {interactiveHint}
            </p>
        </div>
    );
}

export function StudyKitMindmapTree({ source }: { source: string }) {
    const { t } = useI18n();
    const roots = parseMindmapTreeSource(source);
    if (roots.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                (No tree lines — expected lines like <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">- Topic</code> with 2 spaces per sub-level.)
            </p>
        );
    }

    return (
        <div
            className={[
                "my-4 rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/90 via-white to-cyan-50/50 p-5 shadow-[0_8px_30px_-12px_rgba(124,58,237,0.25)] dark:border-violet-500/20 dark:from-violet-950/40 dark:via-zinc-950/80 dark:to-sky-950/30 dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]",
            ].join(" ")}
        >
            <p className="mb-4 text-center text-[11px] font-black uppercase tracking-[0.18em] text-violet-600/90 dark:text-violet-300/95">
                {t("studyKitMindmapDiagramTitle")}
            </p>
            <MindmapScrollCanvas
                roots={roots}
                panHint={t("studyKitMindmapPanHint")}
                interactiveHint={t("studyKitMindmapInteractiveHint")}
                zoomInLabel={t("studyKitMindmapZoomIn")}
                zoomOutLabel={t("studyKitMindmapZoomOut")}
                zoomResetLabel={t("studyKitMindmapZoomReset")}
                zoomDefaultShort={t("studyKitMindmapZoomDefaultShort")}
                downloadHtmlLabel={t("studyKitMindmapDownloadHtml")}
                nodeDetailTitle={t("studyKitMindmapNodeDetailTitle")}
                copyAskLabel={t("studyKitMindmapCopyAskPrompt")}
                askCopiedLabel={t("studyKitMindmapAskCopied")}
                dismissLabel={t("studyKitMindmapDismissNode")}
            />
        </div>
    );
}
