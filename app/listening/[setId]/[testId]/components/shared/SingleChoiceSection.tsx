"use client";
import type { SingleChoiceQuestion } from "@/lib/listening-part-content";
import { HighlightableSegment } from "../HighlightContext";
import { tickClass, listeningTitleClass, listeningQuestionTextClass, listeningOptionClass, listeningSectionCardClass, } from "./questionStyles";
import { QBadge } from "./QBadge";
function LetterRadioCircle({ letter, selected, disabled, isWrong, isCorrect, }: {
    letter: string;
    selected: boolean;
    disabled: boolean;
    isWrong: boolean;
    isCorrect: boolean;
}) {
    const base = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors";
    const selectedStyle = "bg-blue-500 text-white ring-2 ring-blue-200 dark:bg-blue-600 dark:ring-blue-500/40";
    const unselectedStyle = "border-2 border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
    const wrongStyle = "!bg-rose-500 !text-white !ring-rose-300 dark:!ring-rose-600";
    const correctStyle = "!bg-emerald-600 !text-white !ring-emerald-300 dark:!ring-emerald-600";
    let stateClass: string;
    if (selected && disabled) {
        stateClass = isWrong ? wrongStyle : isCorrect ? correctStyle : selectedStyle;
    }
    else {
        stateClass = selected ? selectedStyle : unselectedStyle;
    }
    return (<span className={`${base} ${stateClass} ${disabled ? "cursor-default" : "cursor-pointer"}`} aria-hidden>
      {letter}
    </span>);
}
type Props = {
    instruction: string;
    questions: SingleChoiceQuestion[];
    segmentIdPrefix: string;
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    radioNamePrefix?: string;
    getCorrectAnswerText?: (qNum: number) => string | null;
    instructionOutside?: boolean;
    title?: string;
    titleSegmentId?: string;
};
export function SingleChoiceSection({ instruction, questions, segmentIdPrefix, answers, updateAnswer, isCorrect, submitted, radioNamePrefix = "sc", getCorrectAnswerText, instructionOutside, title, titleSegmentId, }: Props) {
    const seg = (path: string) => `${segmentIdPrefix}-${path}`;
    return (<>
      {!instructionOutside && (<p className={`mb-2 text-base font-semibold text-zinc-800 dark:text-zinc-200`}>
          <HighlightableSegment id={seg("single-inst")}>{instruction}</HighlightableSegment>
        </p>)}
      <section className={`${instructionOutside ? "mt-4" : "mt-4"} ${listeningSectionCardClass}`}>
        {title && (<p className="mb-4 text-center text-lg font-bold uppercase text-zinc-900 dark:text-zinc-100">
            <HighlightableSegment id={titleSegmentId ?? seg("title")}>{title}</HighlightableSegment>
          </p>)}
      <ul className="space-y-5">
        {[...questions].sort((a, b) => a.qNum - b.qNum).map(({ qNum, text, options }) => {
            const correct = isCorrect(qNum);
            const selected = answers[qNum] ?? "";
            return (<li key={qNum} className="space-y-2" data-question-number={qNum}>
              <div className="flex flex-nowrap items-start gap-2">
                <QBadge qNum={qNum} correct={correct} variant="border"/>
                <span
                  className={`min-w-0 flex-1 ${listeningQuestionTextClass}`}
                >
                  <HighlightableSegment id={seg(`q${qNum}-text`)}>
                    {text}
                  </HighlightableSegment>
                </span>
                {submitted && correct !== null && (
                  <span
                    className={`shrink-0 text-xs font-medium ${tickClass(correct)}`}
                  >
                    {correct ? "✓" : "✗"}
                  </span>
                )}
                {submitted && correct === false && getCorrectAnswerText && (
                  <span className="shrink-0 text-xs font-medium text-rose-600 dark:text-rose-400">
                    Correct: {getCorrectAnswerText(qNum)}
                  </span>
                )}
              </div>
              <ul className="space-y-3 pl-1">
                {options.map(({ letter, text: optText }) => {
                    const isWrongChoice = submitted && correct === false && selected === letter;
                    const isCorrectChoice = submitted && correct === true && selected === letter;
                    const inputId = `${segmentIdPrefix}-${qNum}-${letter}`;
                    return (<li key={letter}>
                      <label htmlFor={inputId} className={`flex items-center gap-3 ${submitted ? "cursor-default" : "cursor-pointer"}`}>
                        <input type="radio" name={`${radioNamePrefix}-q-${qNum}`} id={inputId} value={letter} checked={selected === letter} onChange={() => updateAnswer(qNum, letter)} disabled={submitted} className="sr-only"/>
                        <LetterRadioCircle letter={letter} selected={selected === letter} disabled={!!submitted} isWrong={!!isWrongChoice} isCorrect={!!isCorrectChoice}/>
                        <span className={`${listeningOptionClass} ${isWrongChoice ? "text-rose-600 dark:text-rose-400" : isCorrectChoice ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                          <HighlightableSegment id={seg(`q${qNum}-opt-${letter}`)}>
                            {optText}
                          </HighlightableSegment>
                        </span>
                      </label>
                    </li>);
                })}
              </ul>
            </li>);
        })}
      </ul>
      </section>
    </>);
}
