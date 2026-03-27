"use client";

import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { StudyKitMermaid } from "@/components/study-kit-mermaid";
import { StudyKitMindmapTree } from "@/components/study-kit-mindmap-tree";
import "katex/dist/katex.min.css";

function textFromChildren(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  if (
    isValidElement(children) &&
    children.props &&
    typeof children.props === "object" &&
    children.props !== null &&
    "children" in children.props
  )
    return textFromChildren(
      (children.props as { children?: ReactNode }).children,
    );
  return "";
}

type BulletAccent = "must" | "know" | "core" | "trap" | "exam" | "default";

function accentFromBulletText(text: string): BulletAccent {
  const t = text.trim();
  // Raw markdown may still contain **TAG:** before parse in edge cases; after parse, strong → "TAG:" at start.
  if (/^(\*\*)?MUST:?\*?\*?/i.test(t)) return "must";
  if (/^(\*\*)?KNOW:?\*?\*?/i.test(t)) return "know";
  if (/^(\*\*)?CORE:?\*?\*?/i.test(t)) return "core";
  if (/^(\*\*)?Trap:?\*?\*?/i.test(t)) return "trap";
  if (/^(\*\*)?Exam:?\*?\*?/i.test(t)) return "exam";
  return "default";
}

const accentLiBody: Record<Exclude<BulletAccent, "default">, string> = {
  must: "font-semibold text-[#1e293b] dark:text-zinc-100",
  know: "font-semibold text-[#1e293b] dark:text-zinc-100",
  core: "font-bold text-[#0f172a] dark:text-zinc-50",
  trap: "font-semibold text-[#1e293b] dark:text-zinc-100",
  exam: "font-semibold text-[#1e293b] dark:text-zinc-100",
};

const defaultLiText = "font-normal text-[#64748B] dark:text-zinc-400";

/** Sentence case after CORE/TRAP badge when the model left lowercase. */
function leadCapitalizeAfterTag(children: ReactNode): ReactNode {
  const arr = Children.toArray(children);
  if (arr.length === 1 && isValidElement(arr[0])) {
    const el = arr[0] as React.ReactElement<{ children?: ReactNode }>;
    if (el.type === "p") {
      const inner = leadCapitalizeAfterTag(el.props.children ?? null);
      return cloneElement(el, {}, inner);
    }
  }
  if (arr.length < 2) return children;
  const [first, ...rest] = arr;
  let done = false;
  const next = rest.map((c) => {
    if (!done && typeof c === "string") {
      done = true;
      return c.replace(
        /^(\s*)(\p{Ll})/u,
        (_, sp: string, ch: string) => sp + ch.toUpperCase(),
      );
    }
    return c;
  });
  return [first, ...next];
}

function mindmapFromPreChildren(children: ReactNode): ReactNode | null {
  const arr = Children.toArray(children);
  if (arr.length !== 1 || !isValidElement(arr[0])) return null;
  const el = arr[0] as React.ReactElement<{
    className?: string;
    children?: ReactNode;
  }>;
  const cls = el.props.className ?? "";
  if (!cls.includes("language-tree")) return null;
  const source = textFromChildren(el.props.children).replace(/\n$/, "");
  return <StudyKitMindmapTree source={source} />;
}

function mermaidFromPreChildren(children: ReactNode): string | null {
  const arr = Children.toArray(children);
  if (arr.length !== 1 || !isValidElement(arr[0])) return null;
  const el = arr[0] as React.ReactElement<{
    className?: string;
    children?: ReactNode;
  }>;
  const cls = el.props.className ?? "";
  if (!cls.includes("language-mermaid")) return null;
  return textFromChildren(el.props.children).replace(/\n$/, "");
}

/** Pastel chips: small type, heavy weight, horizontal padding + clear gap before body. */
function StrongOrBadge({ children }: { children: ReactNode }) {
  const raw = textFromChildren(children).trim();
  const chip = (abbr: string, cls: string) => (
    <span
      className={`mr-2 inline-flex h-[1.375rem] shrink-0 items-center justify-center self-center text-[9.5px] font-black uppercase leading-none tracking-[0.12em] ${cls}`}
    >
      {abbr}
    </span>
  );
  if (/^MUST:?\s*$/i.test(raw))
    return chip(
      "Must",
      "rounded px-2 py-1 text-amber-950 bg-amber-100/95 ring-1 ring-amber-400/35 dark:bg-amber-500/22 dark:text-amber-50 dark:ring-amber-400/25",
    );
  if (/^KNOW:?\s*$/i.test(raw))
    return chip(
      "Know",
      "rounded px-2 py-1 text-zinc-800 bg-zinc-200/90 ring-1 ring-zinc-400/25 dark:bg-zinc-600/35 dark:text-zinc-100 dark:ring-zinc-500/30",
    );
  if (/^CORE:?\s*$/i.test(raw))
    return chip(
      "Core",
      "rounded px-2 py-1 text-violet-950 bg-violet-200/90 ring-1 ring-violet-500/40 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:bg-violet-500/30 dark:text-violet-50 dark:ring-violet-300/35 dark:shadow-none",
    );
  if (/^Trap:?\s*$/i.test(raw))
    return chip(
      "Trap",
      "rounded px-2 py-1 text-rose-900 bg-rose-50/95 ring-1 ring-rose-300/45 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-500/25",
    );
  if (/^Exam:?\s*$/i.test(raw))
    return chip(
      "Exam",
      "rounded px-2 py-1 text-emerald-950 bg-emerald-100/95 ring-1 ring-emerald-400/35 dark:bg-emerald-500/22 dark:text-emerald-50 dark:ring-emerald-400/25",
    );
  return (
    <strong className="font-semibold text-[#0f172a] dark:text-zinc-100">
      {children}
    </strong>
  );
}

