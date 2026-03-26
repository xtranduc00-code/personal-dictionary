"use client";
import React from "react";
import type { NotesNode, NotesSection, InlinePart, } from "@/lib/listening-notes-schema";
import { QBadge } from "./QBadge";
import { inputClass } from "./questionStyles";
import { notesContentClass, notesSectionGapClass, notesTitleCenteredClass, } from "./questionStyles";
import { HighlightableSegment } from "../HighlightContext";
/** Tiêu đề dạng I. / II. … (mục lớn giữa trang như Cambridge). */
function isRomanMajorSectionTitle(title: string | undefined): boolean {
    if (!title)
        return false;
    return /^[IVX]{1,4}\.\s/.test(title.trim());
}
type RendererProps = {
    section: NotesSection;
    sectionIndex: number;
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    segmentIdPrefix: string;
    getCorrectAnswerText?: (qNum: number) => string | null;
    defaultWidth?: string;
    badgeVariant?: "badge" | "outline";
    isFirstSection?: boolean;
};
function renderInlinePart(part: InlinePart, key: string | number, textSegmentId: string, props: {
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    getCorrectAnswerText?: (qNum: number) => string | null;
    defaultWidth: string;
    badgeVariant: "badge" | "outline";
}): React.ReactNode {
    if (part.type === "text") {
        if (part.boldLabel) {
            return (<HighlightableSegment key={key} id={textSegmentId} as="strong" className="font-semibold text-zinc-900 dark:text-zinc-100">
          {part.text}
        </HighlightableSegment>);
        }
        return (<HighlightableSegment key={key} id={textSegmentId}>
        {part.text}
      </HighlightableSegment>);
    }
    const { qNum } = part;
    const correct = props.isCorrect(qNum);
    const correctText = props.submitted &&
        correct === false &&
        props.getCorrectAnswerText
        ? props.getCorrectAnswerText(qNum)
        : null;
    return (<span key={key} className="ml-2 mr-2 mb-2 inline-flex items-baseline gap-2 align-baseline" data-question-number={qNum}>
      <QBadge qNum={qNum} correct={correct} variant={props.badgeVariant}/>
      <span className="flex flex-col">
        <input type="text" value={props.answers[qNum] ?? ""} onChange={(e) => props.updateAnswer(qNum, e.target.value)} disabled={props.submitted} className={inputClass(correct, props.defaultWidth)}/>
        {correctText && (<span className="mt-0.5 block text-xs font-medium text-rose-600 dark:text-rose-400">
            Correct: {correctText}
          </span>)}
      </span>
    </span>);
}
function renderNode(node: NotesNode, nodeIndex: number, segmentIdPrefix: string, inlineProps: Parameters<typeof renderInlinePart>[3]): React.ReactNode {
    const segId = `${segmentIdPrefix}-${nodeIndex}`;
    switch (node.type) {
        case "title":
            return (<p key={nodeIndex} className={`${notesTitleCenteredClass} mb-0.5`}>
          <HighlightableSegment id={segId}>{node.text}</HighlightableSegment>
        </p>);
        case "paragraph":
            return (<p key={nodeIndex} className="leading-6">
          {node.parts.map((p, i) => renderInlinePart(p, i, `${segId}-p${i}`, inlineProps))}
        </p>);
        case "bullet": {
            const isSub = node.level === 1;
            const stripLead = (parts: typeof node.parts) => {
                if (parts.length === 0 || parts[0].type !== "text")
                    return parts;
                const re = isSub
                    ? /^(?:\u2013|-|\u2022|●|•)\s+/
                    : /^(?:●|•|\u2022)\s+/;
                const t = parts[0].text.replace(re, "");
                if (t === parts[0].text)
                    return parts;
                const next = [...parts] as typeof parts;
                (next[0] as {
                    type: "text";
                    text: string;
                }).text = t;
                return next;
            };
            const displayParts = stripLead(node.parts);
            return (<div key={nodeIndex} className={`flex items-baseline gap-2 leading-6 ${isSub ? "pl-3 sm:pl-5" : ""}`}>
          {isSub ? (<span className="shrink-0 select-none text-zinc-800 dark:text-zinc-200" aria-hidden>
              –
            </span>) : null}
          <span className="min-w-0 flex-1">
            {displayParts.map((p, i) => renderInlinePart(p, i, `${segId}-p${i}`, inlineProps))}
          </span>
        </div>);
        }
        case "row":
            return (<div key={nodeIndex} className="leading-6">
          {node.parts.map((p, i) => renderInlinePart(p, i, `${segId}-p${i}`, inlineProps))}
        </div>);
        default:
            return null;
    }
}
export function NotesStructuredRenderer({ section, sectionIndex, answers, updateAnswer, isCorrect, submitted, segmentIdPrefix, getCorrectAnswerText, defaultWidth = "min-w-[6.5rem]", badgeVariant = "outline", isFirstSection = false, }: RendererProps) {
    const prefix = `${segmentIdPrefix}-sec-${sectionIndex}`;
    const inlineProps = {
        answers,
        updateAnswer,
        isCorrect,
        submitted,
        getCorrectAnswerText,
        defaultWidth,
        badgeVariant,
    };
    const romanMajor = isRomanMajorSectionTitle(section.sectionTitle);
    const titleCentered = isFirstSection || romanMajor;
    return (<div className={sectionIndex > 0 ? notesSectionGapClass : ""}>
      {section.sectionTitle && (<p className={titleCentered
                ? `${notesTitleCenteredClass} mb-1${romanMajor && !isFirstSection ? " uppercase tracking-wide" : ""}`
                : "mb-1 text-left text-base font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-100"}>
          <HighlightableSegment id={`${prefix}-title`}>
            {section.sectionTitle}
          </HighlightableSegment>
        </p>)}
      <div className={section.sectionTitle ? "mt-1 " + notesContentClass : notesContentClass}>
        {section.nodes.map((node, i) => renderNode(node, i, `${prefix}-node`, inlineProps))}
      </div>
    </div>);
}
