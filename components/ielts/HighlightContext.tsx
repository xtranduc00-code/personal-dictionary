"use client";
import {
  createContext,
  Fragment,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useI18n } from "@/components/i18n-provider";
import { Tooltip } from "@/components/ui/Tooltip";
export type Highlight = {
    id: string;
    segmentId: string;
    start: number;
    end: number;
};
export type HighlightsContextValue = {
    highlights: Highlight[];
    addHighlight: (segmentId: string, start: number, end: number) => void;
    removeHighlight: (id: string) => void;
};
export const HighlightsContext = createContext<HighlightsContextValue | null>(null);
export function useHighlights() {
    const ctx = useContext(HighlightsContext);
    if (!ctx)
        return { highlights: [], addHighlight: () => { }, removeHighlight: () => { } };
    return ctx;
}

type ItalicRange = { start: number; end: number };

function mergeSegmentBreakpoints(
  len: number,
  italics: ItalicRange[],
  hilites: Highlight[],
): number[] {
  const s = new Set<number>([0, len]);
  for (const r of italics) {
    s.add(Math.max(0, Math.min(len, r.start)));
    s.add(Math.max(0, Math.min(len, r.end)));
  }
  for (const h of hilites) {
    s.add(Math.max(0, Math.min(len, h.start)));
    s.add(Math.max(0, Math.min(len, h.end)));
  }
  return [...s].sort((a, b) => a - b);
}

function intervalInsideItalic(
  a: number,
  b: number,
  italics: ItalicRange[],
): boolean {
  if (a >= b || italics.length === 0)
        return false;
  return italics.some((r) => r.start <= a && b <= r.end);
}

function highlightCovering(
  a: number,
  b: number,
  hilites: Highlight[],
): Highlight | undefined {
  return hilites.find((h) => h.start <= a && b <= h.end);
}

export function HighlightableSegment({ id, children, as = "span", className = "", italicRanges, }: {
    id: string;
    children: string;
    as?: "span" | "strong";
    className?: string;
    /** Ranges in `children` (plain text) to render as <em>; from parseEngooUnderscoreItalic. */
    italicRanges?: ItalicRange[];
}) {
    const { t } = useI18n();
    const { highlights, removeHighlight } = useHighlights();
    const segmentHighlights = useMemo(() => highlights
        .filter((h) => h.segmentId === id)
        .sort((a, b) => a.start - b.start), [highlights, id]);
    const Tag = as === "strong" ? "strong" : "span";
    const baseClass = `highlight-segment ${className}`.trim();
    const italics = italicRanges ?? [];
    const useRich = italics.length > 0 || segmentHighlights.length > 0;
    if (!useRich) {
        return (<Tag data-segment-id={id} className={baseClass}>
        {children}
      </Tag>);
    }
    const bps = mergeSegmentBreakpoints(children.length, italics, segmentHighlights);
    const parts: ReactNode[] = [];
    for (let i = 0; i < bps.length - 1; i++) {
        const a = bps[i];
        const b = bps[i + 1];
        if (a >= b)
            continue;
        const sub = children.slice(a, b);
        if (!sub)
            continue;
        let inner: ReactNode = sub;
        if (intervalInsideItalic(a, b, italics))
            inner = <em className="italic">{sub}</em>;
        const h = highlightCovering(a, b, segmentHighlights);
        if (h) {
            inner = (<Tooltip key={`h-${h.id}-${a}-${b}`} content={t("clickToRemoveHighlight")}>
          <mark className="cursor-pointer rounded bg-amber-200/90 px-0.5 text-inherit transition hover:bg-amber-300/90 dark:bg-amber-500/30 dark:hover:bg-amber-500/40" onClick={(e) => {
                    e.preventDefault();
                    removeHighlight(h.id);
                }}>
            {inner}
          </mark>
        </Tooltip>);
        }
        parts.push(<Fragment key={`${a}-${b}`}>{inner}</Fragment>);
    }
    return (<Tag data-segment-id={id} className={baseClass}>
      {parts}
    </Tag>);
}
