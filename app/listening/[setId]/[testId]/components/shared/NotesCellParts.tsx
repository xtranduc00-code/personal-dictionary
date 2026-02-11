"use client";
import React from "react";
import type { Part1CellPart } from "@/lib/listening-part-content";
import { inputClass } from "./questionStyles";
import { QBadge } from "./QBadge";
import { HighlightableSegment } from "../HighlightContext";
function plainTextForHighlightCell(text: string, bulletChar: "•" | "●", keepDashBullet: boolean): string {
    const normalized = normalizeTextForLayout(text, bulletChar, keepDashBullet);
    return normalized
        .split("\n")
        .map((line) => line.replace(/^(\s*)●\s*/u, "$1"))
        .join("\n");
}
type Props = {
    parts: Part1CellPart[];
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    segmentIdPrefix: string;
    getCorrectAnswerText?: (qNum: number) => string | null;
    defaultWidth?: string;
    badgeVariant?: "badge" | "outline";
    bulletChar?: "•" | "●";
    keepDashBullet?: boolean;
};
type NormalizedPart = Part1CellPart | {
    text: "\n";
};
function normalizeTextForLayout(text: string, bulletChar: "•" | "●", keepDashBullet: boolean): string {
    let out = keepDashBullet
        ? text
        : text.replace(/(^|\n)–\s*/g, `$1${bulletChar} `);
    out = out.replace(/([^\n\s])(●|•|–)( )/g, "$1\n$2$3");
    return out;
}
function splitTextPartByNewlines(part: Part1CellPart, bulletChar: "•" | "●", keepDashBullet: boolean): NormalizedPart[] {
    if (!("text" in part))
        return [part];
    const normalizedText = normalizeTextForLayout(part.text, bulletChar, keepDashBullet);
    if (!normalizedText.includes("\n"))
        return [{ text: normalizedText } as Part1CellPart];
    const chunks = normalizedText.split("\n");
    const result: NormalizedPart[] = [];
    chunks.forEach((chunk, idx) => {
        result.push({ text: chunk } as Part1CellPart);
        if (idx < chunks.length - 1) {
            result.push({ text: "\n" });
        }
    });
    return result;
}
function getTextContent(part: Part1CellPart): string {
    return "text" in part ? part.text : "";
}
function hasBlank(parts: Part1CellPart[]): boolean {
    return parts.some((p) => !("text" in p));
}
function isMostlyUppercase(text: string): boolean {
    const letters = text.replace(/[^a-zA-Z]/g, "");
    if (letters.length < 4)
        return false;
    const upper = letters.replace(/[^A-Z]/g, "").length;
    return upper / letters.length > 0.7;
}
function looksLikeShortTitle(text: string): boolean {
    const s = text.trim();
    if (!s)
        return false;
    if (s.length > 50)
        return false;
    if (s.includes(":"))
        return false;
    if (/[.!?]$/.test(s))
        return false;
    return isMostlyUppercase(s);
}
function looksLikeLabelPrefix(text: string): boolean {
    const s = text.trim();
    const colonIndex = s.indexOf(":");
    if (colonIndex <= 0)
        return false;
    const beforeColon = s.slice(0, colonIndex).trim();
    if (!beforeColon)
        return false;
    if (beforeColon.length > 40)
        return false;
    const words = beforeColon.split(/\s+/).filter(Boolean);
    if (words.length > 6)
        return false;
    if (/[.!?]/.test(beforeColon))
        return false;
    return true;
}
function endsLikeCompleteThought(text: string): boolean {
    const s = text.trim();
    if (!s)
        return false;
    if (/[.!?]$/.test(s))
        return true;
    if (looksLikeLabelPrefix(s) && s.length >= 24)
        return true;
    return false;
}
function normalizeParts(parts: Part1CellPart[], bulletChar: "•" | "●", keepDashBullet: boolean): NormalizedPart[] {
    return parts
        .filter((p) => !("text" in p) || p.text.length > 0)
        .flatMap((part) => splitTextPartByNewlines(part, bulletChar, keepDashBullet));
}
function splitPartsIntoLines(parts: Part1CellPart[], bulletChar: "•" | "●", keepDashBullet: boolean): Part1CellPart[][] {
    const normalized = normalizeParts(parts, bulletChar, keepDashBullet);
    const lines: Part1CellPart[][] = [];
    let current: Part1CellPart[] = [];
    let justSawBlank = false;
    const pushCurrent = () => {
        if (current.length > 0) {
            lines.push(current);
            current = [];
        }
    };
    for (const part of normalized) {
        if ("text" in part && part.text === "\n") {
            pushCurrent();
            justSawBlank = false;
            continue;
        }
        if ("text" in part) {
            const rawText = part.text;
            const trimmed = rawText.trim();
            const shouldStartNewLine = current.length > 0 &&
                trimmed.length > 0 &&
                (looksLikeShortTitle(trimmed) ||
                    looksLikeLabelPrefix(trimmed) ||
                    (justSawBlank && looksLikeLabelPrefix(trimmed)));
            if (shouldStartNewLine) {
                pushCurrent();
            }
            current.push(part as Part1CellPart);
            justSawBlank = false;
            if (endsLikeCompleteThought(rawText) && !hasBlank(current)) {
                pushCurrent();
            }
        }
        else {
            current.push(part);
            justSawBlank = true;
        }
    }
    pushCurrent();
    return lines;
}
function isCenteredTitleLine(line: Part1CellPart[]): boolean {
    if (line.length !== 1)
        return false;
    if (!("text" in line[0]))
        return false;
    const text = line[0].text.trim();
    if (!text)
        return false;
    return looksLikeShortTitle(text);
}
function renderInputPart(part: Extract<Part1CellPart, {
    blank: number;
}>, answers: Record<number, string>, updateAnswer: (qNum: number, value: string) => void, isCorrect: (qNum: number) => boolean | null, submitted: boolean, getCorrectAnswerText: ((qNum: number) => string | null) | undefined, defaultWidth: string, badgeVariant: "badge" | "outline") {
    const qNum = part.blank;
    const correct = isCorrect(qNum);
    const correctText = submitted && correct === false && getCorrectAnswerText
        ? getCorrectAnswerText(qNum)
        : null;
    return (<span key={`blank-${qNum}`} className="mx-2 mb-2 inline-flex items-baseline gap-2 align-baseline" data-question-number={qNum}>
      <QBadge qNum={qNum} correct={correct} variant={badgeVariant}/>
      <span className="flex flex-col">
        <input type="text" value={answers[qNum] ?? ""} onChange={(e) => updateAnswer(qNum, e.target.value)} disabled={submitted} className={inputClass(correct, defaultWidth)}/>
        {correctText && (<span className="mt-0.5 block text-xs font-medium text-rose-600 dark:text-rose-400">
            Correct: {correctText}
          </span>)}
      </span>
    </span>);
}
export function NotesCellParts({ parts, answers, updateAnswer, isCorrect, submitted, segmentIdPrefix, getCorrectAnswerText, defaultWidth = "w-28", badgeVariant = "badge", bulletChar = "•", keepDashBullet = false, }: Props) {
    const lines = splitPartsIntoLines(parts, bulletChar, keepDashBullet);
    return (<div className="w-full">
      {lines.map((line, lineIdx) => {
            const centeredTitle = isCenteredTitleLine(line);
            return (<div key={lineIdx} className={centeredTitle
                    ? "w-full text-center leading-6"
                    : "w-full leading-6"}>
            {line.map((part, partIdx) => {
                    if ("text" in part) {
                        const text = part.text;
                        const trimmed = text.trim();
                        if (!trimmed) {
                            return (<span key={`${lineIdx}-${partIdx}`} aria-hidden>
                      {" "}
                    </span>);
                        }
                        return (<HighlightableSegment key={`${lineIdx}-${partIdx}`} id={`${segmentIdPrefix}-${lineIdx}-${partIdx}`} className={text.includes("\n") ? "whitespace-pre-line" : ""}>
                    {plainTextForHighlightCell(text, bulletChar, keepDashBullet)}
                  </HighlightableSegment>);
                    }
                    return renderInputPart(part, answers, updateAnswer, isCorrect, submitted, getCorrectAnswerText, defaultWidth, badgeVariant);
                })}
          </div>);
        })}
    </div>);
}
