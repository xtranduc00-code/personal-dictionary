"use client";
import { HighlightableSegment } from "../HighlightContext";
import { QBadge } from "./QBadge";
import { listeningSectionCardClass, selectClass, tickClass } from "./questionStyles";
type Option = {
    letter: string;
    text: string;
};
type Item = {
    qNum: number;
    label: string | number;
};
type Props = {
    instruction: string;
    title?: string;
    options: Option[];
    items: Item[];
    segmentIdPrefix: string;
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    getCorrectAnswerText?: (qNum: number) => string | null;
    /** Không dùng list-disc (chỉ bật cho từng bài cần). */
    optionsPlainList?: boolean;
};
export function MatchingSection({ instruction, title, options, items, segmentIdPrefix, answers, updateAnswer, isCorrect, submitted, getCorrectAnswerText, optionsPlainList = false, }: Props) {
    const seg = (path: string) => `${segmentIdPrefix}-${path}`;
    return (<>
      <p className="mb-2 text-base font-semibold text-zinc-800 dark:text-zinc-200">
        <HighlightableSegment id={seg("inst")}>{instruction}</HighlightableSegment>
      </p>
      {title && (<p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">
          <HighlightableSegment id={seg("title")}>{title}</HighlightableSegment>
        </p>)}
      <section className={`mt-4 ${listeningSectionCardClass}`}>
      <ul
        className={
          optionsPlainList
            ? "mb-4 list-none space-y-1 pl-0 text-zinc-700 dark:text-zinc-300"
            : "mb-4 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300 [&_li]:marker:text-[0.65em]"
        }
      >
        {options.map(({ letter, text }) => (<li key={letter}>
            <span className="font-semibold">{letter}</span>{" "}
            <HighlightableSegment id={seg(`opt-${letter}`)}>{text}</HighlightableSegment>
          </li>))}
      </ul>
      <ul className="space-y-2">
        {[...items].sort((a, b) => a.qNum - b.qNum).map(({ qNum, label }) => {
            const correct = isCorrect(qNum);
            return (<li key={qNum} className="flex flex-wrap items-center gap-2" data-question-number={qNum}>
              <QBadge qNum={qNum} correct={correct} variant="border"/>
              <span className="text-zinc-700 dark:text-zinc-300">
                <HighlightableSegment id={seg(`item-${qNum}`)}>
                  {String(label)}
                </HighlightableSegment>
              </span>
              <select value={answers[qNum] ?? ""} onChange={(e) => updateAnswer(qNum, e.target.value)} disabled={submitted} className={selectClass(correct)}>
                <option value="">—</option>
                {options.map(({ letter: L }) => (<option key={L} value={L}>
                    {L}
                  </option>))}
              </select>
              {submitted && correct !== null && (<span className={`text-xs font-medium ${tickClass(correct)}`}>
                  {correct ? "✓" : "✗"}
                </span>)}
              {submitted && correct === false && getCorrectAnswerText && (<span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  Correct: {getCorrectAnswerText(qNum)}
                </span>)}
            </li>);
        })}
      </ul>
      </section>
    </>);
}
