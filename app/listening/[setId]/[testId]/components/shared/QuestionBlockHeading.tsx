"use client";
import type { ReactNode } from "react";
export function QuestionBlockHeading({ startQ, endQ, children, className = "", }: {
    startQ: number;
    endQ: number;
    children?: ReactNode;
    className?: string;
}) {
    return (<div className={className}>
      <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
        Questions {startQ} – {endQ}
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>);
}
