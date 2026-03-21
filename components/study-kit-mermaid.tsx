"use client";

import { useEffect, useId, useState } from "react";

/**
 * Renders ```mermaid``` blocks from study-kit markdown (client-only).
 */
export function StudyKitMermaid({ chart }: { chart: string }) {
    const baseId = useId().replace(/[^a-zA-Z0-9]/g, "");
    const [svg, setSvg] = useState<string | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "neutral",
                    securityLevel: "loose",
                    fontFamily: "ui-sans-serif, system-ui, sans-serif",
                });
                const id = `skm-${baseId}-${Date.now()}`;
                const { svg: out } = await mermaid.render(id, chart);
                if (!cancelled)
                    setSvg(out);
            }
            catch {
                if (!cancelled)
                    setSvg(undefined);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [chart, baseId]);

    const pre = (
        <pre className="mb-4 overflow-x-auto rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#334155] dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-300">
            {chart}
        </pre>
    );

    if (!svg)
        return pre;

    return (
        <figure className="mb-4 overflow-x-auto rounded-lg border border-zinc-200/80 bg-zinc-50/90 p-3 dark:border-white/10 dark:bg-zinc-900/40">
            <div
                className="flex justify-center text-[#0f172a] dark:text-zinc-100 [&_svg]:h-auto [&_svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </figure>
    );
}