/** Shared H2 style for sectioned sheet layout (first section may use smaller top margin). */
export function studyKitSheetSectionH2Class(isFirst: boolean): string {
  const mt = isFirst ? "mt-4" : "mt-12";
  return [
    "mb-0",
    mt,
    "scroll-mt-20 border-b border-zinc-400 pb-2.5 text-[12.5px] font-black uppercase tracking-[0.1em] text-[#0f172a] dark:border-white/25 dark:text-zinc-50",
  ].join(" ");
}

const sheetRoot =
  "exam-notes-markdown max-w-none rounded-xl border border-zinc-200/60 bg-white/50 px-3 py-4 text-[15px] leading-normal text-[#334155] shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-zinc-950/30 dark:text-zinc-300 dark:shadow-none sm:px-5 sm:py-5 " +
  "[&_.katex]:text-[1.05em] [&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex]:text-[#0f172a] dark:[&_.katex]:text-zinc-200 " +
  "[&_blockquote+ul]:mt-5 [&_blockquote+ol]:mt-5 " +
  "[&_h2+blockquote+ul]:mt-2 [&_h2+blockquote+ul]:rounded-lg [&_h2+blockquote+ul]:bg-zinc-50/60 [&_h2+blockquote+ul]:px-3 [&_h2+blockquote+ul]:py-3 [&_h2+blockquote+ul]:dark:bg-zinc-900/40 " +
  "[&_h2+blockquote+ol]:mt-2 [&_h2+blockquote+ol]:rounded-lg [&_h2+blockquote+ol]:bg-zinc-50/60 [&_h2+blockquote+ol]:px-3 [&_h2+blockquote+ol]:py-3 [&_h2+blockquote+ol]:dark:bg-zinc-900/40 " +
  "[&_h2+ul]:mt-2 [&_h2+ul]:rounded-lg [&_h2+ul]:bg-zinc-50/60 [&_h2+ul]:px-3 [&_h2+ul]:py-3 [&_h2+ul]:dark:bg-zinc-900/40 " +
  "[&_h2+ol]:mt-2 [&_h2+ol]:rounded-lg [&_h2+ol]:bg-zinc-50/60 [&_h2+ol]:px-3 [&_h2+ol]:py-3 [&_h2+ol]:dark:bg-zinc-900/40 " +
  "[&_h2+blockquote+ul]:mb-10 [&_h2+blockquote+ol]:mb-10 [&_h2+ul]:mb-10 [&_h2+ol]:mb-10 " +
  "[&_ul_ul]:mt-2 [&_ul_ul]:mb-0.5 [&_ul_ul]:list-disc [&_ul_ul]:space-y-1 [&_ul_ul]:border-l-2 [&_ul_ul]:border-zinc-200/80 [&_ul_ul]:py-0.5 [&_ul_ul]:pl-4 [&_ul_ul]:text-[13px] [&_ul_ul]:leading-snug [&_ul_ul]:text-[#64748B] dark:[&_ul_ul]:border-zinc-600/55 dark:[&_ul_ul]:text-zinc-400 dark:[&_ul_ul]:marker:text-zinc-500 " +
  "[&_ul_ul>li:not([data-accent])]:py-0.5 [&_ul_ul>li:not([data-accent])]:pl-0 [&_ul_ul>li:not([data-accent])]:text-[13px] [&_ul_ul>li:not([data-accent])]:leading-snug " +
  "[&_ul_ul>li[data-accent]]:!list-none [&_ul_ul>li[data-accent]]:!pl-0";

/** Full card wrapper (border, padding) for the study sheet. */
export const studyKitSheetRootClass = sheetRoot;

