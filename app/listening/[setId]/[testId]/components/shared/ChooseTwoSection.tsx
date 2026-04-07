"use client";
import type { ChooseTwoBlock } from "@/lib/listening-part-content";
import { HighlightableSegment } from "../HighlightContext";
import { tickClass, listeningTitleClass, listeningOptionClass, listeningSectionCardClass, } from "./questionStyles";
import { QBadge } from "./QBadge";
function LetterCheckboxCircle({ letter, selected, disabled, isWrong, isCorrect, }: {
    letter: string;
    selected: boolean;
    disabled: boolean;
    isWrong: boolean;
    isCorrect: boolean;
}) {
    const base = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors";
    const selectedStyle = "bg-zinc-900 text-white ring-2 ring-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-500/40";
    const unselectedStyle = "border-2 border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
    const wrongStyle = "!bg-red-500 !text-white !border-2 !border-red-500 !ring-2 !ring-red-300 dark:!bg-red-600 dark:!border-red-600 dark:!ring-red-600";
    const correctStyle = "!bg-emerald-600 !text-white !ring-emerald-300 dark:!ring-emerald-600";
    let stateClass: string;
    if (selected && disabled) {
        stateClass = isWrong ? wrongStyle : isCorrect ? correctStyle : selectedStyle;
    }
    else {
        stateClass = selected ? selectedStyle : unselectedStyle;
    }
    return (<span className={`${base} ${stateClass} ${disabled ? "cursor-default" : "cursor-pointer"}`} style={isWrong ? { backgroundColor: "rgb(239 68 68)", color: "white", borderColor: "rgb(239 68 68)" } : undefined} aria-hidden>
      {letter}
    </span>);
}
type Props = {
    block: ChooseTwoBlock;
    segmentIdPrefix: string;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    getChooseTwoSelection: (primaryQ: number, secondaryQ?: number) => string[];
    toggleChooseTwo: (primaryQ: number, secondaryQ: number, letter: string) => void;
    getCorrectAnswerText?: (qNum: number) => string | null;
};
export function ChooseTwoSection({ block, segmentIdPrefix, isCorrect, submitted, getChooseTwoSelection, toggleChooseTwo, getCorrectAnswerText, }: Props) {
    const [primary, secondary] = block.qNums;
    const key = `${segmentIdPrefix}-${primary}-${secondary}`;
    const correct = !submitted
        ? null
        : block.qNums.length > 0 && block.qNums.every((n) => isCorrect(n) === true);
    const correctLetters: string[] = submitted
        ? (getCorrectAnswerText?.(primary) ?? "")
            .split(/\s*[/,]\s*/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        : [];
    return (<>
      <p className="mb-2 text-base font-semibold text-zinc-800 dark:text-zinc-200">
        <HighlightableSegment id={`${key}-inst`}>{block.instruction}</HighlightableSegment>
      </p>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="inline-flex items-center gap-1" data-question-number={primary}>
          <QBadge qNum={primary} correct={correct} variant="border" label={block.qNums.length === 2 ? `${block.qNums[0]}–${block.qNums[1]}` : undefined}/>
        </span>
        <span className={listeningTitleClass}>
          <HighlightableSegment id={`${key}-q`}>{block.question}</HighlightableSegment>
        </span>
        {submitted && correctLetters.length > 0 && !correct ? (null) : (block.qNums.map((n) => {
            const c = isCorrect(n);
            return submitted && c !== null ? (<span key={n} className={`text-xs font-medium ${tickClass(c)}`}>
                {c ? "✓" : "✗"}
              </span>) : null;
        }))}
        {submitted && correctLetters.length > 0 && !correct && (<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0 text-xs font-medium">
            {correctLetters.map((letter) => {
                const selected = getChooseTwoSelection(primary, secondary).includes(letter);
                return (<span key={letter} className={selected
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"}>
                  {selected ? "✓" : "✗"} Correct {letter}
                </span>);
            })}
          </span>)}
      </div>
      <section className={`mt-4 ${listeningSectionCardClass}`}>
      <ul className="space-y-3 pl-1">
        {block.options.map(({ letter, text }) => {
            const selected = getChooseTwoSelection(primary, secondary).includes(letter);
            const isCorrectOption = correctLetters.includes(letter);
            const isWrongChoice = submitted && correct === false && selected && !isCorrectOption;
            const isCorrectChoice = submitted && selected && isCorrectOption;
            const inputId = `${key}-${letter}`;
            return (<li key={letter}>
              <label htmlFor={inputId} className={`flex items-center gap-3 ${submitted ? "cursor-default" : "cursor-pointer"}`}>
                <input type="checkbox" id={inputId} checked={selected} onChange={() => toggleChooseTwo(primary, secondary, letter)} disabled={submitted} className="sr-only"/>
                <LetterCheckboxCircle letter={letter} selected={selected} disabled={!!submitted} isWrong={!!isWrongChoice} isCorrect={!!isCorrectChoice}/>
                <span className={`${listeningOptionClass} ${isWrongChoice ? "text-red-600 dark:text-red-400" : isCorrectChoice ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                  <HighlightableSegment id={`${key}-opt-${letter}`}>{text}</HighlightableSegment>
                </span>
              </label>
            </li>);
        })}
      </ul>
      </section>
    </>);
}
