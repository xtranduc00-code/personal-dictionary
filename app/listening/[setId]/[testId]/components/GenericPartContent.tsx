"use client";
import { memo } from "react";
import { HighlightableSegment } from "./HighlightContext";
import { QBadge } from "./shared/QBadge";
import { inputClass, listeningSectionCardClass } from "./shared/questionStyles";
type Props = {
    partNumber: 1 | 2 | 3 | 4;
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    segmentIdPrefix: string;
    getCorrectAnswerText?: (qNum: number) => string | null;
};
const start = (part: number) => (part - 1) * 10 + 1;
function GenericPartContentInner({ partNumber, answers, updateAnswer, isCorrect, submitted, segmentIdPrefix, getCorrectAnswerText, }: Props) {
    const startQ = start(partNumber);
    return (<div className="space-y-3 text-base">
      <p className="text-zinc-600 dark:text-zinc-400">
        <HighlightableSegment id={`${segmentIdPrefix}-inst`}>
          {`Questions ${startQ}–${startQ + 9}. Answer in the boxes below.`}
        </HighlightableSegment>
      </p>
      <div className={`${listeningSectionCardClass} text-[13px] text-zinc-800 dark:text-zinc-100`}>
        <ul className="space-y-2">
          {Array.from({ length: 10 }, (_, i) => {
            const qNum = startQ + i;
            const correct = isCorrect(qNum);
            const correctText = submitted && correct === false && getCorrectAnswerText
                ? getCorrectAnswerText(qNum)
                : null;
            return (<li key={qNum} className="flex items-center gap-3" data-question-number={qNum}>
                <QBadge qNum={qNum} correct={correct}/>
                <span className="flex flex-col">
                  <input type="text" value={answers[qNum] ?? ""} onChange={(e) => updateAnswer(qNum, e.target.value)} disabled={submitted} className={inputClass(correct, "min-w-[12rem]")}/>
                  {correctText && (<span className="mt-0.5 block text-xs font-medium text-rose-600 dark:text-rose-400">
                      Correct: {correctText}
                    </span>)}
                </span>
              </li>);
        })}
        </ul>
      </div>
    </div>);
}
export const GenericPartContent = memo(GenericPartContentInner);
