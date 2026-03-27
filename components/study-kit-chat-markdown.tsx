"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

/**
 * remark-math expects `$…$` / `$$…$$`; models often emit LaTeX `\(…\)` / `\[…\]`.
 */
export function normalizeLatexDelimiters(src: string): string {
    return src
        .replace(/\\\[/g, "\n$$\n")
        .replace(/\\\]/g, "\n$$\n")
        .replace(/\\\(/g, "$")
        .replace(/\\\)/g, "$");
}

const root =
    "study-kit-chat-md max-w-none text-[13px] leading-relaxed text-[#334155] dark:text-zinc-300 " +
    "[&_.katex]:text-[0.95em] [&_.katex]:text-[#0f172a] dark:[&_.katex]:text-zinc-200 " +
    "[&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto " +
    "[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 " +
    "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-5 " +
    "[&_ol]:my-1.5 [&_ol]:list-outside [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_ol]:leading-[1.55] [&_ol]:marker:font-normal [&_ol>li]:pl-1 " +
    "[&_li]:pl-0.5 [&_strong]:font-semibold [&_strong]:text-[#0f172a] dark:[&_strong]:text-zinc-100 " +
    "[&_h1]:mb-1 [&_h1]:mt-2 [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-[#0f172a] dark:[&_h1]:text-zinc-50 " +
    "[&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-[#64748B] dark:[&_h2]:text-zinc-400 " +
    "[&_h3]:mb-0.5 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-[#475569] dark:[&_h3]:text-zinc-400 " +
    "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-violet-400/70 [&_blockquote]:pl-3 [&_blockquote]:text-[#475569] dark:[&_blockquote]:text-zinc-400 " +
    "[&_code]:rounded [&_code]:bg-zinc-200/80 [&_code]:px-1 [&_code]:py-px [&_code]:text-[12px] dark:[&_code]:bg-zinc-700/70 dark:[&_code]:text-zinc-100 " +
    "[&_pre]:my-2 [&_pre]:max-h-[min(24rem,55vh)] [&_pre]:overflow-x-auto [&_pre]:overflow-y-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-zinc-200/80 [&_pre]:bg-zinc-50 [&_pre]:px-2 [&_pre]:py-3 [&_pre]:text-[12px] [&_pre]:leading-[1.55] dark:[&_pre]:border-white/10 dark:[&_pre]:bg-zinc-900/80";

export function StudyKitChatMarkdown({ markdown }: { markdown: string }) {
    const normalized = normalizeLatexDelimiters(markdown);
    return (
        <div className={root}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[
                    [rehypeKatex, { strict: false, throwOnError: false, errorColor: "#cc0000" }],
                ]}
                components={{
                    pre({ children }) {
                        return (
                            <pre className="whitespace-pre-wrap break-words">{children}</pre>
                        );
                    },
                }}
            >
                {normalized}
            </ReactMarkdown>
        </div>
    );
}
