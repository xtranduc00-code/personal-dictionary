"use client";
import { memo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Tooltip } from "@/components/ui/Tooltip";
import { useScrollToAnswer } from "../ScrollToAnswerContext";
type Props = {
    qNum: number;
    correct: boolean | null;
    variant?: "badge" | "outline" | "border";
    label?: string;
};
function QBadgeInner({ qNum, correct, variant = "badge", label }: Props) {
    const display = label ?? String(qNum);
    const { t } = useI18n();
    const scrollToAnswer = useScrollToAnswer();
    const scrollTitle = scrollToAnswer ? t("scrollToQuestionInTranscriptTooltip").replace("{n}", String(qNum)) : undefined;
    const handleClick = () => {
        scrollToAnswer?.(qNum);
    };
    const clickableClass = scrollToAnswer ? "cursor-pointer hover:opacity-90" : "";
    if (variant === "border") {
        const color = correct === true
            ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
            : correct === false
                ? "border-red-600 bg-red-600 text-white shadow-sm"
                : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
        const El = scrollToAnswer ? "button" : "span";
        const el = (<El type={scrollToAnswer ? "button" : undefined} onClick={scrollToAnswer ? handleClick : undefined} className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border px-1 text-sm font-bold transition-colors ${color} ${clickableClass}`}>
        {display}
      </El>);
        return scrollTitle ? <Tooltip content={scrollTitle}>{el}</Tooltip> : el;
    }
    if (variant === "outline") {
        const color = correct === true
            ? "border-emerald-500 bg-emerald-50/90 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-200"
            : correct === false
                ? "border-rose-500 bg-rose-50/90 text-rose-800 dark:border-rose-600 dark:bg-rose-950/50 dark:text-rose-200"
                : "border-zinc-300 bg-white text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
        const El = scrollToAnswer ? "button" : "span";
        const el = (<El type={scrollToAnswer ? "button" : undefined} onClick={scrollToAnswer ? handleClick : undefined} className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border px-1 text-xs font-semibold transition-colors ${color} ${clickableClass}`}>
        {display}
      </El>);
        return scrollTitle ? <Tooltip content={scrollTitle}>{el}</Tooltip> : el;
    }
    const color = correct === true
        ? "bg-emerald-600 text-white shadow-sm"
        : correct === false
            ? "bg-rose-600 text-white shadow-sm"
            : "bg-zinc-700 text-white dark:bg-zinc-500 dark:text-zinc-900";
    const btn = (<button type="button" onClick={scrollToAnswer ? handleClick : undefined} className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 text-xs font-semibold transition-colors ${color} ${clickableClass}`}>
      {display}
    </button>);
    return scrollTitle ? <Tooltip content={scrollTitle}>{btn}</Tooltip> : btn;
}
export const QBadge = memo(QBadgeInner);
