"use client";

import {
    StudyKitResultMarkdown,
    studyKitSheetRootClass,
    studyKitSheetSectionH2Class,
} from "@/components/study-kit-result-markdown";
import { normalizeStudyKitSheetMarkdown } from "@/lib/study-kit-markdown-normalize";
import { splitMarkdownByTopLevelH2 } from "@/lib/study-kit-section";
import { useEffect, useMemo, useRef } from "react";

/** Block wrapper — avoid `display:contents` here (breaks vertical flow / scroll in some layouts). Parent `sheetRoot` still scopes `[&_…]` typography rules. */
const SECTION_MARKDOWN_CLASS = "exam-notes-markdown max-w-none min-w-0";

type Props = {
    /** Rendered sheet (may be quiz-truncated for display). */
    markdown: string;
    /** Scroll / click: which `##` section index is focused (drives the right-rail section chat). */
    onSectionFocus?: (index: number) => void;
    /** Visual highlight on the matching section `<h2>`. */
    activeSectionIndex?: number;
};

export function StudyKitResultSheetWithChats({
    markdown,
    onSectionFocus,
    activeSectionIndex,
}: Props) {
    const displayMd = useMemo(() => normalizeStudyKitSheetMarkdown(markdown), [markdown]);
    const { preamble, sections } = splitMarkdownByTopLevelH2(displayMd);
    const visibilityRatios = useRef<Map<number, number>>(new Map());

    useEffect(() => {
        if (sections.length === 0 || !onSectionFocus)
            return;
        visibilityRatios.current = new Map();
        const observer = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    const m = /^sk-sec-(\d+)$/.exec(e.target.id);
                    if (!m)
                        continue;
                    const idx = Number(m[1], 10);
                    visibilityRatios.current.set(idx, e.intersectionRatio);
                }
                let bestIdx = 0;
                let bestR = -1;
                for (const [idx, r] of visibilityRatios.current) {
                    if (r > bestR) {
                        bestR = r;
                        bestIdx = idx;
                    }
                }
                if (bestR > 0.02)
                    onSectionFocus(bestIdx);
            },
            { root: null, rootMargin: "-10% 0px -45% 0px", threshold: [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1] },
        );
        for (let i = 0; i < sections.length; i++) {
            const el = document.getElementById(`sk-sec-${i}`);
            if (el)
                observer.observe(el);
        }
        return () => observer.disconnect();
    }, [sections.length, onSectionFocus, displayMd]);

    const focusable = Boolean(onSectionFocus);

    if (sections.length === 0) {
        return (
            <div className={`${studyKitSheetRootClass} flex flex-col gap-6`}>
                <StudyKitResultMarkdown markdown={displayMd} wrapperClassName={SECTION_MARKDOWN_CLASS} />
            </div>
        );
    }

    return (
        <div className={`${studyKitSheetRootClass} flex flex-col gap-2`}>
            {preamble ? (
                <div className="min-w-0 shrink-0">
                    <StudyKitResultMarkdown markdown={preamble} wrapperClassName={SECTION_MARKDOWN_CLASS} />
                </div>
            ) : null}
            {sections.map((s, idx) => {
                const isFirstH2 = idx === 0 && !preamble;
                const isActive = activeSectionIndex === idx;
                return (
                    <section
                        key={`${idx}-${s.title}`}
                        id={`sk-sec-${idx}`}
                        className="scroll-mt-20 flex min-w-0 flex-col gap-3"
                    >
                        <h2
                            className={[
                                studyKitSheetSectionH2Class(isFirstH2),
                                focusable
                                    ? "cursor-pointer rounded-sm transition hover:bg-zinc-100/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-zinc-800/55"
                                    : "",
                                isActive
                                    ? "ring-1 ring-inset ring-blue-400/40 dark:ring-sky-500/40"
                                    : "",
                            ].join(" ")}
                            tabIndex={focusable ? 0 : undefined}
                            onClick={focusable ? () => onSectionFocus?.(idx) : undefined}
                            onKeyDown={
                                focusable
                                    ? (e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              onSectionFocus?.(idx);
                                          }
                                      }
                                    : undefined
                            }
                        >
                            {s.title}
                        </h2>
                        <div className="min-w-0">
                            <StudyKitResultMarkdown markdown={s.body} wrapperClassName={SECTION_MARKDOWN_CLASS} />
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