export type StudyKitResultMarkdownProps = {
  markdown: string;
  /** When set, `##` headings are clickable to discuss that section in chat. */
  onSectionHeadingClick?: (headingPlainText: string) => void;
  /** Tooltip on section headings when clickable (e.g. i18n). */
  sectionHeadingHint?: string;
  /** Outer wrapper; use `contents` when nesting inside a parent that already has `sheetRoot`. */
  wrapperClassName?: string;
};

export function StudyKitResultMarkdown({
  markdown,
  onSectionHeadingClick,
  sectionHeadingHint,
  wrapperClassName = sheetRoot,
}: StudyKitResultMarkdownProps) {
  const clickable = Boolean(onSectionHeadingClick);
  return (
    <div className={wrapperClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, errorColor: "#cc0000" }]]}
        components={{
          h1({ children }) {
            return (
              <h1 className="mb-3 border-b border-zinc-200/90 pb-3 text-lg font-bold tracking-tight text-[#0f172a] dark:border-white/10 dark:text-zinc-50">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            const title = textFromChildren(children).trim();
            return (
              <h2
                className={[
                  "mb-0 mt-12 scroll-mt-20 border-b border-zinc-400 pb-2.5 text-[12.5px] font-black uppercase tracking-[0.1em] text-[#0f172a] first:mt-4 dark:border-white/25 dark:text-zinc-50",
                  clickable
                    ? "cursor-pointer rounded-sm transition hover:bg-zinc-100/90 hover:text-[#0f172a] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-50"
                    : "",
                ].join(" ")}
                tabIndex={clickable ? 0 : undefined}
                title={clickable ? sectionHeadingHint : undefined}
                onClick={clickable ? () => onSectionHeadingClick?.(title) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSectionHeadingClick?.(title);
                        }
                      }
                    : undefined
                }
              >
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-[#64748B] dark:text-zinc-400">
                {children}
              </h3>
            );
          },
          p({ children }) {
            return (
              <p className="my-1.5 text-[14px] leading-relaxed text-[#64748B] dark:text-zinc-400">
                {children}
              </p>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="mt-4 mb-0 rounded-r-lg border-l-4 border-violet-500/75 bg-violet-50/65 py-3 pl-4 pr-3 text-[15px] font-bold italic leading-snug tracking-tight text-violet-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-violet-400/50 dark:bg-violet-950/35 dark:text-violet-100 dark:shadow-none">
                {children}
              </blockquote>
            );
          },
          ul({ children }) {
            return (
              <ul className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-zinc-300/80 dark:marker:text-zinc-600">{children}</ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="my-2 list-outside list-decimal space-y-1 pl-6 text-[14px] leading-[1.55] marker:font-normal marker:text-zinc-500 [&>li]:pl-1 dark:marker:text-zinc-400">
                {children}
              </ol>
            );
          },
          li({ children }) {
            const raw = textFromChildren(children);
            const accent = accentFromBulletText(raw);
            const tagged = accent !== "default";
            const weight = tagged ? accentLiBody[accent] : defaultLiText;
            /** Plain rows: native `list-disc` bullet (ul has `pl-5`). Tagged (MUST/TRAP/…): no marker, `pl-0` so badge aligns with list left edge. */
            const plainClasses =
              "py-0.5 pl-0 text-[14px] leading-[1.55] [&>p]:my-0 [&_ul]:font-normal";
            const taggedClasses = `list-none flex flex-wrap items-start gap-x-2 gap-y-1 py-0.5 pl-0 text-[14px] leading-[1.55] [list-style-type:none] [&::marker]:hidden [&>p]:my-0 [&>p]:inline [&>p]:align-top [&>p]:leading-[1.55] [&>p]:max-w-full [&_ul]:mt-2 [&_ul]:w-full [&_ul]:basis-full [&_ul]:shrink-0 [&_ul]:font-normal ${weight}`;
            const defaultClasses = `${plainClasses} ${defaultLiText}`;
            return (
              <li
                className={tagged ? taggedClasses : defaultClasses}
                data-accent={tagged ? accent : undefined}
              >
                {tagged ? leadCapitalizeAfterTag(children) : children}
              </li>
            );
          },
          strong({ children }) {
            return <StrongOrBadge>{children}</StrongOrBadge>;
          },
          code({ className, children }) {
            const inline = !className;
            if (inline) {
              return (
                <code className="rounded bg-zinc-200/70 px-1 py-px text-[12.5px] font-medium text-zinc-800 dark:bg-zinc-700/70 dark:text-zinc-100">
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
          pre({ children }) {
            const tree = mindmapFromPreChildren(children);
            if (tree) return tree;
            const mermaidChart = mermaidFromPreChildren(children);
            if (mermaidChart) return <StudyKitMermaid chart={mermaidChart} />;
            return (
              <pre className="mb-4 overflow-x-auto overflow-y-visible rounded-lg border border-zinc-200/80 bg-white px-3 py-3 text-[13px] leading-[1.55] text-[#334155] dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-200">
                {children}
              </pre>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
